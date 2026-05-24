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
} as const;
