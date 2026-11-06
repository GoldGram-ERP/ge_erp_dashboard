import { afterAll } from 'e2e';
import { test, expect, seed, LANGS, layoutAudit, MAIN_BRANCH } from './lib.ts';

// Every sortable table header: tap cycles natural direction -> flipped -> back, rows reorder against an independent sort, aria-sort follows,
// only the sorted column shows the active arrow, empties come last. One table per kind: a categories-style server report (text + numbers),
// a money/date server list (sales invoices), a list sorted in the browser (karats).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const S: Awaited<ReturnType<typeof seed>>[] = [];
afterAll(async () => { for (const s of S) await s.remove(); });

type Snap = { cols: { i: number; start: number; sortable: boolean; aria: string | null; arrow: string | null; label: string; kind: string; thH: number }[]; rows: string[][]; active: number };
const snap = (browser: any, table: string): Promise<Snap> => browser.evaluate((sel: string) => {
  const t = document.querySelector(sel) as HTMLTableElement;
  const ths = Array.from(t.querySelectorAll('thead tr:first-child th')) as HTMLTableCellElement[];
  let start = 0;
  const cols = ths.map((th, i) => {
    const c = { i, start, sortable: th.dataset.sort === 'on', aria: th.getAttribute('aria-sort'), arrow: th.querySelector('.sort-arrow')?.getAttribute('data-dir') ?? null, label: (th.textContent ?? '').trim(), kind: th.dataset.kind ?? '', thH: Math.round(th.getBoundingClientRect().height) };
    start += th.colSpan || 1; return c;
  });
  const rows = Array.from(t.querySelectorAll('tbody tr')).filter((r) => !r.classList.contains('grp') && !r.classList.contains('foot')).map((r) => Array.from(r.children).map((c) => (c.textContent ?? '').trim()));
  return { cols, rows, active: cols.filter((c) => c.arrow === 'asc' || c.arrow === 'desc').length };
}, table);

const empty = (v: string) => v === '' || v === '—';
const AR = '٠١٢٣٤٥٦٧٨٩';
const num = (v: string) => {
  const t = v.replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/[,٬\s‎‏]/g, '').replace('٫', '.').replace('%', '');
  return /^[+-]?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};
const dmy = (v: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v); return m ? Number(m[3] + m[2] + m[1]) : NaN; };
const iso = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? Number(m[1] + m[2] + m[3]) : NaN; };
const kindOf = (vals: string[], declared: string): { kind: 'num' | 'text'; k: (v: string) => number } => {
  if (declared === 'text') return { kind: 'text', k: () => 0 };
  const full = vals.filter((v) => !empty(v));
  for (const f of [num, dmy, iso]) if (full.length && full.every((v) => !Number.isNaN(f(v)))) return { kind: 'num', k: f };
  return { kind: 'text', k: () => 0 };
};
// the values in the order a correct sort puts them (empties last); only VALUES are compared, so tied rows may differ in row order
function expected(vals: string[], dir: 'asc' | 'desc', lang: string, numeric: boolean, declared: string) {
  const { kind, k } = kindOf(vals, declared);
  const full = vals.filter((v) => !empty(v)), emp = vals.filter(empty);
  const col = new Intl.Collator(lang, { numeric, sensitivity: 'base' });
  full.sort((a, b) => (kind === 'num' ? k(a) - k(b) : col.compare(a, b)));
  return [...(dir === 'asc' ? full : full.reverse()), ...emp];
}

// server = the backend sorts (plain locale order, digits as text); a browser-sorted list uses numeric order and sorts a text-typed column of digits as text
async function sortEveryColumn(browser: any, table: string, lang: string, label: string, server: boolean) {
  const first = await snap(browser, table);
  const sortable = first.cols.filter((c) => c.sortable);
  expect(sortable.length, `${label}: sortable headers`).toBeGreaterThan(0);
  expect(first.rows.length, `${label}: rows to sort`).toBeGreaterThan(2);
  const seen: string[] = [];
  for (const col of sortable) {
    const dirs: string[] = [];
    for (let round = 0; round < 3; round++) {
      await browser.locator(`${table} thead tr:first-child th:nth-child(${col.i + 1}) .th-sort`).click();
      await sleep(server ? 900 : 150); // server lists refetch; a browser sort is immediate
      const s = await snap(browser, table);
      const me = s.cols[col.i];
      expect(me.aria, `${label} "${col.label}" round ${round + 1} aria-sort`).toMatch(/ascending|descending/);
      expect(me.arrow, `${label} "${col.label}" arrow`).toBe(me.aria === 'ascending' ? 'asc' : 'desc');
      expect(s.active, `${label}: the arrow shows on one column only`).toBe(1);
      for (const o of s.cols) if (o.sortable && o.i !== col.i) expect(o.aria, `${label} "${o.label}" is not the sorted column`).toBe('none');
      dirs.push(me.aria!);
      const vals = s.rows.map((r) => r[col.start] ?? '');
      expect(vals, `${label} "${col.label}" ${me.aria}`).toEqual(expected(vals, me.aria === 'ascending' ? 'asc' : 'desc', lang, !server, me.kind));
      expect(me.thH, 'header row stays 32px').toBeLessThanOrEqual(33);
    }
    // numbers and dates start descending, text ascending; then it flips, then flips back
    expect(dirs[0], `${label} "${col.label}" first tap`).toBe(col.aria === 'ascending' ? 'descending' : col.aria === 'descending' ? 'ascending' : col.kind === 'text' ? 'ascending' : 'descending'); // the column that starts sorted flips first
    expect(dirs[1]).not.toBe(dirs[0]);
    expect(dirs[2]).toBe(dirs[0]);
    seen.push(col.label);
  }
  return seen;
}

