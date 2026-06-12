/**
 * Background poller — sinkron pending orders dengan provider tiap interval.
 *
 * Handle 4 provider: v1 (mars), v2 (mars2), v3 (mars3), v4 (mars4).
 */
import { mars, MarsError } from "./mars";
import { mars2 } from "./mars2";
import { mars3 } from "./mars3";
import { mars4 } from "./mars4";
import { prisma } from "./prisma";
import { syncOrderFromLive } from "./order-sync";
import type { HistoryOrder } from "./mars";

const INTERVAL_MS = 5_000;
const PENDING_TIMEOUT_MS = 22 * 60 * 1000;
const SKIP_TICKS_ON_429 = 7;

type Provider = "v1" | "v2" | "v3" | "v4";

declare global {
  // eslint-disable-next-line no-var
  var __marsPoller:
    | {
        interval: NodeJS.Timeout;
        running: boolean;
        skipUntilTick: Record<Provider, number>;
        tickCount: number;
      }
    | undefined;
}

async function fetchProviderHistory(
  provider: Provider
): Promise<HistoryOrder[] | null> {
  try {
    if (provider === "v1") return await mars.fetchHistoryFresh(1, 100);
    if (provider === "v2") return await mars2.fetchHistoryFresh(1, 100);
    if (provider === "v3") return await mars3.fetchHistoryFresh(1, 100);
    return await mars4.fetchHistoryFresh(1, 100);
  } catch (e) {
    if (e instanceof MarsError && e.statusCode === 429) {
      return null;
    }
    console.warn(`[poller] ${provider} fetch failed:`, (e as Error).message);
    return [];
  }
}

async function syncProvider(
  provider: Provider,
  pending: { id: string; orderId: string; createdAt: Date }[]
): Promise<{ updated: number; rateLimited: boolean }> {
  if (pending.length === 0) return { updated: 0, rateLimited: false };

  const live = await fetchProviderHistory(provider);
  if (live === null) return { updated: 0, rateLimited: true };

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
  skipUntilTick: Record<Provider, number>;
  tickCount: number;
}): Promise<void> {
  state.tickCount++;

  const allPending = await prisma.orderLog.findMany({
    where: { outcome: "pending" },
    select: { id: true, orderId: true, createdAt: true, provider: true },
  });

  if (allPending.length === 0) return;

  const grouped: Record<Provider, typeof allPending> = {
    v1: allPending.filter((p) => p.provider === "v1"),
    v2: allPending.filter((p) => p.provider === "v2"),
    v3: allPending.filter((p) => p.provider === "v3"),
    v4: allPending.filter((p) => p.provider === "v4"),
  };

  // Sequential per provider (bukan paralel) biar gak spawn 4 curl bareng —
  // mengurangi koneksi drop / rate-limit dari provider.
  for (const provider of ["v1", "v2", "v3", "v4"] as const) {
    const pending = grouped[provider];
    if (pending.length === 0) continue;
    if (state.tickCount < state.skipUntilTick[provider]) continue;

    const r = await syncProvider(provider, pending);
    if (r.rateLimited) {
      state.skipUntilTick[provider] = state.tickCount + SKIP_TICKS_ON_429;
      console.warn(
        `[poller] ${provider} rate-limited, back off ${SKIP_TICKS_ON_429} ticks`
      );
    } else if (r.updated > 0) {
      console.log(`[poller] ${provider} synced ${r.updated}/${pending.length}`);
    }
  }
}

export function startPoller(): void {
  if (global.__marsPoller) {
    console.log("[poller] already running, skip");
    return;
  }

  console.log(
    `[poller] starting (interval=${INTERVAL_MS}ms, providers=v1+v2+v3+v4)`
  );
  const state = {
    running: false,
    skipUntilTick: { v1: 0, v2: 0, v3: 0, v4: 0 } as Record<Provider, number>,
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
