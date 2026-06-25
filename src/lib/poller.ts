/**
 * Background poller — overlapping fixed-interval polling.
 *
 * Pola: tiap 5 detik tembak 1 request infoOrder, TANPA nunggu yang sebelumnya
 * selesai (overlap). Hasil yang DULUAN balik dipakai; poll lama yang baru balik
 * belakangan diabaikan (data udah keduluan yang lebih baru).
 *
 * Efek: kalau request pertama nyangkut/delay, request 5 detik berikutnya tetep
 * jalan dan bisa balik duluan → OTP tetep cepet masuk walau 1 request lemot.
 *
 * Pengaman: max 15 request barengan (MAX_INFLIGHT) biar gak ngebanjirin server
 * ditznesia yang gampang overload.
 *
 * 1 akun dipake semua provider → cukup 1 endpoint infoOrder (provider enabled
 * pertama) buat sinkron semua order.
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

const INTERVAL_MS = 5_000; // tiap 5 detik tembak (overlap, gak nunggu)
const IDLE_MS = 60_000; // gak ada pending → throttle jadi 60s (hemat)
const PENDING_TIMEOUT_MS = 22 * 60 * 1000;
const BACKOFF_MS = 60_000; // kena 429 → mundur 1 menit
const POLL_LIMIT = 100;
const MAX_INFLIGHT = 15; // max request barengan (take-first effect, anti-flood)

type Provider = "v1" | "v2" | "v3" | "v4";

declare global {
  // eslint-disable-next-line no-var
  var __marsPoller:
    | {
        timer: NodeJS.Timeout;
        stopped: boolean;
        inflight: number;
        lastAppliedStart: number;
        lastIdleFetch: number;
        backoffUntil: number;
      }
    | undefined;
}

function primaryClient(): { provider: Provider; fetch: () => Promise<HistoryOrder[]> } {
  const enabled = config.enabledProviders;
  const p = (enabled[0] ?? "v1") as Provider;
  const fetchFn =
    p === "v1" ? () => mars.fetchHistoryFresh(1, POLL_LIMIT)
    : p === "v2" ? () => mars2.fetchHistoryFresh(1, POLL_LIMIT)
    : p === "v3" ? () => mars3.fetchHistoryFresh(1, POLL_LIMIT)
    : () => mars4.fetchHistoryFresh(1, POLL_LIMIT);
  return { provider: p, fetch: fetchFn };
}

/** 1 fetch ke provider. null = rate limited, [] = error lain. */
async function fetchHistory(): Promise<HistoryOrder[] | null> {
  const { provider, fetch } = primaryClient();
  const started = Date.now();
  try {
    const result = await fetch();
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

/** Apply live history ke DB (sync OTP + expire order tua). */
async function applyLive(live: HistoryOrder[]): Promise<void> {
  const pending = await prisma.orderLog.findMany({
    where: { outcome: "pending" },
    select: { id: true, orderId: true, createdAt: true },
  });
  if (pending.length === 0) return;

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
          .update({ where: { id: p.id }, data: { outcome: "expired" } })
          .catch(() => undefined);
        updated++;
      }
    }
  }
  if (updated > 0) console.log(`[poller] synced ${updated}/${pending.length}`);
}

export function startPoller(): void {
  if (global.__marsPoller) {
    console.log("[poller] already running, skip");
    return;
  }

  console.log(
    `[poller] starting (overlap ${INTERVAL_MS / 1000}s, max ${MAX_INFLIGHT} inflight, providers=${config.enabledProviders.join("+")})`
  );

  const state = {
    timer: null as unknown as NodeJS.Timeout,
    stopped: false,
    inflight: 0,
    lastAppliedStart: 0,
    lastIdleFetch: 0,
    backoffUntil: 0,
  };
  global.__marsPoller = state;

  const launch = async () => {
    if (state.stopped) return;
    // Lagi backoff (kena 429) → skip.
    if (Date.now() < state.backoffUntil) return;
    // Anti-flood: jangan lebih dari MAX_INFLIGHT request barengan.
    if (state.inflight >= MAX_INFLIGHT) return;

    // Cek ada order pending. Kalau gak ada → throttle ke IDLE_MS (cuma health).
    const pendingCount = await prisma.orderLog.count({ where: { outcome: "pending" } });
    if (pendingCount === 0) {
      if (Date.now() - state.lastIdleFetch < IDLE_MS) return;
      state.lastIdleFetch = Date.now();
    }

    const startedAt = Date.now();
    state.inflight++;
    try {
      const live = await fetchHistory();
      if (live === null) {
        // Rate limited → mundur semua.
        state.backoffUntil = Date.now() + BACKOFF_MS;
        console.warn(`[poller] rate-limited, backoff ${BACKOFF_MS / 1000}s`);
        return;
      }
      // Take-first: cuma apply kalau poll ini LEBIH BARU dari yg udah ke-apply.
      // Poll lama yang balik belakangan (startedAt < lastAppliedStart) diabaikan.
      if (startedAt <= state.lastAppliedStart) return;
      state.lastAppliedStart = startedAt;
      await applyLive(live);
    } catch (e) {
      console.error("[poller] launch error:", e);
    } finally {
      state.inflight--;
    }
  };

  // Interval TETAP — gak nunggu launch sebelumnya selesai (overlap).
  state.timer = setInterval(() => {
    launch();
  }, INTERVAL_MS);

  // Tembakan pertama setelah 5 detik.
  setTimeout(() => launch(), 5_000);
}
