import { test, expect, NAV, LANGS } from './lib.ts';

// Arabic needs room inside a text box: an <input> clips whatever goes past its own box (overflow: clip), and many Arabic fonts are taller than
// 1.7 x the font size, so a box exactly one line high cuts the bottom of the letters (the owner's live screenshots: the filter search
// 'ابحث برقم الفاتورة' and a code/name filter). Every visible text input/textarea must be at least as tall as the CONTENT AREA of a tall Arabic
// font (line-height: normal of Sakkal Majalla / Traditional Arabic, measured here with a twin element) and at least 1.85 x its font size.
const ROUTES = ['/', '/account', ...NAV.flatMap((g) => g.items.map((i) => i.route)), '/control/security?new=policy', '/sales/desk?new=draft'];

test('text boxes have room for tall Arabic fonts on every page (ar)', { tags: ['audit'], requires: ['browser'] }, async ({ go, browser }) => {
  const bad: string[] = [];
  for (const route of ROUTES) {
    await go('superadmin', route, 'ar');
    await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 }).catch(() => {});
    // One evaluate per page, one walk over the DOM: read everything first, then measure each distinct (font size, tall font) once on a single twin
    // (a twin per input per font laid the page out again hundreds of times and timed out on a rich database).
    const hits = await browser.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 800));
      const TALL = ['Sakkal Majalla', 'Traditional Arabic', 'Arabic Typesetting'];
      const out: string[] = [];
      const tagOf = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ')[0]}`;
      const lineBad = (lh: string, fs: number) => !(parseFloat(lh) >= fs * 1.85 - 0.5);
      const sizes = new Set<string>();
      const boxes: { tag: string; input: boolean; fsText: string; fs: number; h: number; lh: string }[] = [];
      for (const e of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement>('input, textarea, select, .sel-btn')) {
        const r = e.getBoundingClientRect(), pick = e.matches('select, .sel-btn');
        if (pick ? r.height <= 0 : !(r.width > 40 && r.height > 0 && !['checkbox', 'radio', 'hidden', 'range', 'file', 'color', 'button', 'submit'].includes((e as HTMLInputElement).type))) continue;
        const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize), tag = tagOf(e);
        if (lineBad(cs.lineHeight, fs)) out.push(`${tag}: line-height ${cs.lineHeight} for ${fs}px text (< 1.85 x)`);
        if (pick) continue;
        // Chrome lays an input's text and its placeholder out in an inner editor as high as the input's LINE-HEIGHT and clips to it: a tall Arabic
        // font is cut even when the outer box is 32 px (owner, live: 'حتى يفتحه مدير' in the read-only security-policy fields). So the line-height itself
        // must be >= 1.85 x the font size, read-only and disabled inputs included. (The placeholder takes the input's line-height: Chrome ignores
        // line-height on ::placeholder and reads it back as 'normal' even when forced, so the input's value is the one to assert.)
        if (e.tagName === 'INPUT' && r.height < fs * 1.85 - 0.5) out.push(`${tag}: ${r.height.toFixed(1)}px high for ${fs}px text (< 1.85 x)`);
        if (e.tagName === 'INPUT') { sizes.add(cs.fontSize); boxes.push({ tag, input: true, fsText: cs.fontSize, fs, h: r.height, lh: cs.lineHeight }); }
      }
      const need = new Map<string, number>();   // "font|size" -> height of the line-height:normal twin, once per distinct pair
      const twin = document.createElement('span');
      twin.textContent = 'ابحث برقم الفاتورة ٠١٢ ڤ';
      document.body.appendChild(twin);
      for (const size of sizes) for (const font of TALL) {
        twin.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;white-space:nowrap;line-height:normal;font-size:${size};font-family:"${font}",sans-serif`;
        need.set(`${font}|${size}`, twin.getBoundingClientRect().height);
      }
      twin.remove();
      for (const b of boxes) for (const font of TALL) {
        const n = need.get(`${font}|${b.fsText}`)!;
        if (b.h + 0.5 < n && n <= b.fs * 2.2) out.push(`${b.tag}: ${b.h.toFixed(1)}px high, ${font} needs ${n.toFixed(1)}px`);
      }
      return out;
    });
    for (const h of [...new Set(hits)]) bad.push(`${route} ${h}`);
  }
  expect(bad, 'text boxes too short for Arabic').toEqual([]);
});

// The two fields the owner photographed on the live site (read-only, 32 px high, placeholder 'حتى يفتحه مدير' / 'من 8 إلى 128 حرفاً'): their value
// AND placeholder line-height must leave room for the tall Arabic letters, read-only and disabled included.
test('the security policy fields (read-only, with a placeholder) have room for Arabic (ar)', { tags: ['audit'], requires: ['browser'] }, async ({ go, browser, shot }) => {
  await go('superadmin', '/control/security?new=policy', 'ar');
  await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 });
  await browser.locator('#f-inactivityMinutes').waitFor({ timeout: 20_000 });   // the policy form has loaded
  const rows = await browser.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input')].filter((e) => e.getBoundingClientRect().height > 0 && /[؀-ۿ]/.test(e.placeholder + e.value)).map((e) => {
    const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize);
    return { id: e.id, ph: e.placeholder || e.value, hasPh: !!e.placeholder, ro: e.readOnly || e.disabled, h: e.getBoundingClientRect().height, ratio: (parseFloat(cs.lineHeight) / fs) || 0 };   // 'normal' reads as 0
  }));
  expect(rows.length, 'Arabic placeholder/value inputs found on the security policy page').toBeGreaterThanOrEqual(2);
  expect(rows.filter((r) => r.ro).length, 'read-only/disabled ones among them').toBeGreaterThanOrEqual(2);
  for (const r of rows) { expect(r.ratio, `${r.id} "${r.ph}" line-height / font`).toBeGreaterThanOrEqual(1.85) }
  await shot('security-policy-ar');
});
