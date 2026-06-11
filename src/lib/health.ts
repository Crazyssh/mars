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
