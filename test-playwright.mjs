/**
 * Test: fetch infoOrder dari dalam BROWSER context (Playwright), bukan curl.
 * Tujuan: buktiin apakah pakai browser beneran bikin secepat web asli (100ms)
 * atau tetep lambat kayak curl (14-28s).
 *
 * Cara pakai di VPS:
 *   cd /opt/mars
 *   npm i -D playwright
 *   npx playwright install chromium
 *   node test-playwright.mjs
 */
import { chromium } from "playwright";

const COOKIE = {
  PHPSESSID: "a123b1b444335132215016ee310b46f0",
  user_id: "156275",
  expires_at: "1782907068",
  cf_clearance:
    "hmKzJwuNZvs_QlgE91njxsR47N12myNbHXFBVIgBRsE-1782235895-1.2.1.1-n7EuC21hwaJCxJIKiUBmdBiUcZOA6bc.4Q5ZSLIZdR.LTIh3M4s5DjXD1suSCklubHzKv2PgGsrOPvHLV3edWnNqa30k0_A3XltZ9GcgjKZ8R1HGBBglht4mJnwWg1Yz5ZZDiq1QyUnlAP4LRmnRrfsMudLLXAOHl6PeMz8Ce2NH7j8Umk0DFlpUuA9wqBoQy0Lvds2ta5CxwQTDWlJdnWMTY9YJyZUXorrpmIU9YhfM60dVT2oCzo7sAhQvOf66pIeWV_lLH3oVumMIz5Slsl5pjChf3l2UTlDDPsYDm3hcscaSuvQlpE112AiKgY82vMP_sc3fBOl_dCUos2SuzI7at0CRYs7QqjlxRmCy_rnt9zQGScG9mUDtv6nNS4drK9XpY87ohpSkYH_DFeCGr5ab.n2fU34xUZvDvnH7LS218oFqB7IgAqQk2zwHzKIdegbK1ZgpRBkdMuHO8qvaHli6KN60yHYZZ9yLXng4QArp32_8jGgoV8OOk2CyMuRa",
};

const BASE = "https://ditznesia.com";
const PATH = "/orderv3?nomor=&status=&limit=100&page=1&action=infoOrder";

async function main() {
  console.log("Launching chromium...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  });

  await context.addCookies(
    Object.entries(COOKIE).map(([name, value]) => ({
      name,
      value,
      domain: "ditznesia.com",
      path: "/",
    }))
  );

  const page = await context.newPage();

  console.log("Opening order page (warm up)...");
  const t0 = Date.now();
  await page.goto(`${BASE}/orderv3`, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log(`  page loaded in ${Date.now() - t0}ms\n`);

  console.log("Fetching infoOrder dari dalam page context 8x:");
  for (let i = 1; i <= 8; i++) {
    const start = Date.now();
    try {
      const status = await page.evaluate(async (url) => {
        const res = await fetch(url, {
          headers: { "x-requested-with": "XMLHttpRequest" },
          credentials: "include",
        });
        await res.text();
        return res.status;
      }, `${BASE}${PATH}`);
      console.log(`  #${i}  ${Date.now() - start}ms  HTTP ${status}`);
    } catch (e) {
      console.log(`  #${i}  ERROR ${(e).message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
