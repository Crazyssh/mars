/**
 * Settings store — key-value di DB.
 * Dipake buat simpen cookies Mars yang bisa di-update via web UI
 * (gak perlu edit .env + restart).
 */
import { prisma } from "./prisma";

const cache = new Map<string, string>();

export async function getSetting(key: string): Promise<string | null> {
  if (cache.has(key)) return cache.get(key)!;
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  cache.set(key, row.value);
  return row.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  cache.set(key, value);
}

export function invalidateCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

// Convenience keys
export const SETTING_KEYS = {
  MARS_PHPSESSID: "mars.phpsessid",
  MARS_CF_CLEARANCE: "mars.cf_clearance",
  MARS_USER_ID: "mars.user_id",
  MARS_EXPIRES_AT: "mars.expires_at",
  // User-Agent dinamis — di-set FlareSolverr biar match cf_clearance.
  MARS_USER_AGENT: "mars.user_agent",
  MARS2_PHPSESSID: "mars2.phpsessid",
  MARS2_USER_ID: "mars2.user_id",
  MARS2_EXPIRES_AT: "mars2.expires_at",
  MARS2_CF_CLEARANCE: "mars2.cf_clearance",
  MARS3_PHPSESSID: "mars3.phpsessid",
  MARS3_USER_ID: "mars3.user_id",
  MARS3_EXPIRES_AT: "mars3.expires_at",
  MARS3_CF_CLEARANCE: "mars3.cf_clearance",
  MARS4_PHPSESSID: "mars4.phpsessid",
  MARS4_USER_ID: "mars4.user_id",
  MARS4_EXPIRES_AT: "mars4.expires_at",
  MARS4_CF_CLEARANCE: "mars4.cf_clearance",
} as const;
