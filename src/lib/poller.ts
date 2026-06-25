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
import { recordHealth } from "./health";
import { config } from "./config";
import type { HistoryOrder } from "./mars";

const FAST_MS = 5_000; // ada order pending → cek cepet biar OTP masuk
const IDLE_MS = 60_000; // gak ada pending → cuma health check, hemat request
const PENDING_TIMEOUT_MS = 22 * 60 * 1000;
const BACKOFF_MS = 60_000; // kena 429 → mundur 1 menit
const POLL_LIMIT = 100;
// Hedged polling: jumlah request paralel per poll.
// CATATAN: server ditznesia gampang overload — nembak paralel malah bikin
// SEMUA request (termasuk order) lebih lambat. Jadi default 1 (gak hedge).
const HEDGE_PENDING = 1; // pas ada order pending
const HEDGE_IDLE = 1; // pas idle

type Provider = "v1" | "v2" | "v3" | "v4";

declare global {
  // eslint-disable-next-line no-var
  var __marsPoller:
    | {
        timer: NodeJS.Timeout;
        running: boolean;
        stopped: boolean;
      }
    | undefined;
}

/**
 * Pilih client buat 1 poll utama. Karena 1 akun dipake semua provider, history
 * infoOrder sama — cukup 1 panggilan. Pakai provider enabled pertama.
 */
function primaryClient(): { provider: Provider; fetch: (hedge: number) => Promise<HistoryOrder[]> } {
  const enabled = config.enabledProviders;
  const p = (enabled[0] ?? "v1") as Provider;
  const fetchFn =
    p === "v1" ? (h: number) => mars.fetchHistoryHedged(h, 1, POLL_LIMIT)
    : p === "v2" ? (h: number) => mars2.fetchHistoryHedged(h, 1, POLL_LIMIT)
    : p === "v3" ? (h: number) => mars3.fetchHistoryHedged(h, 1, POLL_LIMIT)
    : (h: number) => mars4.fetchHistoryHedged(h, 1, POLL_LIMIT);
  return { provider: p, fetch: fetchFn };
}

/**
 * 1 poll: ambil history sekali (hedged), return array.
 * null = rate limited (429), [] = error lain.
 */
async function fetchAllHistory(hedge = 1): Promise<HistoryOrder[] | null> {
  const { provider, fetch } = primaryClient();
  const started = Date.now();
  try {
    const result = await fetch(hedge);
    recordHealth(provider, true, Date.now() - started);
    return result;
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof MarsError && e.statusCode === 429) {
      recordHealth(provider, false, -1, "rate limited (429)");
      return null;
    }
    recordHealth(provider, false, -1, msg);
    console.warn(`[poller] fetch failed:`, msg);
    return [];
  }
}

/**
 * 1 tick poller. Return delay (ms) buat tick berikutnya — adaptif:
 *   - ada pending  → FAST_MS (cek cepet biar OTP masuk)
 *   - gak pending  → IDLE_MS (cuma health check, hemat request)
 *   - kena 429     → BACKOFF_MS (mundur)
 */
async function tick(): Promise<number> {
  const allPending = await prisma.orderLog.findMany({
    where: { outcome: "pending" },
    select: { id: true, orderId: true, createdAt: true },
  });

  // Gak ada pending → 1x fetch buat health check, terus poll lambat.
  if (allPending.length === 0) {
    await fetchAllHistory(HEDGE_IDLE);
    return IDLE_MS;
  }

  // 1 akun = 1 history. Hedged: tembak beberapa, pakai yang pertama balik.
  const live = await fetchAllHistory(HEDGE_PENDING);
  if (live === null) {
    // Rate limited → mundur.
    console.warn(`[poller] rate-limited, backoff ${BACKOFF_MS / 1000}s`);
    return BACKOFF_MS;
  }

  const liveMap = new Map(live.map((o) => [o.order_id, o]));
  let updated = 0;
  for (const p of allPending) {
    const data = liveMap.get(p.orderId);
    if (data) {
      const changed = await syncOrderFromLive(data);
      if (changed) updated++;
    } else {
      const age = Date.now() - p.createdAt.getTime();
      if (age > PENDING_TIMEOUT_MS) {
        await prisma.orderLog
          .update({ where: { id: p.id }, data: { outcome: "expired" } })
          .catch(() => undefined);
        updated++;
      }
    }
  }
  if (updated > 0) {
    console.log(`[poller] synced ${updated}/${allPending.length}`);
  }
  return FAST_MS;
}

export function startPoller(): void {
  if (global.__marsPoller) {
    console.log("[poller] already running, skip");
    return;
  }

  console.log(
    `[poller] starting (adaptif: ${FAST_MS / 1000}s aktif / ${IDLE_MS / 1000}s idle, providers=${config.enabledProviders.join("+")})`
  );

  const state = {
    running: false,
    stopped: false,
    timer: null as unknown as NodeJS.Timeout,
  };

  const scheduleNext = (delay: number) => {
    if (state.stopped) return;
    state.timer = setTimeout(run, delay);
  };

  const run = async () => {
    if (state.running) return;
    state.running = true;
    let nextDelay = IDLE_MS;
    try {
      nextDelay = await tick();
    } catch (e) {
      console.error("[poller] tick error:", e);
      nextDelay = IDLE_MS;
    } finally {
      state.running = false;
      scheduleNext(nextDelay);
    }
  };

  global.__marsPoller = state;
  state.timer = setTimeout(run, 5_000);
}
