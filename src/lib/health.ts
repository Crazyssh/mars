/**
 * Health monitor — status diambil dari hasil poller (bukan ping terpisah).
 *
 * Tiap poller fetch ke provider, dia panggil recordHealth() dengan hasil:
 *   ok=true + durasi  → provider UP
 *   ok=false          → provider DOWN
 *
 * Keuntungan: gak ada request tambahan, status = kondisi order aktual.
 */

const MAX_HISTORY = 100;

export interface HealthCheck {
  at: string; // ISO timestamp
  provider: string; // "v1" | "v2" | "v3" | "v4"
  durationMs: number; // lama fetch (-1 kalau gagal)
  ok: boolean;
  error?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __marsHealth: { history: HealthCheck[] } | undefined;
}

function store() {
  if (!global.__marsHealth) {
    global.__marsHealth = { history: [] };
  }
  return global.__marsHealth;
}

/**
 * Dipanggil poller tiap selesai fetch provider.
 */
export function recordHealth(
  provider: string,
  ok: boolean,
  durationMs: number,
  error?: string
): void {
  const s = store();
  s.history.unshift({
    at: new Date().toISOString(),
    provider,
    durationMs: ok ? durationMs : -1,
    ok,
    error: error?.slice(0, 120),
  });
  if (s.history.length > MAX_HISTORY) {
    s.history.length = MAX_HISTORY;
  }
}

export function getHealthHistory(): HealthCheck[] {
  return store().history;
}

/**
 * Statistik per provider + overall, dari history poller.
 */
export function getHealthStats(): {
  totalChecks: number;
  okCount: number;
  failCount: number;
  uptimePct: number;
  duration: { min: number; max: number; avg: number; p95: number } | null;
  perProvider: Record<
    string,
    { ok: number; fail: number; uptimePct: number; lastOk: boolean | null }
  >;
  distribution: { label: string; count: number }[];
} {
  const history = getHealthHistory();
  const total = history.length;
  const okChecks = history.filter((h) => h.ok);
  const failCount = total - okChecks.length;

  const durs = okChecks
    .map((h) => h.durationMs)
    .filter((ms) => ms >= 0)
    .sort((a, b) => a - b);

  let duration: { min: number; max: number; avg: number; p95: number } | null =
    null;
  if (durs.length > 0) {
    const sum = durs.reduce((s, v) => s + v, 0);
    const p95Idx = Math.floor(durs.length * 0.95);
    duration = {
      min: durs[0],
      max: durs[durs.length - 1],
      avg: Math.round(sum / durs.length),
      p95: durs[Math.min(p95Idx, durs.length - 1)],
    };
  }

  // Per provider
  const perProvider: Record<
    string,
    { ok: number; fail: number; uptimePct: number; lastOk: boolean | null }
  > = {};
  for (const p of ["v1", "v2", "v3", "v4"]) {
    const rows = history.filter((h) => h.provider === p);
    const ok = rows.filter((h) => h.ok).length;
    const fail = rows.length - ok;
    perProvider[p] = {
      ok,
      fail,
      uptimePct: rows.length > 0 ? Math.round((ok / rows.length) * 100) : 0,
      lastOk: rows.length > 0 ? rows[0].ok : null,
    };
  }

  // Distribusi durasi
  const buckets = [
    { label: "< 1s", count: 0 },
    { label: "1-3s", count: 0 },
    { label: "3-5s", count: 0 },
    { label: "5-10s", count: 0 },
    { label: "> 10s", count: 0 },
    { label: "fail", count: 0 },
  ];
  for (const h of history) {
    if (!h.ok || h.durationMs < 0) buckets[5].count++;
    else if (h.durationMs < 1000) buckets[0].count++;
    else if (h.durationMs < 3000) buckets[1].count++;
    else if (h.durationMs < 5000) buckets[2].count++;
    else if (h.durationMs < 10000) buckets[3].count++;
    else buckets[4].count++;
  }

  return {
    totalChecks: total,
    okCount: okChecks.length,
    failCount,
    uptimePct: total > 0 ? Math.round((okChecks.length / total) * 100) : 0,
    duration,
    perProvider,
    distribution: buckets,
  };
}
