import { writeFileSync } from 'node:fs';
import { test, expect, NAV, LANGS, W } from './lib.ts';

// Widths follow the content (apple-design s18, e2ev "Width"): a money/number field is 80-140 px, a date 140-180, a code/phone 160-240, a text 200-320
// (fields with data-kind), and an action bar is as wide as its buttons, never stretched across the page (the owner's screenshots: a 50.00 inside a
// 220 px cell and a 400 px save bar holding two small buttons). Every page of the nav tree, ar and en; the bar rule is for the desktop (a phone's bar
// may span the screen). Sheets and the sales desk (redesigned elsewhere) keep their own bars.
const ROUTES = process.env.WIDTH_ROUTES ? process.env.WIDTH_ROUTES.split(',') : [...NAV.flatMap((g) => g.items.map((i) => i.route))];
const CEIL: Record<string, [number, number]> = { money: [80, 140], number: [60, 140], date: [140, 180], code: [160, 240], phone: [160, 240], text: [200, 320] };

for (const lang of LANGS) {
  test(`fields and bars take the width of their content (${lang})`, { tags: ['audit'], requires: ['browser'] }, async ({ go, browser }) => {
    const bad: string[] = [];
    for (const route of process.env.WIDTH_ROUTES ? ROUTES : ['/setup/item-fees', ...ROUTES.filter((r) => r !== '/setup/item-fees')]) {
      await go('superadmin', route, lang);
      await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 }).catch(() => {});
      await browser.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
      const hits = await browser.evaluate((CEIL) => {
        const out: string[] = [];
        for (const e of document.querySelectorAll<HTMLElement>('input[data-kind]')) {
          const kind = e.getAttribute('data-kind')!, r = e.getBoundingClientRect(), c = (CEIL as Record<string, [number, number]>)[kind];
          if (!c || r.width === 0) continue;
          if (r.width > c[1] + 1) out.push(`${kind} field ${e.id || e.tagName} is ${Math.round(r.width)}px (max ${c[1]})`);
        }
        // page-level search / scan / code field: at most 420 (apple-design s18); an input beside a button never exceeds 420; a numeric value is never in a field wider than 140
        const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        for (const e of document.querySelectorAll<HTMLElement>('.search, .usearch-box, input[type=search], #sc-code, .sc-search')) {
          if (!vis(e) || e.closest('.usearch-pop, dialog, .pal-in')) continue;
          const w = e.getBoundingClientRect().width;
          if (w > 421) out.push(`search/scan field ${e.id || e.className} is ${Math.round(w)}px (max 420)`);
        }
        for (const i of document.querySelectorAll<HTMLInputElement>('input:not([type=checkbox]):not([type=radio]):not([type=hidden])')) {
          if (!vis(i) || i.closest('table, .sheet, dialog')) continue;
          const host = i.closest('label, .search') ?? i, row = host.parentElement;
          if (row && [...row.children].some((k) => k !== host && k.matches('button, .btn') && vis(k)) && host.getBoundingClientRect().width > 421) out.push(`input + button row: input ${i.id || i.name} is ${Math.round(host.getBoundingClientRect().width)}px (max 420)`);
        }
        for (const i of document.querySelectorAll<HTMLInputElement>('input[inputmode=numeric], input[type=number]')) {
          if (!vis(i) || i.closest('.stepper, td, .sheet, dialog, #sd')) continue;
          if (i.getBoundingClientRect().width > 141) out.push(`numeric field ${i.id || i.name} is ${Math.round(i.getBoundingClientRect().width)}px (max 140)`);
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
    writeFileSync(`.shots/dynamic-widths-${lang}.json`, JSON.stringify(bad, null, 1));
    expect(bad, 'widths that do not follow the content').toEqual([]);
  });
}

// Named case (owner screenshot, 2026-11-06): Security policy, the session field and the sign-in values are short, and label, field and help share the start edge.
for (const lang of LANGS) {
  test(`security policy: number fields are short and aligned (${lang})`, { tags: ['audit'], requires: ['browser'] }, async ({ go, browser }) => {
    await go('superadmin', '/control/security', lang);
    await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 });
    await browser.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
    await browser.evaluate((w) => { [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === w)?.click(); }, W.edit[lang]);
    await browser.locator('#f-inactivityMinutes').waitFor({ timeout: 20_000 });
    const bad = await browser.evaluate(() => {
      const out: string[] = [];
      for (const i of document.querySelectorAll<HTMLInputElement>('.card input')) {
        const r = i.getBoundingClientRect(), f = i.closest('.field')!, lab = f.querySelector('label')!.getBoundingClientRect();
        const rtl = getComputedStyle(i).direction === 'rtl' || document.documentElement.dir === 'rtl';
        if (r.width === 0) continue;
        const isNum = i.id === 'f-inactivityMinutes' || i.getAttribute('data-kind') === 'number';
        if (isNum && r.width > 141) out.push(`${i.id || i.value}: ${Math.round(r.width)}px (max 140)`);
        if (i.id === 'f-inactivityMinutes') {
          const help = f.querySelector('.help')!.getBoundingClientRect();
          const edge = (b: DOMRect) => (document.documentElement.dir === 'rtl' ? b.right : b.left);
          if (Math.abs(edge(r) - edge(lab)) > 2 || Math.abs(edge(help) - edge(lab)) > 2) out.push(`label/field/help not on one start edge`);
        }
        void rtl;
      }
      return out;
    });
    expect(bad).toEqual([]);
  });
}
