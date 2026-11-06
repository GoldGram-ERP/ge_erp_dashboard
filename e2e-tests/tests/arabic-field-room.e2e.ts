import { test, expect, NAV, LANGS } from './lib.ts';

// Arabic needs room inside a text box: an <input> clips whatever goes past its own box (overflow: clip), and many Arabic fonts are taller than
// 1.7 x the font size, so a box exactly one line high cuts the bottom of the letters (the owner's live screenshots: the filter search
// 'ابحث برقم الفاتورة' and a code/name filter). Every visible text input/textarea must be at least as tall as the CONTENT AREA of a tall Arabic
// font (line-height: normal of Sakkal Majalla / Traditional Arabic, measured here with a twin element) and at least 1.85 x its font size.
const ROUTES = ['/', '/account', ...NAV.flatMap((g) => g.items.map((i) => i.route))];

test('text boxes have room for tall Arabic fonts on every page (ar)', { tags: ['audit'], requires: ['browser'] }, async ({ go, browser }) => {
  const bad: string[] = [];
  for (const route of ROUTES) {
    await go('superadmin', route, 'ar');
    await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 }).catch(() => {});
    await browser.evaluate(() => new Promise((r) => setTimeout(r, 800)));
    const hits = await browser.evaluate(() => {
      const TALL = ['Sakkal Majalla', 'Traditional Arabic', 'Arabic Typesetting'];
      const out: string[] = [];
      const boxes = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')].filter((e) => {
        const t = (e as HTMLInputElement).type;
        return e.getBoundingClientRect().width > 40 && e.getBoundingClientRect().height > 0 && !['checkbox', 'radio', 'hidden', 'range', 'file', 'color', 'button', 'submit'].includes(t);
      });
      for (const e of boxes) {
        const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize), h = e.getBoundingClientRect().height, tag = `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ')[0]}`;
        if (e.tagName === 'INPUT' && h < fs * 1.85 - 0.5) out.push(`${tag}: ${h.toFixed(1)}px high for ${fs}px text (< 1.85 x)`);
        for (const font of TALL) {
          const twin = document.createElement('span');
          twin.textContent = 'ابحث برقم الفاتورة ٠١٢ ڤ';
          twin.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;white-space:nowrap;line-height:normal;font-size:${cs.fontSize};font-family:"${font}",sans-serif`;
          document.body.appendChild(twin);
          const need = twin.getBoundingClientRect().height; twin.remove();
          const probe = document.createElement('span');
          probe.style.cssText = `font-family:"${font}",sans-serif`; document.body.appendChild(probe);
          const usable = getComputedStyle(probe).fontFamily.includes(font); probe.remove();
          if (e.tagName === 'INPUT' && usable && h + 0.5 < need && need <= fs * 2.2) out.push(`${tag}: ${h.toFixed(1)}px high, ${font} needs ${need.toFixed(1)}px`);
        }
      }
      return out;
    });
    for (const h of [...new Set(hits)]) bad.push(`${route} ${h}`);
  }
  expect(bad, 'text boxes too short for Arabic').toEqual([]);
});
