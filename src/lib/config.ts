import { z } from "zod";

const schema = z.object({
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET min 32 character (generate: openssl rand -base64 48)"),
  DATABASE_URL: z.string().default("file:./data/mars.db"),
  MARS_PHPSESSID: z.string().default(""),
  MARS_CF_CLEARANCE: z.string().default(""),
  MARS_BASE_URL: z.string().url().default("https://ditznesia.com"),
  MARS_USER_AGENT: z
    .string()
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
    ),
  // Provider mana yang di-poll di server ini. Comma-separated.
  // Default semua. VPS khusus v4: set ENABLED_PROVIDERS=v4
  ENABLED_PROVIDERS: z.string().default("v1,v2,v3,v4"),
  // FlareSolverr — solusi Cloudflare cf_clearance auto-refresh.
  // Kosongin kalau gak dipake. Contoh: http://localhost:8191
  FLARESOLVERR_URL: z.string().default(""),
  // Interval auto-refresh cf_clearance terjadwal (menit). 0 = matiin.
  CF_REFRESH_MINUTES: z.coerce.number().min(0).default(15),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Env vars tidak valid:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  throw new Error("Invalid env config");
}

const env = parsed.data;

export const config = {
  sessionSecret: env.SESSION_SECRET,
  databaseUrl: env.DATABASE_URL,
  enabledProviders: env.ENABLED_PROVIDERS.split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => ["v1", "v2", "v3", "v4"].includes(p)),
  mars: {
    baseUrl: env.MARS_BASE_URL.replace(/\/$/, ""),
    phpsessid: env.MARS_PHPSESSID,
    cfClearance: env.MARS_CF_CLEARANCE,
    userAgent: env.MARS_USER_AGENT,
  },
  flaresolverrUrl: env.FLARESOLVERR_URL.replace(/\/$/, ""),
  cfRefreshMinutes: env.CF_REFRESH_MINUTES,
} as const;
