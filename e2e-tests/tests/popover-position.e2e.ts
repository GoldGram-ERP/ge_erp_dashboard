import { test, expect, LANGS } from './lib.ts';

// Every open dropdown (Select) sits under its field: its START edge (right in Arabic, left in English) is within 1 px of the field's, it is at
// least as wide as the field, and it stays inside the screen. The owner's phone showed the Sales desk item list ~230 px right of its field in
// Arabic: the popup was measured before its minimum width (the field's) applied.
const PAGES = ['/sales/desk?new=draft', '/sales/invoices', '/sales/reservations', '/buy/items'];

for (const lang of LANGS) {
  test(`dropdown lists open under their field (${lang})`, { tags: ['e2e', 'popover'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const bad: string[] = [];
    let checked = 0;
    for (const route of PAGES) {
      await go('superadmin', route, lang);
      await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 });
      await browser.evaluate(() => new Promise((r) => setTimeout(r, 1500)));   // the page's lists and filters settle
      // the dropdown fields that are on screen and enabled (a filter folded away has no size), numbered for this loop
      const count = await browser.evaluate(() => {
        document.querySelectorAll('[data-pp]').forEach((e) => e.removeAttribute('data-pp'));
        const on = [...document.querySelectorAll<HTMLElement>('.sel-btn')].filter((b) => !(b as HTMLButtonElement).disabled && b.getBoundingClientRect().width > 0).slice(0, 4);
        on.forEach((b, n) => b.setAttribute('data-pp', String(n)));
        return on.length;
      });
      for (let i = 0; i < count; i++) {
        await browser.evaluate((n) => { document.querySelector(`[data-pp="${n}"]`)!.scrollIntoView({ block: 'center' }); }, i);
        await browser.evaluate((n) => (document.querySelector(`[data-pp="${n}"]`) as HTMLElement).click(), i);   // a click on the field itself (a sticky bar may cover it on a phone)
        await expect.poll(() => browser.evaluate(() => document.querySelectorAll('.pop').length > 0), { timeout: 5_000 }).toBe(true);
        // the list opens with a small scale-in: read its box once it stops moving (two equal reads in a row)
        await expect.poll(() => browser.evaluate(async () => {
          const r1 = ([...document.querySelectorAll('.pop')].at(-1) as HTMLElement).getBoundingClientRect().width;
          await new Promise((r) => setTimeout(r, 120));
          return ([...document.querySelectorAll('.pop')].at(-1) as HTMLElement).getBoundingClientRect().width === r1;
        }), { timeout: 5_000 }).toBe(true);
        const m = await browser.evaluate((n) => {
          const t = (document.querySelector(`[data-pp="${n}"]`) as HTMLElement).getBoundingClientRect();
          const p = ([...document.querySelectorAll('.pop')].at(-1) as HTMLElement).getBoundingClientRect();
          const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
          return { startGap: Math.round((rtl ? p.right - t.right : p.left - t.left) * 10) / 10, widthShort: Math.round((t.width - p.width) * 10) / 10, left: p.left, right: p.right, vw: innerWidth };
        }, i);
        checked++;
        const where = `${route} select #${i}`;
        if (Math.abs(m.startGap) > 1) bad.push(`${where}: start edge ${m.startGap}px off its field`);
        if (m.widthShort > 1) bad.push(`${where}: ${m.widthShort}px narrower than its field`);
        if (m.left < -0.5 || m.right > m.vw + 0.5) bad.push(`${where}: outside the screen (${Math.round(m.left)}..${Math.round(m.right)} of ${m.vw})`);
        if (i === 0) await shot(`popover-${lang}-${route.replace(/[^a-z]+/gi, '-')}`);
        await browser.keyboard.press('Escape');
      }
    }
    expect(checked, 'dropdowns measured').toBeGreaterThanOrEqual(3);
    expect(bad, 'dropdowns not under their field').toEqual([]);
  });
}