for (const lang of LANGS) {
  test(`headers sort: server report by category (${lang})`, { tags: ['e2e', 'tables'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    for (let i = 0; i < 3; i++) S.push(await seed());
    await go('superadmin', '/stock/branch-stock?view=by-category', lang);
    await browser.locator('#run').click();
    await expect.poll(() => browser.locator('#tbl tbody tr').count(), { timeout: 15_000 }).toBeGreaterThan(2); // a cold dev compile of the report page can take over 5 s
    await shot(`sort-before-click-${lang}-category`);
    const seen = await sortEveryColumn(browser, '#tbl table', lang, 'by-category', true);
    expect(seen.length).toBeGreaterThanOrEqual(4);
    await shot(`sort-after-click-${lang}-category`);
    expect(await layoutAudit(browser, '#tbl')).toEqual([]);
  });

  test(`headers sort: money and date list, server (${lang})`, { tags: ['e2e', 'tables'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const s = S[0] ?? (S[0] = await seed());
    for (const p of s.pieces.slice(0, 3)) {
      const mk = (pay: object) => s.api('POST', '/sales-invoices', { branchId: MAIN_BRANCH, invoiceType: 'sale', customerName: 'E2E Customer', customerPhone: '01012345678', lines: [{ pieceCode: p.pieceCode }], ...pay });
      const total = (await mk({ cash: 1 })).body.values.total as number;
      const r = await mk({ cash: total }); expect(r.status).toBe(201); s.created.invoices.push(r.body.id);
    }
    await go('superadmin', '/sales/invoices', lang);
    await expect.poll(() => browser.locator('#tbl tbody tr').count()).toBeGreaterThan(2);
    const seen = await sortEveryColumn(browser, '#tbl table', lang, 'sales-invoices', true);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    await shot(`sort-after-click-${lang}-invoices`);
    for (const id of s.created.invoices.splice(0)) await s.api('DELETE', `/sales-invoices/${id}`); // the next language sells the same pieces
  });

  test(`headers sort: whole list in the browser, keyboard, address (${lang})`, { tags: ['e2e', 'tables'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('superadmin', '/setup/karats', lang);
    await expect.poll(() => browser.locator('#tbl tbody tr').count()).toBeGreaterThan(2);
    const seen = await sortEveryColumn(browser, '#tbl table', lang, 'karats', false);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    await browser.locator('#tbl thead th:nth-child(1) .th-sort').focus();
    await browser.keyboard.press('Enter'); await sleep(300);
    const a = (await snap(browser, '#tbl table')).cols[0].aria;
    await browser.keyboard.press('Space'); await sleep(300);
    expect((await snap(browser, '#tbl table')).cols[0].aria).not.toBe(a);
    expect(await browser.evaluate(() => location.search)).toMatch(/sort=.*dir=(asc|desc)/);
    await shot(`sort-after-click-${lang}-karats`);
  });

  // the display tables that used to be fixedOrder: each is sorted in the browser by its own headers (rows against an independent sort)
  test(`headers sort: item fees, branch-stock pieces, reservation lines (${lang})`, { tags: ['e2e', 'tables'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    while (S.length < 3) S.push(await seed());
    await go('superadmin', '/setup/item-fees', lang);
    await expect.poll(() => browser.locator('#fees-table tbody tr').count(), { timeout: 15_000 }).toBeGreaterThan(2);
    expect((await sortEveryColumn(browser, '#fees-table', lang, 'item-fees', false)).length).toBeGreaterThanOrEqual(4);
    await shot(`sort-after-click-${lang}-item-fees`);

    await go('superadmin', '/stock/branch-stock?view=by-item', lang);
    await browser.locator('#run').click();
    await expect.poll(() => browser.locator('#tbl tbody tr').count(), { timeout: 15_000 }).toBeGreaterThan(0);
    await browser.locator('#tbl tbody tr', { hasText: S[0].item.itemName }).first().click();
    await expect.poll(() => browser.locator('#stock-pieces tbody tr').count(), { timeout: 15_000 }).toBeGreaterThan(2);
    expect((await sortEveryColumn(browser, '#stock-pieces', lang, 'branch-stock pieces', false)).length).toBe(4);
    await shot(`sort-after-click-${lang}-stock-pieces`);

    const price = (n: number, s: (typeof S)[number]) => s.api('GET', `/reservations/line-price?itemId=${s.item.id}&quantity=${n}&date=${s.day}`).then((r) => r.body.linePrice as number);
    const lines = [{ itemId: S[0].item.id, quantity: 1 }, { itemId: S[1].item.id, quantity: 3 }, { itemId: S[2].item.id, quantity: 2 }];
    const cash = (await price(1, S[0])) + (await price(3, S[1])) + (await price(2, S[2]));
    const res = await S[0].api('POST', '/reservations', { branchId: S[0].inv.branchId, date: S[0].day, employeeId: (await S[0].api('GET', '/access/me')).body.id, customerName: 'E2E Customer', customerPhone: '01012345678', lines, cash });
    expect(res.status).toBe(201); S[0].created.reservations.push(res.body.id);
    await go('superadmin', `/sales/reservations?open=${res.body.id}`, lang);
    await expect.poll(() => browser.locator('#reservation-lines tbody tr').count(), { timeout: 15_000 }).toBe(3);
    expect((await sortEveryColumn(browser, '#reservation-lines', lang, 'reservation lines', false)).length).toBe(6);
    await shot(`sort-after-click-${lang}-reservation-lines`);
    await S[0].api('DELETE', `/reservations/${res.body.id}`); S[0].created.reservations.pop();
  });
}
