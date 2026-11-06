import { test, expect, LANGS } from './lib.ts';

// Layout rows 9, 11, 12, 15 of the Arabic desktop audit (2026-11-06), measured on the running page:
//  9  a New / record sheet sizes to its content (never the screen's height with 70% white), its footer hugs its buttons; a phone sheet may use up to 90%.
//  11 a checkbox filter is ONE inline unit: the box and its label share a vertical centre (2 px) and sit within 12 px, level with the controls beside it.
//  12 a report's "pick the filters" empty state is a short quiet block (at most 200 px, icon at most 20 px).
//  15 home: the shortcut and recent cards are compact, equal height in a row.
const SHEET_ROUTES = ['/money/banks', '/buy/items', '/money/bank-movements', '/money/bank-transfers', '/expenses/expense-types', '/setup/branches', '/setup/users', '/setup/gold-prices', '/control/accounts'];
const FILTER_ROUTES = ['/money/treasuries', '/setup/users', '/money/cash?view=safe-statement'];
const REPORTS = ['/money/banks?view=balances', '/money/cash?view=safe-balances', '/money/cash?view=safe-statement'];
const settle = (browser: any, ms = 900) => browser.evaluate((n: number) => new Promise((r) => setTimeout(r, n)), ms);
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-');

for (const lang of LANGS) {
  test(`a New sheet sizes to its content and its footer hugs its buttons (${lang})`, { tags: ['e2e', 'layout'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const seen: string[] = [], bad: string[] = [];
    for (const route of SHEET_ROUTES) {
      await go('superadmin', route, lang);
      await browser.locator('h1').first().waitFor({ timeout: 20_000 }).catch(() => {});
      await settle(browser, 700);
      const add = browser.locator('.head .actions .btn.primary').first();
      if (!(await add.count())) continue;
      await add.tap();
      await settle(browser);
      const m = await browser.evaluate(() => {
        const s = document.querySelector<HTMLElement>('.sheet.show'); if (!s) return null;
        const R = (e: Element) => e.getBoundingClientRect();
        const head = s.querySelector('header')!, body = s.querySelector<HTMLElement>('.body')!, foot = s.querySelector('footer');
        const bar = foot ?? s.querySelector('.formbar');
        const btns = bar ? [...bar.querySelectorAll('button, .btn')] : [];
        const extent = btns.length ? Math.max(...btns.map((b) => R(b).right)) - Math.min(...btns.map((b) => R(b).left)) : 0;
        const content = R(head).height + body.scrollHeight + (foot ? R(foot).height : 0);
        return { vh: innerHeight, vw: innerWidth, h: R(s).height, content, bar: bar ? R(bar).width : 0, extent };
      });
      if (!m) continue;
      seen.push(route);
      if (m.vw < 700) { if (m.h > m.vh * 0.9 + 1) bad.push(`${route}: phone sheet ${Math.round(m.h)} px > 90% of ${m.vh}`); }
      else {
        if (m.content < m.vh * 0.5 && m.h > m.vh * 0.6) bad.push(`${route}: short content (${Math.round(m.content)} px) but the sheet is ${Math.round(m.h)} px of ${m.vh}`);
        if (m.h > m.content + 40) bad.push(`${route}: sheet ${Math.round(m.h)} px is taller than its content ${Math.round(m.content)} px`);
        if (m.bar && m.extent && m.bar > m.extent + 2 * 28 + 24) bad.push(`${route}: footer bar ${Math.round(m.bar)} px for buttons spanning ${Math.round(m.extent)} px`);
      }
      if (route === '/money/banks' || route === '/setup/users') await shot(`sheet-fit-${lang}-${slug(route)}`);
    }
    expect(seen.length, `sheets opened: ${seen.join(', ')}`).toBeGreaterThanOrEqual(6);
    expect(bad).toEqual([]);
  });

  test(`a checkbox filter is one inline unit, level with its row (${lang})`, { tags: ['e2e', 'layout'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const bad: string[] = []; let n = 0;
    for (const route of FILTER_ROUTES) {
      await go('superadmin', route, lang);
      await browser.locator('#filters').first().waitFor({ timeout: 20_000 }).catch(() => {});
      await settle(browser, 700);
      const rows = await browser.evaluate(() => [...document.querySelectorAll<HTMLElement>('#filters .field.check')].map((f) => {
        const R = (e: Element) => e.getBoundingClientRect();
        const box = f.querySelector('input')!, label = f.querySelector('label')!;
        const t = document.createRange(); t.selectNodeContents(label); const tr = t.getBoundingClientRect();
        const bc = R(box), fr = R(f);
        const gap = Math.max(0, Math.max(bc.left, tr.left) - Math.min(bc.right, tr.right));
        // controls beside it: another field of the same filter row (their boxes overlap the check field's vertical range)
        const mates = [...document.querySelectorAll<HTMLElement>('#filters .field:not(.check) :is(input,.sel-btn,.dp-btn)')].filter((c) => { const r = R(c); return r.width > 0 && r.top < fr.bottom && r.bottom > fr.top; });
        const mate = mates[0] ? R(mates[0]) : null;
        return { name: f.dataset.k, boxW: bc.width, labelFs: parseFloat(getComputedStyle(label).fontSize), dy: Math.abs((bc.top + bc.bottom) / 2 - (tr.top + tr.bottom) / 2), gap, mateDy: mate ? Math.abs((bc.top + bc.bottom) / 2 - (mate.top + mate.bottom) / 2) : null };
      }));
      for (const r of rows) {
        n++;
        if (r.dy > 2) bad.push(`${route} ${r.name}: box and label centres differ by ${r.dy.toFixed(1)} px`);
        if (r.gap > 12) bad.push(`${route} ${r.name}: box is ${r.gap.toFixed(1)} px from its label`);
        if (r.boxW !== 16 || r.labelFs !== 13) bad.push(`${route} ${r.name}: box ${r.boxW} px, label ${r.labelFs} px (want 16 and 13)`);
        if (r.mateDy !== null && r.mateDy > 3) bad.push(`${route} ${r.name}: ${r.mateDy.toFixed(1)} px off the centre of the control beside it`);
      }
      if (rows.length) await shot(`checkbox-filter-${lang}-${slug(route)}`);
    }
    expect(n, 'checkbox filters found').toBeGreaterThanOrEqual(3);
    expect(bad).toEqual([]);
  });

  test(`a report's empty state is a short quiet block, home cards are compact (${lang})`, { tags: ['e2e', 'layout'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const bad: string[] = [];
    for (const route of REPORTS) {
      await go('superadmin', route, lang);
      await browser.locator('#tbl .empty').first().waitFor({ timeout: 20_000 }).catch(() => {});
      const m = await browser.evaluate(() => { const e = document.querySelector('#tbl .empty'); if (!e) return null; const i = e.querySelector('svg'); return { h: e.getBoundingClientRect().height, icon: i ? i.getBoundingClientRect().width : 0 }; });
      if (!m) { bad.push(`${route}: no empty state`); continue; }
      if (m.h > 200) bad.push(`${route}: empty state ${Math.round(m.h)} px tall (max 200)`);
      if (m.icon > 20.5) bad.push(`${route}: empty-state icon ${m.icon} px (max 20)`);
      if (route === REPORTS[0]) await shot(`report-empty-${lang}`);
    }
    await go('superadmin', '/', lang);
    await browser.locator('.home').first().waitFor({ timeout: 20_000 }).catch(() => {});
    await settle(browser, 600);
    const home = await browser.evaluate(() => {
      const c = ['.b-pins', '.b-recent'].map((s) => document.querySelector(s)).filter(Boolean) as HTMLElement[];
      const empty = c.filter((e) => e.querySelector('.quiet-note'));   // a card with rows is as tall as its rows; only an empty one is held to a height
      const R = c.map((e) => e.getBoundingClientRect()), cs = c.map((e) => getComputedStyle(e));
      return { n: c.length, empty: empty.map((e) => Math.round(e.getBoundingClientRect().height)), hs: R.map((r) => Math.round(r.height)), pad: cs.map((s) => parseFloat(s.paddingTop)), sameRow: R.length === 2 && Math.abs(R[0].top - R[1].top) < 4 };
    });
    expect(home.n).toBe(2);
    if (home.sameRow && Math.abs(home.hs[0] - home.hs[1]) > 2) bad.push(`home cards in one row differ in height: ${home.hs.join(' / ')}`);
    if (home.pad.some((p: number) => p > 12.5)) bad.push(`home card padding ${home.pad.join('/')} (max 12)`);
    if (!home.sameRow && home.empty.some((h: number) => h > 130))   // side by side, an empty card stretches to its neighbour (equal heights), which holds rows
       bad.push(`home empty card ${home.empty.join('/')} px tall (max 130)`);
    await shot(`home-${lang}`);
    expect(bad).toEqual([]);
  });
}
