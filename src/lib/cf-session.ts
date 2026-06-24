/**
 * CF session — cf_clearance + User-Agent yang dipake SEMUA provider.
 *
 * cf_clearance itu kebind ke (IP + domain + User-Agent), BUKAN ke akun login.
 * Jadi 1 cf_clearance valid buat semua provider (v1-v4) selama 1 domain + 1 IP.
 * Yang beda per-provider cuma cookie login (PHPSESSID, user_id, expires_at).
 *
 * Modul ini:
 * - Simpan cf_clearance + UA di Setting (key mars.cf_clearance + mars.user_agent).
 * - refreshCfSession(): panggil FlareSolverr buat dapet cf_clearance fresh
 *   (kebind ke IP VPS), dedup biar gak refresh barengan.
 */
import { config } from "./config";
import { getSetting, setSetting, SETTING_KEYS } from "./settings";
import { solveCloudflare, isFlaresolverrEnabled } from "./flaresolverr";

/** cf_clearance bersama (1 nilai buat semua provider). */
export async function getSharedCfClearance(): Promise<string> {
  return (
    (await getSetting(SETTING_KEYS.MARS_CF_CLEARANCE)) ?? config.mars.cfClearance
  );
}

/** User-Agent dinamis — di-set FlareSolverr. Fallback ke config default. */
export async function getDynamicUserAgent(): Promise<string> {
  return (
    (await getSetting(SETTING_KEYS.MARS_USER_AGENT)) ?? config.mars.userAgent
  );
}

// ---- Login cookie bersama (1 akun dipake semua provider) ----
// PHPSESSID + user_id + expires_at sama buat v1-v4 karena 1 akun ditznesia.

export async function getSharedPhpsessid(): Promise<string> {
  return (await getSetting(SETTING_KEYS.MARS_PHPSESSID)) ?? config.mars.phpsessid;
}

export async function getSharedUserId(): Promise<string> {
  return (await getSetting(SETTING_KEYS.MARS_USER_ID)) ?? "";
}

export async function getSharedExpiresAt(): Promise<string> {
  return (await getSetting(SETTING_KEYS.MARS_EXPIRES_AT)) ?? "";
}

/** Simpan login cookie + cf_clearance (1 set buat semua provider). */
export async function setSharedCookies(
  phpsessid: string,
  userId: string,
  expiresAt: string,
  cfClearance: string
): Promise<void> {
  await setSetting(SETTING_KEYS.MARS_PHPSESSID, phpsessid);
  await setSetting(SETTING_KEYS.MARS_USER_ID, userId);
  await setSetting(SETTING_KEYS.MARS_EXPIRES_AT, expiresAt);
  await setSetting(SETTING_KEYS.MARS_CF_CLEARANCE, cfClearance);
}

let refreshPromise: Promise<boolean> | null = null;
let lastRefreshAt = 0;
const REFRESH_COOLDOWN_MS = 15_000;

declare global {
  // eslint-disable-next-line no-var
  var __cfRefreshTimer: NodeJS.Timeout | undefined;
}

/**
 * Mulai auto-refresh cf_clearance terjadwal (proaktif, sebelum expired).
 * Idempotent — aman dipanggil berkali-kali.
 *
 * Interval dari CF_REFRESH_MINUTES (default 15 menit, 0 = matiin).
 */
export function startCfAutoRefresh(): void {
  if (!isFlaresolverrEnabled()) {
    console.log("[cf-session] FlareSolverr off, auto-refresh gak jalan");
    return;
  }
  if (config.cfRefreshMinutes <= 0) {
    console.log("[cf-session] CF_REFRESH_MINUTES=0, auto-refresh dimatiin");
    return;
  }
  if (global.__cfRefreshTimer) return;

  const intervalMs = config.cfRefreshMinutes * 60_000;
  console.log(
    `[cf-session] auto-refresh cf_clearance tiap ${config.cfRefreshMinutes} menit`
  );

  // Refresh pertama pas startup (delay 10s biar gak barengan sama boot poller).
  setTimeout(() => {
    refreshCfSession().catch(() => undefined);
  }, 10_000);

  global.__cfRefreshTimer = setInterval(() => {
    refreshCfSession().catch(() => undefined);
  }, intervalMs);
}

/**
 * Refresh cf_clearance via FlareSolverr (dedup + cooldown).
 * Return true kalau berhasil dapet cf_clearance baru.
 *
 * Aman dipanggil dari banyak tempat sekaligus — cuma 1 refresh yang jalan.
 */
export async function refreshCfSession(): Promise<boolean> {
  if (!isFlaresolverrEnabled()) return false;

  // Dedup: kalau lagi refresh, tunggu yang itu.
  if (refreshPromise) return refreshPromise;

  // Cooldown: jangan spam FlareSolverr.
  if (Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) return false;

  refreshPromise = (async () => {
    try {
      const sol = await solveCloudflare(`${config.mars.baseUrl}/orderv3`);
      await setSetting(SETTING_KEYS.MARS_CF_CLEARANCE, sol.cfClearance);
      await setSetting(SETTING_KEYS.MARS_USER_AGENT, sol.userAgent);
      lastRefreshAt = Date.now();
      console.log(
        `[cf-session] cf_clearance refreshed via FlareSolverr (UA: ${sol.userAgent.slice(0, 40)}...)`
      );
      return true;
    } catch (e) {
      console.error(`[cf-session] refresh gagal: ${(e as Error).message}`);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
