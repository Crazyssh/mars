/**
 * Background poller — sinkron pending orders dengan ditznesia tiap interval.
 *
 * Tujuan:
 *  - OTP tetep di-save walaupun semua user logout / browser ditutup.
 *  - Order yang udah expired auto-marked di DB.
 *
 * Dijalanin sekali via instrumentation.ts (Next.js native bootstrap hook).
 * Singleton via global var biar gak double-start saat Next.js HMR.
 */
import { mars, MarsError } from "./mars";
import { prisma } from "./prisma";
import { syncOrderFromLive } from "./order-sync";

const INTERVAL_MS = 8_000;
const PENDING_TIMEOUT_MS = 22 * 60 * 1000;
// Kalau kena 429, skip N tick berikutnya biar ditznesia cool down.
// Total back-off = SKIP_TICKS_ON_429 * INTERVAL_MS = 60 detik
const SKIP_TICKS_ON_429 = 7;

declare global {
  // eslint-disable-next-line no-var
  var __marsPoller:
    | { interval: NodeJS.Timeout; running: boolean; skipUntilTick: number; tickCount: number }
    | undefined;
}

async function tick(state: {
  skipUntilTick: number;
  tickCount: number;
}): Promise<void> {
  state.tickCount++;
  if (state.tickCount < state.skipUntilTick) {
    return; // back-off mode, skip
  }

  const pending = await prisma.orderLog.findMany({
    where: { outcome: "pending" },
    select: { id: true, orderId: true, createdAt: true },
  });
  if (pending.length === 0) return;

  let live: Awaited<ReturnType<typeof mars.getHistoryAll>> = [];
  try {
    live = await mars.getHistoryAll(1);
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
    console.warn("[poller] getHistoryAll failed:", (e as Error).message);
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
