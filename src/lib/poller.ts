/**
 * Background poller — sinkron pending orders dengan provider tiap interval.
 *
 * Sekarang handle 2 provider: v1 (mars) & v2 (mars2).
 * Tiap tick: query DB pending order, group by provider, fetch live data dari
 * provider yang sesuai, sync ke DB.
 */
import { mars, MarsError } from "./mars";
import { mars2 } from "./mars2";
import { prisma } from "./prisma";
import { syncOrderFromLive } from "./order-sync";
import type { HistoryOrder } from "./mars";

const INTERVAL_MS = 10_000;
const PENDING_TIMEOUT_MS = 22 * 60 * 1000;
const SKIP_TICKS_ON_429 = 7;

declare global {
  // eslint-disable-next-line no-var
  var __marsPoller:
    | {
        interval: NodeJS.Timeout;
        running: boolean;
        skipUntilTickV1: number;
        skipUntilTickV2: number;
        tickCount: number;
      }
    | undefined;
}

async function fetchProviderHistory(
  provider: "v1" | "v2"
): Promise<HistoryOrder[] | null> {
  try {
    if (provider === "v1") {
      return await mars.fetchHistoryFresh(1, 100);
    }
    return await mars2.fetchHistoryFresh(1, 100);
  } catch (e) {
    if (e instanceof MarsError && e.statusCode === 429) {
      return null; // signal back-off
    }
    console.warn(`[poller] ${provider} fetch failed:`, (e as Error).message);
    return [];
  }
}

async function syncProvider(
  provider: "v1" | "v2",
  pending: { id: string; orderId: string; createdAt: Date }[]
): Promise<{ updated: number; rateLimited: boolean }> {
  if (pending.length === 0) return { updated: 0, rateLimited: false };

  const live = await fetchProviderHistory(provider);
  if (live === null) {
    return { updated: 0, rateLimited: true };
  }

  const liveMap = new Map(live.map((o) => [o.order_id, o]));
  let updated = 0;
  for (const p of pending) {
    const data = liveMap.get(p.orderId);
    if (data) {
      const changed = await syncOrderFromLive(data);
      if (changed) updated++;
    } else {
      const age = Date.now() - p.createdAt.getTime();
      if (age > PENDING_TIMEOUT_MS) {
        await prisma.orderLog
          .update({
            where: { id: p.id },
            data: { outcome: "expired" },
          })
          .catch(() => undefined);
        updated++;
      }
    }
  }
  return { updated, rateLimited: false };
}

async function tick(state: {
  skipUntilTickV1: number;
  skipUntilTickV2: number;
  tickCount: number;
}): Promise<void> {
  state.tickCount++;

  const allPending = await prisma.orderLog.findMany({
    where: { outcome: "pending" },
    select: { id: true, orderId: true, createdAt: true, provider: true },
  });

  if (allPending.length === 0) return;

  const v1Pending = allPending.filter((p) => p.provider === "v1");
  const v2Pending = allPending.filter((p) => p.provider === "v2");

  const tasks: Promise<void>[] = [];

  if (v1Pending.length > 0 && state.tickCount >= state.skipUntilTickV1) {
    tasks.push(
      syncProvider("v1", v1Pending).then((r) => {
        if (r.rateLimited) {
          state.skipUntilTickV1 = state.tickCount + SKIP_TICKS_ON_429;
          console.warn(
            `[poller] v1 rate-limited, back off ${SKIP_TICKS_ON_429} ticks`
          );
        } else if (r.updated > 0) {
          console.log(`[poller] v1 synced ${r.updated}/${v1Pending.length}`);
        }
      })
    );
  }
  if (v2Pending.length > 0 && state.tickCount >= state.skipUntilTickV2) {
    tasks.push(
      syncProvider("v2", v2Pending).then((r) => {
        if (r.rateLimited) {
          state.skipUntilTickV2 = state.tickCount + SKIP_TICKS_ON_429;
          console.warn(
            `[poller] v2 rate-limited, back off ${SKIP_TICKS_ON_429} ticks`
          );
        } else if (r.updated > 0) {
          console.log(`[poller] v2 synced ${r.updated}/${v2Pending.length}`);
        }
      })
    );
  }

  await Promise.all(tasks);
}

export function startPoller(): void {
  if (global.__marsPoller) {
    console.log("[poller] already running, skip");
    return;
  }

  console.log(`[poller] starting (interval=${INTERVAL_MS}ms, providers=v1+v2)`);
  const state = {
    running: false,
    skipUntilTickV1: 0,
    skipUntilTickV2: 0,
    tickCount: 0,
    interval: null as unknown as NodeJS.Timeout,
  };

  const run = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await tick(state);
    } catch (e) {
      console.error("[poller] tick error:", e);
    } finally {
      state.running = false;
    }
  };

  state.interval = setInterval(run, INTERVAL_MS);
  global.__marsPoller = state;

  setTimeout(run, 5_000);
}
