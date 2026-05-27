/**
 * Background poller — sinkron pending orders dengan provider tiap interval.
 *
 * Strategi:
 * - Tick base 10 detik (dynamic), pake fetchHistoryFresh (update cache memory)
 * - Adaptive idle: kalau gak ada pending order > 5 menit, skip tick (gak hit provider)
 * - 429 backoff: 7 tick (~70 detik)
 *
 * Dijalanin sekali via instrumentation.ts.
 */
import { mars, MarsError } from "./mars";
import { prisma } from "./prisma";
import { syncOrderFromLive } from "./order-sync";

const INTERVAL_MS = 10_000;
const PENDING_TIMEOUT_MS = 22 * 60 * 1000;
const SKIP_TICKS_ON_429 = 7;

declare global {
  // eslint-disable-next-line no-var
  var __marsPoller:
    | {
        interval: NodeJS.Timeout;
        running: boolean;
        skipUntilTick: number;
        tickCount: number;
        lastPendingAt: number;
      }
    | undefined;
}

async function tick(state: {
  skipUntilTick: number;
  tickCount: number;
  lastPendingAt: number;
}): Promise<void> {
  state.tickCount++;
  if (state.tickCount < state.skipUntilTick) {
    return; // back-off mode, skip
  }

  const pending = await prisma.orderLog.findMany({
    where: { outcome: "pending" },
    select: { id: true, orderId: true, createdAt: true },
  });

  if (pending.length === 0) {
    // Kalau gak ada pending > 5 menit, skip tick supaya provider idle.
    // tetap update lastPendingAt = 0 untuk reset.
    return;
  }
  state.lastPendingAt = Date.now();

  let live: Awaited<ReturnType<typeof mars.fetchHistoryFresh>> = [];
  try {
    // fetchHistoryFresh hit provider + update cache. Cache TTL 7s,
    // jadi semua endpoint /api/history & /api/order/:id yang call dalam
    // window itu baca dari cache (gak hit provider).
    live = await mars.fetchHistoryFresh(1, 100);
  } catch (e) {
    if (e instanceof MarsError && e.statusCode === 429) {
      state.skipUntilTick = state.tickCount + SKIP_TICKS_ON_429;
      console.warn(
        `[poller] rate-limited (429), back off ${SKIP_TICKS_ON_429} ticks (~${
          (SKIP_TICKS_ON_429 * INTERVAL_MS) / 1000
        }s)`
      );
      return;
    }
    console.warn("[poller] fetch failed:", (e as Error).message);
    return;
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

  if (updated > 0) {
    console.log(`[poller] synced ${updated}/${pending.length} pending orders`);
  }
}

export function startPoller(): void {
  if (global.__marsPoller) {
    console.log("[poller] already running, skip");
    return;
  }

  console.log(`[poller] starting (interval=${INTERVAL_MS}ms)`);
  const state = {
    running: false,
    skipUntilTick: 0,
    tickCount: 0,
    lastPendingAt: 0,
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
