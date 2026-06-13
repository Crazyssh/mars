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

const INTERVAL_MS = 8_000;
const PENDING_TIMEOUT_MS = 22 * 60 * 1000;
const SKIP_TICKS_ON_429 = 7;
const POLL_LIMIT = 100;

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

/**
 * Pilih client buat 1 poll utama. Karena 1 akun dipake semua provider, history
 * infoOrder sama — cukup 1 panggilan. Pakai provider enabled pertama.
 */
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

/**
 * 1 poll: ambil history sekali, return Map order_id → data.
 * null = rate limited (429), [] = error lain.
 */
async function fetchAllHistory(): Promise<HistoryOrder[] | null> {
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

async function tick(state: {
  skipUntilTick: Record<Provider, number>;
  tickCount: number;
}): Promise<void> {
  state.tickCount++;

  const allPending = await prisma.orderLog.findMany({
    where: { outcome: "pending" },
    select: { id: true, orderId: true, createdAt: true },
  });

  // Gak ada pending → tetap fetch 1x buat health check.
  if (allPending.length === 0) {
    await fetchAllHistory();
    return;
  }

  // Backoff global kalau lagi kena 429.
  if (state.tickCount < state.skipUntilTick.v1) return;

  // 1 akun = 1 history. Cukup 1 panggilan infoOrder buat semua order.
  const live = await fetchAllHistory();
  if (live === null) {
    const until = state.tickCount + SKIP_TICKS_ON_429;
    state.skipUntilTick = { v1: until, v2: until, v3: until, v4: until };
    console.warn(`[poller] rate-limited, back off ${SKIP_TICKS_ON_429} ticks`);
    return;
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
}

export function startPoller(): void {
  if (global.__marsPoller) {
    console.log("[poller] already running, skip");
    return;
  }

  console.log(
    `[poller] starting (interval=${INTERVAL_MS}ms, providers=${config.enabledProviders.join("+")})`
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
