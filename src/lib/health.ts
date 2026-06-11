/**
 * Health monitor — ping ditznesia.com tiap 10 menit, ukur TTFB & total time.
 * Simpan history di memory (last 50 check). Ditampilkan di /admin/health.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config";

const execFileAsync = promisify(execFile);
const CURL_BINARY = process.platform === "win32" ? "curl.exe" : "curl";

const INTERVAL_MS = 10 * 1000; // 10 detik
const MAX_HISTORY = 50;

export interface HealthCheck {
  at: string; // ISO timestamp
  ttfbMs: number;
  totalMs: number;
  httpCode: number;
  ok: boolean;
  error?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __marsHealth:
    | { history: HealthCheck[]; interval: NodeJS.Timeout; running: boolean }
    | undefined;
}

async function runCheck(): Promise<HealthCheck> {
  const url = `${config.mars.baseUrl}/`;
  try {
    const { stdout } = await execFileAsync(
      CURL_BINARY,
      [
        "-sS",
        "-o", process.platform === "win32" ? "NUL" : "/dev/null",
        "-w", "%{time_starttransfer}|%{time_total}|%{http_code}",
        "--max-time", "60",
        url,
      ],
      { timeout: 65_000 }
    );
    const [ttfb, total, code] = stdout.trim().split("|");
    const httpCode = parseInt(code, 10) || 0;
    return {
      at: new Date().toISOString(),
      ttfbMs: Math.round(parseFloat(ttfb) * 1000),
      totalMs: Math.round(parseFloat(total) * 1000),
      httpCode,
      ok: httpCode >= 200 && httpCode < 400,
    };
  } catch (e) {
    return {
      at: new Date().toISOString(),
      ttfbMs: -1,
      totalMs: -1,
      httpCode: 0,
      ok: false,
      error: (e as Error).message.slice(0, 120),
    };
  }
}

export function getHealthHistory(): HealthCheck[] {
  return global.__marsHealth?.history ?? [];
}

/**
 * Jalanin satu check manual (dipanggil dari tombol di web). Hasil masuk history.
 */
export async function runManualCheck(): Promise<HealthCheck> {
  const check = await runCheck();
  if (global.__marsHealth) {
    global.__marsHealth.history.unshift(check);
    if (global.__marsHealth.history.length > MAX_HISTORY) {
      global.__marsHealth.history.length = MAX_HISTORY;
    }
  }
  return check;
}

/**
 * Hitung statistik dari history (cuma yang sukses untuk TTFB stats).
 */
export function getHealthStats(): {
  totalChecks: number;
  okCount: number;
  failCount: number;
  uptimePct: number;
  ttfb: { min: number; max: number; avg: number; p95: number } | null;
  distribution: { label: string; count: number }[];
} {
  const history = getHealthHistory();
  const total = history.length;
  const okChecks = history.filter((h) => h.ok);
  const failCount = total - okChecks.length;

  const ttfbs = okChecks
    .map((h) => h.ttfbMs)
    .filter((ms) => ms >= 0)
    .sort((a, b) => a - b);

  let ttfb: { min: number; max: number; avg: number; p95: number } | null = null;
  if (ttfbs.length > 0) {
    const sum = ttfbs.reduce((s, v) => s + v, 0);
    const p95Idx = Math.floor(ttfbs.length * 0.95);
    ttfb = {
      min: ttfbs[0],
      max: ttfbs[ttfbs.length - 1],
      avg: Math.round(sum / ttfbs.length),
      p95: ttfbs[Math.min(p95Idx, ttfbs.length - 1)],
    };
  }

  // Distribusi latency bucket
  const buckets = [
    { label: "< 1s", count: 0 },
    { label: "1-3s", count: 0 },
    { label: "3-5s", count: 0 },
    { label: "5-10s", count: 0 },
    { label: "> 10s", count: 0 },
    { label: "fail", count: 0 },
  ];
  for (const h of history) {
    if (!h.ok || h.ttfbMs < 0) buckets[5].count++;
    else if (h.ttfbMs < 1000) buckets[0].count++;
    else if (h.ttfbMs < 3000) buckets[1].count++;
    else if (h.ttfbMs < 5000) buckets[2].count++;
    else if (h.ttfbMs < 10000) buckets[3].count++;
    else buckets[4].count++;
  }

  return {
    totalChecks: total,
    okCount: okChecks.length,
    failCount,
    uptimePct: total > 0 ? Math.round((okChecks.length / total) * 100) : 0,
    ttfb,
    distribution: buckets,
  };
}

export function startHealthMonitor(): void {
  if (global.__marsHealth) {
    console.log("[health] already running, skip");
    return;
  }
  console.log(`[health] starting (interval=${INTERVAL_MS / 1000}s)`);

  const state = {
    history: [] as HealthCheck[],
    running: false,
    interval: null as unknown as NodeJS.Timeout,
  };

  const run = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const check = await runCheck();
      state.history.unshift(check); // terbaru di depan
      if (state.history.length > MAX_HISTORY) {
        state.history.length = MAX_HISTORY;
      }
      console.log(
        `[health] ${check.ok ? "OK" : "FAIL"} ttfb=${check.ttfbMs}ms http=${check.httpCode}`
      );
    } catch (e) {
      console.error("[health] check error:", e);
    } finally {
      state.running = false;
    }
  };

  state.interval = setInterval(run, INTERVAL_MS);
  global.__marsHealth = state;

  // First check setelah 10 detik (biar gak nubruk startup)
  setTimeout(run, 10_000);
}
