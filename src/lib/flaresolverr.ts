/**
 * FlareSolverr integration — auto-solve Cloudflare challenge.
 *
 * Masalah: cf_clearance kebind ke IP yang generate cookie. Cookie dari PC/browser
 * lokal gak jalan dari IP VPS (403). Solusi: FlareSolverr jalan DI VPS, pakai
 * headless Chrome buat nyelesaiin challenge → cf_clearance kebind ke IP VPS.
 *
 * Cara pakai:
 *   1. Jalanin FlareSolverr di VPS (Docker):
 *      docker run -d --name flaresolverr -p 8191:8191 --restart unless-stopped \
 *        ghcr.io/flaresolverr/flaresolverr:latest
 *   2. Set env: FLARESOLVERR_URL=http://localhost:8191
 *   3. App auto-refresh cf_clearance pas kena 403.
 *
 * FlareSolverr API: POST {url}/v1 dengan body { cmd: "request.get", url, ... }
 * Response berisi solution.cookies[] + solution.userAgent.
 */
import { config } from "./config";

export interface CfSolution {
  cfClearance: string;
  userAgent: string;
  /** PHPSESSID kalau ke-set oleh server (jarang, biasanya udah ada). */
  phpsessid?: string;
}

interface FlareSolverrResponse {
  status: string;
  message: string;
  solution?: {
    url: string;
    status: number;
    userAgent: string;
    cookies: Array<{ name: string; value: string }>;
  };
}

export function isFlaresolverrEnabled(): boolean {
  return config.flaresolverrUrl.length > 0;
}

/**
 * Minta FlareSolverr nyelesaiin Cloudflare challenge untuk targetUrl.
 * Return cf_clearance + userAgent yang valid (kebind ke IP VPS).
 *
 * Throw kalau FlareSolverr gak available / gagal solve.
 */
export async function solveCloudflare(
  targetUrl: string,
  existingCookies?: Record<string, string>
): Promise<CfSolution> {
  if (!isFlaresolverrEnabled()) {
    throw new Error("FLARESOLVERR_URL belum di-set");
  }

  const cookies = existingCookies
    ? Object.entries(existingCookies)
        .filter(([, v]) => v)
        .map(([name, value]) => ({ name, value }))
    : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${config.flaresolverrUrl}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        cmd: "request.get",
        url: targetUrl,
        maxTimeout: 80_000,
        ...(cookies ? { cookies } : {}),
      }),
    });

    const data = (await res.json()) as FlareSolverrResponse;
    if (data.status !== "ok" || !data.solution) {
      throw new Error(`FlareSolverr gagal: ${data.message || data.status}`);
    }

    const cf = data.solution.cookies.find((c) => c.name === "cf_clearance");
    if (!cf) {
      throw new Error(
        "FlareSolverr selesai tapi gak dapet cf_clearance (mungkin gak ada challenge)"
      );
    }
    const php = data.solution.cookies.find((c) => c.name === "PHPSESSID");

    return {
      cfClearance: cf.value,
      userAgent: data.solution.userAgent,
      phpsessid: php?.value,
    };
  } finally {
    clearTimeout(timeout);
  }
}
