/**
 * Test: bandingin BROWSER (Playwright) vs CURL untuk 2 endpoint, di waktu sama:
 *   1. infoOrder  (GET)  → dipake POLLING
 *   2. listServices (POST country=6) → dipake CEK STOK pas ORDER
 *
 * createOrder TIDAK dites (motong saldo). listServices representatif karena
 * request order yg sebenernya beratnya mirip.
 *
 * Cara pakai di VPS:
 *   cd /opt/mars
 *   git pull
 *   npm i -D playwright
 *   npx playwright install chromium
 *   npx playwright install-deps   # kalau perlu (root)
 *   node test-playwright.mjs
 */
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const COOKIE = {
  PHPSESSID: "a123b1b444335132215016ee310b46f0",
  user_id: "156275",
  expires_at: "1782907068",
  cf_clearance:
    "hmKzJwuNZvs_QlgE91njxsR47N12myNbHXFBVIgBRsE-1782235895-1.2.1.1-n7EuC21hwaJCxJIKiUBmdBiUcZOA6bc.4Q5ZSLIZdR.LTIh3M4s5DjXD1suSCklubHzKv2PgGsrOPvHLV3edWnNqa30k0_A3XltZ9GcgjKZ8R1HGBBglht4mJnwWg1Yz5ZZDiq1QyUnlAP4LRmnRrfsMudLLXAOHl6PeMz8Ce2NH7j8Umk0DFlpUuA9wqBoQy0Lvds2ta5CxwQTDWlJdnWMTY9YJyZUXorrpmIU9YhfM60dVT2oCzo7sAhQvOf66pIeWV_lLH3oVumMIz5Slsl5pjChf3l2UTlDDPsYDm3hcscaSuvQlpE112AiKgY82vMP_sc3fBOl_dCUos2SuzI7at0CRYs7QqjlxRmCy_rnt9zQGScG9mUDtv6nNS4drK9XpY87ohpSkYH_DFeCGr5ab.n2fU34xUZvDvnH7LS218oFqB7IgAqQk2zwHzKIdegbK1ZgpRBkdMuHO8qvaHli6KN60yHYZZ9yLXng4QArp32_8jGgoV8OOk2CyMuRa",
};
const COOKIE_STR = Object.entries(COOKIE).map(([k, v]) => `${k}=${v}`).join("; ");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const BASE = "https://ditznesia.com";
const INFO = "/orderv3?nomor=&status=&limit=100&page=1&action=infoOrder";

const fmt = (ms) => (ms < 0 ? "FAIL" : `${(ms / 1000).toFixed(2)}s`);

// ---- CURL ----
async function curlInfo() {
  const start = Date.now();
  try {
    await execFileAsync("curl", [
      "-s", "-o", "/dev/null", "--compressed", "--max-time", "60",
      `${BASE}${INFO}`,
      "-H", `user-agent: ${UA}`, "-H", "x-requested-with: XMLHttpRequest",
      "-b", COOKIE_STR,
    ], { timeout: 65000 });
    return Date.now() - start;
  } catch { return -1; }
}
async function curlServices() {
  const start = Date.now();
  try {
    await execFileAsync("curl", [
      "-s", "-o", "/dev/null", "--compressed", "--max-time", "60",
      "-X", "POST", `${BASE}/orderv3`,
      "-H", `user-agent: ${UA}`, "-H", "x-requested-with: XMLHttpRequest",
      "-H", "content-type: application/x-www-form-urlencoded; charset=UTF-8",
      "--data-raw", "country=6",
      "-b", COOKIE_STR,
    ], { timeout: 65000 });
    return Date.now() - start;
  } catch { return -1; }
}

async function main() {
  console.log("Launching chromium...");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const context = await browser.newContext({ userAgent: UA });
  await context.addCookies(
    Object.entries(COOKIE).map(([name, value]) => ({ name, value, domain: "ditznesia.com", path: "/" }))
  );
  const page = await context.newPage();

  console.log("Opening order page (warm up)...");
  await page.goto(`${BASE}/orderv3`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const browserInfo = async () => {
    const start = Date.now();
    try {
      await page.evaluate(async (url) => {
        const r = await fetch(url, { headers: { "x-requested-with": "XMLHttpRequest" }, credentials: "include" });
        await r.text();
      }, `${BASE}${INFO}`);
      return Date.now() - start;
    } catch { return -1; }
  };
  const browserServices = async () => {
    const start = Date.now();
    try {
      await page.evaluate(async (base) => {
        const r = await fetch(`${base}/orderv3`, {
          method: "POST",
          headers: { "x-requested-with": "XMLHttpRequest", "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: "country=6",
          credentials: "include",
        });
        await r.text();
      }, BASE);
      return Date.now() - start;
    } catch { return -1; }
  };

  console.log("\n=== POLLING (infoOrder) — browser vs curl, 6x ===");
  console.log("  #   BROWSER     CURL");
  for (let i = 1; i <= 6; i++) {
    const b = await browserInfo();
    const c = await curlInfo();
    console.log(`  ${i}   ${fmt(b).padEnd(10)} ${fmt(c)}`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\n=== ORDER cek-stok (listServices) — browser vs curl, 6x ===");
  console.log("  #   BROWSER     CURL");
  for (let i = 1; i <= 6; i++) {
    const b = await browserServices();
    const c = await curlServices();
    console.log(`  ${i}   ${fmt(b).padEnd(10)} ${fmt(c)}`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
