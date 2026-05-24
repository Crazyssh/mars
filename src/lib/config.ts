import { z } from "zod";

const schema = z.object({
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET min 32 character (generate: openssl rand -base64 48)"),
  DATABASE_URL: z.string().default("file:./data/mars.db"),
  MARS_PHPSESSID: z.string().min(1),
  MARS_CF_CLEARANCE: z.string().min(1),
  MARS_BASE_URL: z.string().url().default("https://ditznesia.id"),
  MARS_USER_AGENT: z
    .string()
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    ),
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
  mars: {
    baseUrl: env.MARS_BASE_URL.replace(/\/$/, ""),
    phpsessid: env.MARS_PHPSESSID,
    cfClearance: env.MARS_CF_CLEARANCE,
    userAgent: env.MARS_USER_AGENT,
  },
} as const;
