import { test, expect, LANGS, seed, apiAs, cairoDay } from './lib.ts';

// A label and the number under it start at the SAME edge (right in Arabic, left in English). The owner's invoice totals bar (ar): the label was flush
// right but the number sat at the LEFT of its cell, because the number is a block with dir="ltr" (its start edge is left). Only the cell whose number
// is as wide as its label looked right by luck. Two checks:
//  1. every stacked label + value pair of a summary/tile/totals cell: the value's start edge = the label's start edge (2 px);
//  2. no block-level element with dir="ltr" holding text keeps a text-align that points away from the page's start edge (inputs, table cells, code/pre excluded).
const ROUTES = ['/sales/invoices?new=create', '/sales/reservations?new=create', '/sales/returns?new=create', '/buy/purchases?new=create', '/sales/pieces?view=totals', '/stock/count', '/'];
const PAIRS: [string, string, string][] = [['.tb-cell', '.help', 'b'], ['.sc-tile', '.sc-tile-k', '.sc-tile-n']];

for (const lang of LANGS) {
  test(`numbers start where their label starts, and no ltr block flips its start edge (${lang})`, { tags: ['e2e', 'audit'], requires: ['browser'] }, async ({ go, browser, shot, screen }) => {
    const S = await seed();
    if ((await (await apiAs('superadmin'))('GET', '/gold-prices/today')).status === 404) await (await apiAs('superadmin'))('POST', '/gold-prices', { date: cairoDay(), sellPrice: 430000, buyPrice: 405000, silverPrice: 5000 });   // the totals bar needs a price
    const bad: string[] = []; let pairs = 0, blocks = 0;
    for (const route of ROUTES) {
      await go('superadmin', route, lang);
      await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 }).catch(() => {});
      if (route === '/sales/invoices?new=create') {   // the totals bar shows once a piece is on the invoice
        await browser.locator('#ws [data-type=sale]').tap();
        if (await browser.locator('#ws [data-k=branchId] [role=combobox]').count()) { await browser.locator('#ws [data-k=branchId] [role=combobox]').tap(); await screen.getByRole('option', 'Main branch').tap(); }   // one branch: nothing to pick
        await browser.locator('#pc').fill(S.pieces[0].pieceCode);
        await browser.locator('#addPiece').tap();
        await browser.locator('#lineRows tr').first().waitFor({ timeout: 20_000 });
        await browser.locator('#f-customerPhone').fill('01012345678'); await browser.locator('#f-customerName').fill('E2E Customer');
        await browser.locator('#tot').waitFor({ timeout: 20_000 });
      }
      await browser.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
      const r = await browser.evaluate((PAIRS) => {
        const rtl = getComputedStyle(document.documentElement).direction === 'rtl', out: string[] = []; let pairs = 0, blocks = 0;
        const start = (el: Element) => { const b = el.getBoundingClientRect(); return rtl ? b.right : b.left; };
        // text edge: the label/value text itself (a block fills its cell, so measure the text's own range)
        const textStart = (el: Element) => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((x) => x.width > 0); if (!rs.length) return start(el); return rtl ? Math.max(...rs.map((x) => x.right)) : Math.min(...rs.map((x) => x.left)); };
        for (const [c, l, v] of PAIRS) for (const cell of document.querySelectorAll(c)) {
          const lab = cell.querySelector(l), val = cell.querySelector(v);
          if (!lab || !val || !(cell as HTMLElement).offsetWidth) continue;
          if (val.getBoundingClientRect().top < lab.getBoundingClientRect().bottom - 2) continue;   // side by side, not stacked
          pairs++;
          const d = Math.abs(textStart(lab) - textStart(val));
          if (d > 2) out.push(`${c}: "${(lab.textContent || '').trim().slice(0, 24)}" starts ${d.toFixed(0)}px from its number "${(val.textContent || '').trim().slice(0, 14)}"`);
        }
        for (const e of document.querySelectorAll<HTMLElement>('[dir=ltr]')) {
          if (e.matches('input, textarea, td, th, code, pre, bdi, svg *') || e.closest('td, th, pre, code, button, a')) continue;
          const cs = getComputedStyle(e);
          if (!(e.offsetWidth > 0) || !['block', 'list-item', 'flow-root'].includes(cs.display)) continue;
          if (![...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim())) continue;
          blocks++;
          // only an Arabic page can flip: a dir=ltr block there that says left/start puts its text at the LEFT, away from the page's start edge
          if (rtl && ['start', 'left'].includes(cs.textAlign)) out.push(`<${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ')[0]}> dir=ltr block has text-align ${cs.textAlign}, so its text starts at the LEFT of an Arabic page: "${(e.textContent || '').trim().slice(0, 20)}"`);
        }
        return { out, pairs, blocks };
      }, PAIRS);
      pairs += r.pairs; blocks += r.blocks;
      for (const o of [...new Set(r.out)]) bad.push(`${route} ${o}`);
      if (route.startsWith('/sales/invoices')) { await browser.evaluate(() => document.querySelector('#tot')?.scrollIntoView({ block: 'center' })); await shot(`totals-bar-${lang}${process.env.SHOT_TAG ?? ''}`); }
    }
    expect(pairs, 'label+number pairs measured').toBeGreaterThanOrEqual(5);
    expect(bad, 'numbers not at their label start edge').toEqual([]);
  });
}
