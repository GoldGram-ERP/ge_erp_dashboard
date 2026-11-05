// Same-input screenshots of the reference calculator and of our desk (headless), for the visual diff of docs/specs/sales-desk-reference.md section 5.
//   node scripts/desk-d2b-shots.mjs   (our dashboard on 3110 and backend on 8110 must be up, seeded by scripts/desk-d2b-seed.mjs)
// Inputs: Sell, Gold, cash, one 10 g gold bar, typed sell price 6255 (the reference's own sample); light, then dark. Output: .shots/desk-d2b/<name>.png
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ?? "../e2e-tests/node_modules/playwright-core");

const WEB = process.env.WEB ?? "http://localhost:3110", API = process.env.API ?? "http://localhost:8110";
const REF = "https://gold-transactions-gleem.eradocg.workers.dev/";
const OUT = new URL("../.shots/desk-d2b/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const user = process.env.DESK_USER ?? "agent1", pass = process.env.DESK_PASS ?? "Correct-Horse-9", bar = process.env.DESK_BAR ?? "Desk gold bar 21";

const cookie = async () => {
  const r = await fetch(`${API}/access/sign-in`, { method: "POST", headers: { "content-type": "application/json", origin: WEB }, body: JSON.stringify({ email: `${user}@example.com`, password: pass }) });
  const raw = r.headers.get("set-cookie").split(";")[0], i = raw.indexOf("=");
  return { name: raw.slice(0, i), value: raw.slice(i + 1) };
};
const browser = await chromium.launch({ headless: true });
const c = await cookie();
for (const [size, vp] of Object.entries(SIZES).filter(([k]) => !process.env.SIZE || k === process.env.SIZE)) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: vp, locale: "ar-EG", timezoneId: "Africa/Cairo", deviceScaleFactor: 1 });
    const ref = await ctx.newPage();
    await ref.route("**/api/prices**", (r) => r.fulfill({ json: { ok: true, metal: "gold", sell: 6255, buy: 6100, readAt: "2026-11-05T10:00:00.000Z" } }));
    await ref.route("**/api/config", (r) => r.abort());
    await ref.addInitScript((t) => { try { localStorage.setItem("goldTheme", t); localStorage.setItem("goldSilverWelcomeV2", "seen"); } catch {} }, theme);
    await ref.goto(REF, { waitUntil: "networkidle" });
    await ref.locator("#priceStatus.ok").waitFor();
    await ref.fill("#manualSell", "6255");
    await ref.evaluate(() => document.fonts.ready);
    await ref.screenshot({ path: new URL(`ref-${size}-${theme}.png`, OUT).pathname.slice(1), fullPage: true });

    await ctx.addCookies([{ name: c.name, value: c.value, url: WEB }]);
    await ctx.addInitScript((t) => localStorage.setItem("ge-erp:desk-theme", t), theme);
    const ours = await ctx.newPage();
    await ours.goto(`${WEB}/ar/sales/desk?new=draft`, { waitUntil: "networkidle" });
    for (let t = 0; t < 3; t++) { // the item list loads after the page: open again until the option is there
      await ours.waitForTimeout(1500);
      await ours.locator("#it0-btn").click();
      if (await ours.locator(`[role=option]:has-text("${bar}")`).first().click({ timeout: 4000 }).then(() => true, () => false)) break;
      await ours.keyboard.press("Escape");
    }
    await ours.fill("#f-manualsell", "6255");
    await ours.locator("#sd-total").filter({ hasNotText: "—" }).waitFor();
    await ours.evaluate(() => document.fonts.ready);
    await ours.setViewportSize({ width: vp.width, height: 3400 }); // the app scrolls inside its shell: a tall window shows the whole desk
    await ours.waitForTimeout(500);
    await ours.locator("#sd .desk-ref").screenshot({ path: new URL(`ours-${size}-${theme}.png`, OUT).pathname.slice(1) });
    await ctx.close();
  }
}
await browser.close();
console.log("shots in", OUT.pathname);
