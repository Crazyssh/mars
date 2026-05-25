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
import { mars } from "./mars";
import { prisma } from "./prisma";
import { syncOrderFromLive } from "./order-sync";

const INTERVAL_MS = 8_000;
// OTP lifetime ditznesia ~20 menit. Pake 22 menit sebagai safety buffer
// supaya kalau ada delay di ditznesia, kita gak salah mark expired.
const PENDING_TIMEOUT_MS = 22 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __marsPoller: { interval: NodeJS.Timeout; running: boolean } | undefined;
}

async function tick(): Promise<void> {
  // 1. Cek apa ada order PENDING di DB
  const pending = await prisma.orderLog.findMany({
    where: { outcome: "pending" },
    select: { id: true, orderId: true, createdAt: true },
  });
  if (pending.length === 0) return;

  // 2. Fetch live data dari ditznesia — multi-page (≈100 row)
  let live: Awaited<ReturnType<typeof mars.getHistoryAll>> = [];
  try {
    live = await mars.getHistoryAll(10);
  } catch (e) {
    console.warn("[poller] getHistoryAll failed:", (e as Error).message);
    return;
  }
  const liveMap = new Map(live.map((o) => [o.order_id, o]));

  // 3. Sync masing-masing pending
  let updated = 0;
  for (const p of pending) {
    const data = liveMap.get(p.orderId);
    if (data) {
      const changed = await syncOrderFromLive(data);
      if (changed) updated++;
    } else {
      // Order udah keluar dari page 1 ditznesia. Kalau udah > 30 menit pending,
      // anggap expired biar DB gak nyampah.
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
  const state = { running: false, interval: null as unknown as NodeJS.Timeout };

  const run = async () => {
    if (state.running) return; // skip kalau tick sebelumnya belum kelar
    state.running = true;
    try {
      await tick();
    } catch (e) {
      console.error("[poller] tick error:", e);
    } finally {
      state.running = false;
    }
  };

  state.interval = setInterval(run, INTERVAL_MS);
  global.__marsPoller = state;

  // Initial tick (delayed sedikit biar gak nubruk app startup)
  setTimeout(run, 5_000);
}
