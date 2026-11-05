import { test, expect } from 'e2e';
import { chromium, type Page } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { WEB } from './lib.ts';

// Pixel proof of the sales desk screen (docs/specs/sales-desk-reference.md section 5): the reference calculator (read-only GET of its page, nothing submitted)
// and our /desk-ref-preview (build with NEXT_PUBLIC_DESK_PREVIEW=1), same viewport, same sample (one 10 g bar, manual sell price 6255, total 72,236),
// the desk element only. Diff images and the share of different pixels go to .shots/desk-pixel/. Run on the logic target, with E2E_PORT = the preview server's port.
const P = { platforms: ['node'] };
const REF = 'https://gold-transactions-gleem.eradocg.workers.dev/';
const OUT = new URL('../.shots/desk-pixel/', import.meta.url);
const LIMIT = 1; // percent of different pixels
const SIZES = [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 390, height: 844 }];

async function withPages<T>(size: { width: number; height: number }, theme: 'light' | 'dark', run: (ref: Page, ours: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: size, locale: 'ar-EG', timezoneId: 'Africa/Cairo', deviceScaleFactor: 1 });
    await ctx.addCookies([{ name: 'better-auth.session_token', value: 'pixel-proof', url: WEB }]); // the proxy only checks that a session cookie exists
    const ref = await ctx.newPage();
    const ours = await ctx.newPage();
    // The reference reads its prices and settings from its own API: fix the prices (manual price wins anyway), keep the built-in settings, no welcome dialog.
    await ref.route('**/api/prices**', (r) => r.fulfill({ json: { ok: true, metal: 'gold', sell: 6255, buy: 6100, readAt: '2026-11-05T10:00:00.000Z' } }));
    await ref.route('**/api/config', (r) => r.abort());
    await ref.addInitScript((t) => { try { localStorage.setItem('goldTheme', t); localStorage.setItem('goldSilverWelcomeV2', 'seen'); } catch {} }, theme);
    await ref.goto(REF, { waitUntil: 'networkidle' });
    await ref.locator('#priceStatus.ok').waitFor();
    await ref.fill('#manualSell', '6255');
    await ours.goto(`${WEB}/ar/desk-ref-preview?theme=${theme}`, { waitUntil: 'networkidle' });
    await ours.locator('[data-desk-layout]').waitFor();
    await ours.focus('#manualSell'); // the reference's fill left the focus on this input
    for (const p of [ref, ours]) await p.evaluate(() => document.fonts.ready);
    return await run(ref, ours);
  } finally {
    await browser.close();
  }
}

/** Compares two PNGs (the smaller is padded with magenta, so a size difference counts as different pixels). */
function compare(name: string, a: Buffer, b: Buffer) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
  const pad = (img: PNG) => {
    const out = new PNG({ width: w, height: h });
    for (let i = 0; i < out.data.length; i += 4) out.data.set([255, 0, 255, 255], i);
    PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
    return out;
  };
  const [pa, pb] = [pad(A), pad(B)];
  const diff = new PNG({ width: w, height: h });
  const different = pixelmatch(pa.data, pb.data, diff.data, w, h, { threshold: 0.1 });
  const percent = (different / (w * h)) * 100;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL(`${name}-ref.png`, OUT), a);
  writeFileSync(new URL(`${name}-ours.png`, OUT), b);
  writeFileSync(new URL(`${name}-diff.png`, OUT), PNG.sync.write(diff));
  writeFileSync(new URL(`${name}.txt`, OUT), `${name}: ${percent.toFixed(3)}% different (${different} of ${w * h} px); reference ${A.width}x${A.height}, ours ${B.width}x${B.height}\n`);
  console.log(`desk-pixel ${name}: ${percent.toFixed(3)}% different (${different} of ${w * h}); ref ${A.width}x${A.height}, ours ${B.width}x${B.height}`);
  return { percent, sameSize: A.width === B.width && A.height === B.height };
}

// Our desk has no fee-editor panel (the owner prohibited it), and the sticky bar and toast sit outside the desk element: hide them in both so only the desk is compared.
const HIDE_REF = `main.layout > section:nth-of-type(2) > .panel:nth-of-type(2), #mobileBar, #toast { display: none !important }`;
const HIDE_OURS = `#mobileBar, #toast { display: none !important }`;

for (const size of SIZES) {
  for (const theme of ['light', 'dark'] as const) {
    const name = `desk-${size.width}-${theme}`;
    test(`desk pixels: ${name}`, { ...P, tags: ['ui', 'pixel'] }, async () => {
      await withPages(size, theme, async (ref, ours) => {
        await ref.addStyleTag({ content: HIDE_REF });
        await ours.addStyleTag({ content: HIDE_OURS });
        // The reference's header has a fractional height, which puts its desk on a half pixel (a 1 px smear in the screenshot): pull it onto a whole pixel.
        for (const [p, q] of [[ref, 'main.layout'], [ours, '[data-desk-layout]']] as const) {
          await p.evaluate((sel) => { const e = document.querySelector<HTMLElement>(sel)!; const f = e.getBoundingClientRect().top + scrollY; if (f % 1) e.style.marginTop = `calc(${getComputedStyle(e).marginTop} - ${f % 1}px)`; }, q);
        }
        await ref.waitForTimeout(500);
        const shot = (p: Page, q: string) => p.locator(q).screenshot({ animations: 'disabled', caret: 'hide' });
        const r = compare(name, await shot(ref, 'main.layout'), await shot(ours, '[data-desk-layout]'));
        expect(r.percent).toBeLessThan(LIMIT);
      });
    });
  }
}

// The sticky bar with the total and Copy (phone only): the fixed element on both pages.
for (const theme of ['light', 'dark'] as const) {
  test(`desk pixels: mobile bar 390 ${theme}`, { ...P, tags: ['ui', 'pixel'] }, async () => {
    await withPages(SIZES[2], theme, async (ref, ours) => {
      await ref.addStyleTag({ content: '#toast { display: none !important }' });
      await ours.addStyleTag({ content: '#toast { display: none !important }' });
      await ref.waitForTimeout(500);
      const shot = (p: Page) => p.locator('#mobileBar').screenshot({ animations: 'disabled', caret: 'hide' });
      const r = compare(`bar-390-${theme}`, await shot(ref), await shot(ours));
      expect(r.percent).toBeLessThan(LIMIT);
    });
  });
}
