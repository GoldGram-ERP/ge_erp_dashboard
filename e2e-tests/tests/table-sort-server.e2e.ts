import { afterAll } from 'e2e';
import { test, expect, seed, LANGS, MAIN_BRANCH, apiAs, stamp, cairoDay } from './lib.ts';

// Paged lists that sort on the SERVER (ViewConfig.serverSort on): with more than one page a header click sends sort/dir, the page goes back to 1,
// and what is shown is the first page of an independent sort of ALL the rows (fetched through the API), page 2 continues the same order.
// Every sorted column here is a number or a date (no text column), so the independent sort compares values; tied rows may come in any order, so the
// check compares each row's sort VALUE (looked up by the row's number) and that no row repeats between the two pages.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGE = 20, MANY = 26;
type Api = Awaited<ReturnType<typeof apiAs>>;
type Row = Record<string, any>;

const AR = '٠١٢٣٤٥٦٧٨٩';
const digits = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/\D/g, ''));
const day = (back: number) => { const d = new Date(`${cairoDay()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); };

async function all(api: Api, path: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page < 20; page++) {
    const r = await api('GET', `${path}${path.includes('?') ? '&' : '?'}page=${page}`);
    expect(r.status, `${path} page ${page}`).toBe(200);
    out.push(...r.body.items);
    if (out.length >= r.body.total || !r.body.items.length) break;
  }
  return out;
}

type Screen = { name: string; path: string; list: string; numberKey: string; numberCol: number; sortable: { key: string; col: number; of: (r: Row) => number | string }[]; make: () => Promise<void>; drop: () => Promise<void> };
const made = new Map<string, Promise<void>>();
const screens: Screen[] = [];
afterAll(async () => { for (const s of screens) if (made.has(s.name)) await s.drop().catch(() => {}); });

// ---- gold prices: a set a day, going back; the newest-saved set is the price in use, so the original prices are saved again at the end
const goldPrices = (() => {
  let api: Api, keep: Row | undefined;
  const s: Screen = {
    name: 'gold-prices', path: '/setup/gold-prices', list: '/gold-prices', numberKey: 'documentNumber', numberCol: 0,
    sortable: [{ key: 'date', col: 1, of: (r) => r.date.slice(0, 10) }, { key: 'sellPrice', col: 2, of: (r) => r.sellPrice }, { key: 'buyPrice', col: 3, of: (r) => r.buyPrice }, { key: 'silverPrice', col: 4, of: (r) => r.silverPrice }],
    async make() {
      api = await apiAs('superadmin');
      const now = await api('GET', '/gold-prices/today'); keep = now.status === 200 ? now.body : undefined;
      for (let i = 0; i < MANY; i++) {
        const r = await api('POST', '/gold-prices', { date: day(i + 1), sellPrice: 400000 + ((i * 7) % MANY) * 1000, buyPrice: 380000 + ((i * 11) % MANY) * 700, silverPrice: 4000 + ((i * 5) % MANY) * 30 });
        expect(r.status, JSON.stringify(r.body)).toBe(201);
      }
      if (keep) expect((await api('POST', '/gold-prices', { date: cairoDay(), sellPrice: keep.sellPrice, buyPrice: keep.buyPrice, silverPrice: keep.silverPrice })).status).toBe(201);
    },
    async drop() { /* a saved price set cannot be deleted (the screen says so); the local database is dropped with the stack */ },
  };
  return s;
})();

// ---- bank transfers: two accounts of one bank, a transfer a day going back
const bankTransfers = (() => {
  let api: Api; const ids: string[] = []; let bankId = '', a = '', b = '';
  const s: Screen = {
    name: 'bank-transfers', path: '/money/bank-transfers', list: '/bank-transfers', numberKey: 'documentNumber', numberCol: 0,
    sortable: [{ key: 'documentNumber', col: 0, of: (r) => r.documentNumber }, { key: 'date', col: 2, of: (r) => r.date.slice(0, 10) }, { key: 'amount', col: 6, of: (r) => r.amount }],
    async make() {
      api = await apiAs('superadmin');
      bankId = (await api('POST', '/banks', { bankName: `E2E SortBank ${stamp()}` })).body.id;
      a = (await api('POST', '/bank-accounts', { accountName: `E2E SortAcc A ${stamp()}`, bankId, commission: '1.00' })).body.id;
      b = (await api('POST', '/bank-accounts', { accountName: `E2E SortAcc B ${stamp()}`, bankId, commission: '1.00' })).body.id;
      for (let i = 0; i < MANY; i++) {
        const r = await api('POST', '/bank-transfers', { branchId: MAIN_BRANCH, date: day((i * 7) % MANY), fromAccountId: i % 2 ? a : b, toAccountId: i % 2 ? b : a, amount: 10000 + ((i * 11) % MANY) * 2500, note: `E2E sort ${i}` });
        expect(r.status, JSON.stringify(r.body)).toBe(201); ids.push(r.body.id);
      }
    },
    async drop() { for (const id of ids) await api('DELETE', `/bank-transfers/${id}`); await api('DELETE', `/bank-accounts/${a}`); await api('DELETE', `/bank-accounts/${b}`); await api('DELETE', `/banks/${bankId}`); },
  };
  return s;
})();

// ---- returns: 26 pieces bought, coded, sold for cash and taken back with distinct refunds (all dated today: a return cannot be dated before its sale)
const returns = (() => {
  let S: Awaited<ReturnType<typeof seed>>;
  const s: Screen = {
    name: 'returns', path: '/sales/returns', list: '/returns', numberKey: 'returnNumber', numberCol: 0,
    sortable: [{ key: 'returnNumber', col: 0, of: (r) => r.returnNumber }, { key: 'date', col: 1, of: (r) => r.date.slice(0, 10) }, { key: 'refundTotal', col: 3, of: (r) => r.refundTotal }],
    async make() {
      S = await seed();
      const inv = (await S.api('POST', '/purchase-invoices', { date: S.day, branchId: MAIN_BRANCH, lines: [{ itemId: S.item.id, quantity: MANY }] })).body;
      const coding = (await S.api('GET', `/purchase-coding/invoices/${inv.id}`)).body;
      const piece = { tagPrice: 200000, salePrice: 190000 };
      expect((await S.api('POST', `/purchase-coding/invoices/${inv.id}`, { lines: [{ lineId: coding.lines[0].lineId, pieces: Array.from({ length: MANY }, () => piece) }] })).status).toBe(201);
      const pieces = await all(S.api, `/pieces?invoiceId=${inv.id}`);
      expect(pieces.length).toBe(MANY);
      for (let i = 0; i < MANY; i++) {
        const sale = (pay: object) => S.api('POST', '/sales-invoices', { branchId: MAIN_BRANCH, invoiceType: 'sale', customerName: 'E2E Customer', customerPhone: '01012345678', lines: [{ pieceCode: pieces[i].pieceCode }], ...pay });
        const total = (await sale({ cash: 1 })).body.values.total as number;
        const sold = await sale({ cash: total }); expect(sold.status).toBe(201); S.created.invoices.push(sold.body.id);
        const ret = await S.api('POST', '/returns', { branchId: MAIN_BRANCH, date: S.day, pieceCode: pieces[i].pieceCode, cashRefund: 5000 + ((i * 7) % MANY) * 1000 });
        expect(ret.status, JSON.stringify(ret.body)).toBe(201); S.created.returns.push(ret.body.id);
      }
    },
    async drop() { await S.remove(); },
  };
  return s;
})();

// ---- purchase invoices: three items of different weights, 1 to 3 lines, different counts, a day each going back
const purchases = (() => {
  let S: Awaited<ReturnType<typeof seed>>; const ids: string[] = []; const items: string[] = [];
  const s: Screen = {
    name: 'purchase-invoices', path: '/buy/purchases', list: '/purchase-invoices', numberKey: 'invoiceNumber', numberCol: 0,
    sortable: [
      { key: 'invoiceNumber', col: 0, of: (r) => r.invoiceNumber }, { key: 'date', col: 1, of: (r) => r.date.slice(0, 10) }, { key: 'lineCount', col: 2, of: (r) => r.lineCount },
      { key: 'totalQuantity', col: 3, of: (r) => r.totals.totalQuantity }, { key: 'totalWeight', col: 4, of: (r) => Number(r.totals.totalWeight) },
    ],
    async make() {
      S = await seed();
      const form = (n: number, weight: number) => ({ itemName: `E2E SortRing ${n} ${S.tag}`, isCoded: true, itemType: 'gold', categoryId: S.cat.id, karat: '21', weight, workmanshipMode: 'per_gram', workmanshipValue: '50.00', cashbackMode: 'per_gram', cashbackValue: '0.00' });
      const two = (await S.api('POST', '/items', form(2, 3000))).body, three = (await S.api('POST', '/items', form(3, 7000))).body;
      items.push(two.id, three.id);
      const ofItems = [S.item.id, two.id, three.id];
      for (let i = 0; i < MANY; i++) {
        const lines = ofItems.slice(0, 1 + (i % 3)).map((itemId, k) => ({ itemId, quantity: 1 + ((i * 5 + k * 3) % 9) }));
        const r = await S.api('POST', '/purchase-invoices', { date: day((i * 7) % MANY), branchId: MAIN_BRANCH, lines });
        expect(r.status, JSON.stringify(r.body)).toBe(201); ids.push(r.body.id);
      }
    },
    async drop() {
      for (const id of ids) await S.api('DELETE', `/purchase-invoices/${id}`);
      for (const id of items) await S.api('DELETE', `/items/${id}`);
      await S.remove();
    },
  };
  return s;
})();
screens.push(goldPrices, bankTransfers, returns, purchases);

type Snap = { cols: { i: number; sortable: boolean; aria: string | null }[]; codes: number[]; pager: string; nextOff: boolean };
const snap = (browser: any, numberCol: number): Promise<Snap> => browser.evaluate((nc: number) => {
  const t = document.querySelector('#tbl table') as HTMLTableElement;
  const cols = (Array.from(t.querySelectorAll(':scope > thead > tr:first-child > th')) as HTMLTableCellElement[]).map((th, i) => ({ i, sortable: th.dataset.sort === 'on', aria: th.getAttribute('aria-sort') }));
  const rows = Array.from(t.querySelectorAll(':scope > tbody > tr')).filter((r) => !r.classList.contains('grp') && !r.classList.contains('foot'));
  const next = document.querySelector('#next') as HTMLButtonElement | null;
  return { cols, codes: rows.map((r) => (r.children[nc]?.textContent ?? '').trim()), pager: document.querySelector('#pager > span')?.textContent ?? '', nextOff: !next || next.disabled };
}, numberCol).then((s: any) => ({ ...s, codes: s.codes.map((c: string) => digits(c)) }));

for (const lang of LANGS) {
  for (const s of screens) {
    test(`server sort across pages: ${s.name} (${lang})`, { tags: ['e2e', 'tables'], requires: ['browser'] }, async ({ go, browser, shot }) => {
      if (!made.has(s.name)) made.set(s.name, s.make());
      await made.get(s.name);
      const rows = await all(await apiAs('superadmin'), s.list);
      expect(rows.length, `${s.name}: rows to sort`).toBeGreaterThanOrEqual(PAGE + 1);
      const byNumber = new Map(rows.map((r) => [Number(r[s.numberKey]), r]));
      await go('superadmin', s.path, lang);
      await expect.poll(async () => (await snap(browser, s.numberCol)).codes.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect.poll(async () => (await snap(browser, s.numberCol)).nextOff, { timeout: 10_000 }).toBe(false);
      const first = await snap(browser, s.numberCol);
      // only the columns the backend sorts are sortable on this multi-page list
      expect(first.cols.filter((c) => c.sortable).map((c) => c.i), `${s.name}: sortable headers`).toEqual(s.sortable.map((c) => c.col));

      const sorted = (c: (typeof s.sortable)[number], dir: 'asc' | 'desc') => { const k = rows.map(c.of); k.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)); return dir === 'asc' ? k : k.reverse(); };
      const seen = new Set<number>();
      // waits for the list to show `page` of the asked order (the server answers after the click), then asserts it
      const check = async (c: (typeof s.sortable)[number], dir: 'asc' | 'desc', page: number, label: string) => {
        const want = sorted(c, dir).slice((page - 1) * PAGE, page * PAGE);
        const keysOf = async () => { const sn = await snap(browser, s.numberCol); return { sn, keys: sn.codes.map((n) => (byNumber.get(n) ? c.of(byNumber.get(n)!) : `unknown row ${n}`)) }; };
        for (let t = 0; t < 40; t++) { const { sn, keys } = await keysOf(); if (JSON.stringify(keys) === JSON.stringify(want) && sn.cols[c.col].aria === (dir === 'asc' ? 'ascending' : 'descending')) break; await sleep(250); }
        const { sn, keys } = await keysOf();
        expect(sn.cols[c.col].aria, `${label} aria-sort`).toBe(dir === 'asc' ? 'ascending' : 'descending');
        expect(keys, `${label}: page ${page} of the independent sort`).toEqual(want);
        for (const n of sn.codes) { expect(seen.has(n), `${label}: row ${n} repeated`).toBe(false); seen.add(n); }
      };
      for (const c of s.sortable) {
        await browser.locator(`#tbl thead tr:first-child th:nth-child(${c.col + 1}) .th-sort`).click();
        // the first tap starts at the column's natural direction (numbers and dates descending), the second flips it
        await expect.poll(async () => (await snap(browser, s.numberCol)).cols[c.col].aria, { timeout: 10_000 }).toMatch(/ascending|descending/);
        const dirA = (await snap(browser, s.numberCol)).cols[c.col].aria === 'ascending' ? 'asc' : 'desc';
        for (const dir of [dirA, dirA === 'asc' ? 'desc' : 'asc'] as const) {
          if (dir !== dirA) { await browser.locator(`#tbl thead tr:first-child th:nth-child(${c.col + 1}) .th-sort`).click(); } // clicked on page 2: the list goes back to page 1
          seen.clear();
          await check(c, dir, 1, `${s.name} ${c.key} ${dir}`);
          if (dir === dirA) await shot(`server-sort-${s.name}-${lang}-${c.key}-p1`);
          await browser.locator('#next').click();
          await check(c, dir, 2, `${s.name} ${c.key} ${dir}`);
          if (dir === dirA) await shot(`server-sort-${s.name}-${lang}-${c.key}-p2`);
        }
        // back to page 1 for the next column (a header click on page 1 would also do, this keeps the sequence plain)
        await browser.locator('#prev').click(); await sleep(400);
      }
    });
  }
}
