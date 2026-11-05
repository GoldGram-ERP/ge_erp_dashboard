import { afterAll } from 'e2e';
import { test, expect, apiAs, stamp, cairoDay, M, layoutAudit, type Lang } from './lib.ts';

// The live stock count board (owner, 2026-11-05) through the real UI, in both languages: start a count on a new branch,
// scan, see the summary, last scan, breakdown and lists move (grams too), see a scan made on another device arrive by
// itself, the Save confirmation with what will be recorded as missing, and the closed board.
type World = Awaited<ReturnType<typeof world>>;
let W: World | undefined;
const counts: string[] = [];

async function world() {
  const api = await apiAs('superadmin');
  const tag = stamp();
  const must = async (p: Promise<{ status: number; body: any }>) => { const r = await p; if (r.status >= 300) throw new Error(`seed failed ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
  // A branch needs its own Admin (one branch per Admin): a throwaway one, made on any live branch first.
  const some = (await must(api('GET', '/branches'))).items[0].id as string;
  const admin = await must(api('POST', '/users', { username: `scl${tag.toLowerCase()}`, email: `scl${tag.toLowerCase()}@example.com`, password: 'E2e-Temp-Pass-9876', userType: 'admin', branchId: some }));
  const branch = await must(api('POST', '/branches', { branchName: `SCL UI ${tag}`, adminUserId: admin.id }));
  const cat = await must(api('POST', '/categories', { categoryName: `SCL Cat ${tag}`, qrLabel: false }));
  const item = (itemName: string, karat: string, weight: number) => must(api('POST', '/items', {
    itemName, isCoded: true, itemType: 'gold', categoryId: cat.id, karat, weight,
    workmanshipMode: 'per_gram', workmanshipValue: '50.00', cashbackMode: 'per_gram', cashbackValue: '0.00',
  }));
  const ring = await item(`SCL Ring ${tag}`, '21', 5000);
  const chain = await item(`SCL Chain ${tag}`, '18', 3250);
  const piecesOf = async (itemId: string, n: number) => {
    const inv = await must(api('POST', '/purchase-invoices', { date: cairoDay(), branchId: branch.id, lines: [{ itemId, quantity: n }] }));
    const coding = await must(api('GET', `/purchase-coding/invoices/${inv.id}`));
    const piece = { tagPrice: 900000, salePrice: 900000 };
    await must(api('POST', `/purchase-coding/invoices/${inv.id}`, { lines: [{ lineId: coding.lines[0].lineId, pieces: Array.from({ length: n }, () => piece) }] }));
    return ((await must(api('GET', `/pieces?invoiceId=${inv.id}`))).items as { pieceCode: string }[]).map((p) => p.pieceCode);
  };
  // Each language counts the same branch on its own count: 3 rings (21K, 5 g) and 2 chains (18K, 3.25 g) = 21.500 g.
  return { api, tag, branch, admin, ring, chain, rings: await piecesOf(ring.id, 3), chains: await piecesOf(chain.id, 2) };
}

// Size and layout rules (owner, 2026-11-05; apple-design section 18): small calm controls on desktop AND phone, nothing pinned,
// nothing wider than the screen, every part inside its section. Measured in the page, so a regression fails here, not in review.
const AUDIT = `(() => {
  const phone = innerWidth <= 520, ws = document.querySelector('#ws') || document.body, out = { phone, w: innerWidth, max: {}, bad: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
  const note = (k, e, v) => { out.max[k] = Math.max(out.max[k] || 0, Math.round(v)); };
  const name = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''));
  for (const e of ws.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, [role=combobox], .btn, .search, .seg button, .copy-btn')) { const r = vis(e); if (r && !e.closest('.search, .sel-btn') || (r && e.matches('.search'))) note(e.closest('.seg') ? 'segmented' : e.matches('.copy-btn') ? 'copyButton' : 'control', e, r.height); }
  for (const e of ws.querySelectorAll('.btn, .search, .seg button, input:not([type=checkbox]):not([type=radio])')) { const r = vis(e); if (r && !e.closest('.search, .copy-btn') && !e.closest('dialog')) { const lim = e.matches('.seg button') ? 30 : (phone ? (e.matches('.btn.primary') ? 40 : 36) : 34); if (r.height > lim + 0.5) out.bad.push('height ' + name(e) + ' ' + Math.round(r.height) + ' > ' + lim); } }
  for (const e of ws.querySelectorAll('.search')) { const r = vis(e); if (r && r.height > (phone ? 36 : 34) + 0.5) out.bad.push('height search ' + Math.round(r.height)); }
  for (const e of ws.querySelectorAll('svg')) { const r = vis(e); if (!r) continue; note('icon', e, Math.max(r.width, r.height)); if (Math.max(r.width, r.height) > (phone ? 18 : 20) + 0.5) out.bad.push('icon ' + name(e.parentElement) + ' ' + Math.round(r.width)); }
  for (const e of ws.querySelectorAll('.sc-live, .status')) { const r = vis(e); if (r) { note('badge', e, r.height); if (r.height > 22.5) out.bad.push('badge ' + name(e) + ' ' + Math.round(r.height)); } }
  for (const e of ws.querySelectorAll('.sc-table tbody tr')) { const r = vis(e); if (r) { note('row', e, r.height); if (r.height > (phone ? 40 : 38) + 0.5) out.bad.push('row ' + Math.round(r.height)); } }
  for (const e of ws.querySelectorAll('.sc-tile, .sc-last')) { const r = vis(e), c = getComputedStyle(e); if (r) { const pad = Math.max(parseFloat(c.paddingTop), parseFloat(c.paddingLeft)); note('cardPadding', e, pad); if (pad < 10 || pad > 16) out.bad.push('padding ' + name(e) + ' ' + pad); } }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.bad.push('page scrolls sideways ' + document.documentElement.scrollWidth + ' > ' + innerWidth);
  for (const e of ws.querySelectorAll('*')) { if (e.closest('.sr-only, .thumb, svg')) continue; const p = getComputedStyle(e).position; if ((p === 'fixed' || p === 'sticky') && !e.matches('th') && !e.closest('#toast, .toast, dialog') && vis(e)) out.bad.push('pinned ' + name(e) + ' ' + p); }
  for (const s of ws.querySelectorAll('#sc-summary, #sc-breakdown, #sc-pieces, #sc-last')) {
    const sr = s.getBoundingClientRect();
    if (sr.left < -1 || sr.right > innerWidth + 1) out.bad.push('section off screen ' + name(s));
    for (const c of s.querySelectorAll('*')) { if (c.closest('table, svg, .sr-only, .seg') && !c.matches('.seg')) continue; const r = vis(c); if (r && (r.left < sr.left - 1 || r.right > sr.right + 1)) out.bad.push('outside ' + name(s) + ' > ' + name(c)); }
    for (const t of s.querySelectorAll('.sc-table')) { const r = t.getBoundingClientRect(); if (r.right > sr.right + 1 || r.left < sr.left - 1) out.bad.push('table box outside ' + name(s)); }
  }
  return out;
})()`;
const audit = async (browser: { evaluate: (s: string) => Promise<unknown> }, label: string) => {
  const r = (await browser.evaluate(AUDIT)) as { phone: boolean; w: number; max: Record<string, number>; bad: string[] };
  console.log(`SIZES ${label} ${JSON.stringify(r.max)}`);
  expect(r.bad, `${label} (${r.phone ? 'phone' : 'desktop'} ${r.w}px)`).toEqual([]);
  return r;
};

const m = (l: Lang, k: string) => M(l, 'gold-stocktake', `stockCount.${k}`);

for (const lang of ['en', 'ar'] as Lang[]) {
  test(`stock count live board (${lang}): summary, last scan, breakdown, lists, live update, Save confirmation, closed board`, { tags: ['e2e', 'stocktake'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    W ??= await world();
    const w = W;
    const text = (sel: string) => browser.evaluate((s: string) => (document.querySelector(s) as HTMLElement | null)?.innerText ?? '', sel);
    const scan = async (code: string) => { await browser.locator('#ws #sc-code').fill(code); await browser.locator('#ws #sc-go').tap(); };

    await go('superadmin', '/stock/count?new=create', lang);
    // The branch list loads page by page: open the picker once it holds the new branch.
    const name = `SCL UI ${w.tag}`;
    await expect.poll(async () => {
      await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
      if (!(await browser.evaluate(() => !!document.querySelector('[role=listbox]')))) return false;   // the list is still loading
      // A short list has no search box; a long one does.
      if (await browser.evaluate(() => !!document.querySelector('[role=searchbox]'))) await browser.locator('[role=searchbox]').fill(name);
      const found = await browser.evaluate((n: string) => [...document.querySelectorAll('[role=option]')].some((o) => o.textContent?.includes(n)), name);
      if (!found) { await browser.keyboard.press('Escape'); return false; }
      await screen.getByRole('option', name).tap();
      return browser.evaluate((n: string) => (document.querySelector('#ws [data-k=branchId] [role=combobox]')?.textContent ?? '').includes(n), name);
    }, { timeout: 45_000 }).toBe(true);
    await browser.locator('#ws #save').tap();
    await expect(browser.locator('#ws #sc-code')).toBeVisible();
    // The count just started: the newest on the branch (the page keeps its id in state, not in the address).
    const id = (await w.api('GET', `/stock-counts?branchId=${w.branch.id}`)).body.items[0].id as string;
    counts.push(id);

    // Before any scan: everything expected is remaining, in pieces and grams (and 24K grams).
    await expect.poll(() => text('#sc-sum-expected')).toContain('21.500');
    expect(await text('#sc-sum-expected')).toContain('5');
    expect(await text('#sc-sum-remaining')).toContain('21.500');
    expect(await text('#sc-pct')).toContain('0');
    await audit(browser, `${lang} 1-started`);
    await shot(`live-${lang}-1-started`);

    // A scan: the big last-scan card names the item, karat and weight; the summary moves at once.
    await scan(w.rings[0]);
    await expect(browser.locator('#ws #sc-last.ok')).toBeVisible();
    expect(await text('#sc-last')).toContain(`SCL Ring ${w.tag}`);
    expect(await text('#sc-last')).toContain('5.000');
    await expect.poll(() => text('#sc-sum-counted')).toContain('5.000');
    expect(await text('#sc-sum-remaining')).toContain('16.500');
    expect(await text('#sc-pct')).toContain('20');
    await audit(browser, `${lang} 2-scanned`);
    await shot(`live-${lang}-2-scanned`);
    expect(await layoutAudit(browser), 'layoutAudit 2-scanned').toEqual([]);

    // The same piece again: already counted, when and by whom. An unknown code: refused, with the reason.
    await scan(w.rings[0]);
    await expect(browser.locator('#ws #sc-last.already')).toBeVisible();
    expect(await text('#sc-last')).toContain(m(lang, 'scanAlready'));
    await scan('NOPE0');
    await expect(browser.locator('#ws #sc-last.refused')).toBeVisible();
    await expect(browser.locator('#ws #sc-refused')).toBeVisible();
    await audit(browser, `${lang} 3-refused`);
    await shot(`live-${lang}-3-refused`);

    // Live: a chain scanned on another device shows by itself (the board reads again every few seconds).
    const other = await w.api('POST', `/stock-counts/${id}/scan`, { pieceCode: w.chains[0] });
    expect(other.status).toBe(200);
    await expect.poll(() => text('#sc-sum-counted'), { timeout: 15_000 }).toContain('8.250');

    // Breakdown by karat and by item: what is left is flagged; the lists show the pieces with their details.
    await browser.locator('#ws #sc-bd-karat').tap();
    await expect.poll(() => text('#sc-bd-table')).toContain('18');
    await browser.locator('#ws #sc-bd-item').tap();
    expect(await text('#sc-bd-table')).toContain(`SCL Chain ${w.tag}`);
    await expect.poll(() => text('#sc-pl-table')).toContain(w.chains[0]);
    await audit(browser, `${lang} 4-breakdown`);
    await shot(`live-${lang}-4-breakdown`);
    expect(await layoutAudit(browser), 'layoutAudit 4-breakdown').toEqual([]);
    await browser.locator('#ws #sc-pl-remaining').tap();
    await expect.poll(() => text('#sc-pl-table')).toContain(w.rings[1]);
    expect(await browser.evaluate(() => [...document.querySelectorAll('#sc-pl-table tbody tr td:first-child')].map((c) => c.textContent?.trim()).join(' '))).not.toContain(w.rings[0]);   // by the code cell only: short codes also look like karats
    await audit(browser, `${lang} 5-remaining`);
    await shot(`live-${lang}-5-remaining`);
    expect(await layoutAudit(browser), 'layoutAudit 5-remaining').toEqual([]);

    // Save: the confirmation lists what will be recorded as missing (3 pieces, 13.250 g) before it is confirmed.
    await browser.locator('#ws #sc-savebtn').tap();
    await expect(browser.locator('#sc-save-preview')).toBeVisible();
    expect(await text('#sc-save-preview')).toContain('13.250');
    expect(await text('#sc-save-preview')).toContain(`SCL Ring ${w.tag}`);
    await audit(browser, `${lang} 6-save-confirm`);
    await shot(`live-${lang}-6-save-confirm`);
    await browser.locator('dialog[open] .btn.primary').tap();

    // Closed: the same board, frozen, with the missing pieces.
    await expect(browser.locator('#ws #sc-code')).toHaveCount(0);
    await expect.poll(() => text('#sc-sum-remaining')).toContain(m(lang, 'missing'));
    expect(await text('#sc-sum-remaining')).toContain('13.250');
    await browser.locator('#ws #sc-pl-remaining').tap();
    await expect.poll(() => text('#sc-pl-table')).toContain(w.rings[2]);
    await audit(browser, `${lang} 7-closed`);
    await shot(`live-${lang}-7-closed`);
  });
}

// Clean up through the app: the counts are deleted (marked); the coded pieces stay (a coded purchase cannot be deleted).
afterAll(async () => {
  if (!W) return;
  for (const id of counts) await W.api('DELETE', `/stock-counts/${id}`);
  await W.api('DELETE', `/branches/${W.branch.id}`);
  await W.api('DELETE', `/users/${W.admin.id}`);
});
