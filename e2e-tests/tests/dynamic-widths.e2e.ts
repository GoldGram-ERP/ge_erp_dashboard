import { test, expect, NAV, LANGS } from './lib.ts';

// Widths follow the content (apple-design s18, e2ev "Width"): a money/number field is 80-140 px, a date 140-180, a code/phone 160-240, a text 200-320
// (fields with data-kind), and an action bar is as wide as its buttons, never stretched across the page (the owner's screenshots: a 50.00 inside a
// 220 px cell and a 400 px save bar holding two small buttons). Every page of the nav tree, ar and en; the bar rule is for the desktop (a phone's bar
// may span the screen). Sheets and the sales desk (redesigned elsewhere) keep their own bars.
const ROUTES = [...NAV.flatMap((g) => g.items.map((i) => i.route))];
const CEIL: Record<string, [number, number]> = { money: [80, 140], number: [60, 140], date: [140, 180], code: [160, 240], phone: [160, 240], text: [200, 320] };

for (const lang of LANGS) {
  test(`fields and bars take the width of their content (${lang})`, { tags: ['audit'], requires: ['browser'] }, async ({ go, browser }) => {
    const bad: string[] = [];
    for (const route of ['/setup/item-fees', ...ROUTES.filter((r) => r !== '/setup/item-fees')]) {
      await go('superadmin', route, lang);
      await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 }).catch(() => {});
      await browser.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
      const hits = await browser.evaluate((CEIL) => {
        const out: string[] = [];
        for (const e of document.querySelectorAll<HTMLElement>('[data-kind]')) {
          const kind = e.getAttribute('data-kind')!, r = e.getBoundingClientRect(), c = (CEIL as Record<string, [number, number]>)[kind];
          if (!c || r.width === 0) continue;
          if (r.width > c[1] + 1) out.push(`${kind} field ${e.id || e.tagName} is ${Math.round(r.width)}px (max ${c[1]})`);
        }
        if (innerWidth >= 700) {
          for (const bar of document.querySelectorAll<HTMLElement>('.formbar')) {
            if (bar.closest('.sheet') || bar.closest('#sd') || bar.closest('dialog') || bar.getBoundingClientRect().width === 0) continue;
            const kids = [...bar.children].filter((k) => k.getBoundingClientRect().width > 0);
            const cs = getComputedStyle(bar), gap = parseFloat(cs.columnGap) || 0;
            const content = kids.reduce((s, k) => s + k.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const w = bar.getBoundingClientRect().width;
            if (w > content + 8) out.push(`action bar is ${Math.round(w)}px for ${Math.round(content)}px of buttons`);
          }
        }
        return out;
      }, CEIL);
      for (const h of [...new Set(hits)]) bad.push(`${route}: ${h}`);
    }
    expect(bad, 'widths that do not follow the content').toEqual([]);
  });
}
