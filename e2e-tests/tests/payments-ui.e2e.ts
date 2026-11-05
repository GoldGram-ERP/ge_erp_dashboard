import { afterAll } from 'e2e';
import { test, expect, seed, capture, stamp, scan, M, LANGS, MAIN_BRANCH, cairoDay, type Lang } from './lib.ts';

// Issue #3 (backend #166) through the real pages: one cash box plus any number of bank rows on Sales, Reservation, Sales return, Expense and
// Expense refund; the totals bar of Sales and Reservation matches the saved document to the piastre; a reservation line is priced by the system,
// read only, equal to the sale price of the same item, count and day; refusals land under the right box. Every record made is deleted after.
let S: Awaited<ReturnType<typeof seed>>;
let R: Awaited<ReturnType<typeof seed>>;   // the pieces the returns sell and take back
const acc: { bank?: string; ids: string[]; labels: string[] } = { ids: [], labels: [] };
const made = { expenses: [] as string[], refunds: [] as string[], types: [] as string[] };
const sg = (l: Lang, k: string) => M(l, 'gold-sales', `salesInvoices.${k}`);
/** "56,581.20" -> 5658120, by the digits only (never a float). */
const piastres = (text: string) => {
  const s = String(text).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[^\d.]/g, '');
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
};
const text2 = (p: number) => `${Math.trunc(p / 100)}.${String(p % 100).padStart(2, '0')}`;
const bar = async (browser: any) => {
  const raw = await browser.evaluate(() => Object.fromEntries([...document.querySelectorAll('#tot [data-cell] b')].map((b) => [(b.parentElement as HTMLElement).dataset.cell, b.textContent ?? ''])));
  return Object.fromEntries(Object.entries(raw as Record<string, string>).map(([k, v]) => [k, piastres(v)])) as Record<'gold' | 'making' | 'gross' | 'discount' | 'paid' | 'left', number>;
};
async function pick(browser: any, screen: any, sel: string, option: string) {
  await browser.locator(`#ws ${sel} [role=combobox]`).tap();
  await screen.getByRole('option', option).tap();
}
/** Fills bank rows 0..n-1 with the accounts made for this file, adding rows as needed. */
async function fillBanks(browser: any, screen: any, amounts: number[]) {
  for (const [i, a] of amounts.entries()) {
    if (i > 0) await browser.locator('#ws [data-addbank]').tap();
    await pick(browser, screen, `[data-k=bank${i}Account]`, acc.labels[i]);
    await browser.locator(`#ws #bm${i}`).fill(text2(a));
  }
  if (!amounts.length) await browser.locator('#ws [data-rmbank="0"]').tap();   // 0 banks: the empty row goes too
}
async function setup() {
  S ??= await seed();
  if (!acc.bank) {
    const bn = `E2E Bank ${stamp()}`;
    acc.bank = (await S.api('POST', '/banks', { bankName: bn })).body.id;
    for (let i = 0; i < 4; i++) {
      const name = `E2E Acc${i} ${stamp()}`;
      acc.ids.push((await S.api('POST', '/bank-accounts', { accountName: name, bankId: acc.bank, commission: '0.00' })).body.id);
      acc.labels.push(`${name} · ${bn}`);
    }
  }
  return S;
}
const sell = async (code: string) => {
  const sale = (pay: any) => R.api('POST', '/sales-invoices', { branchId: MAIN_BRANCH, invoiceType: 'sale', customerName: 'E2E Customer', customerPhone: '01012345678', lines: [{ pieceCode: code }], ...pay });
  const total = (await sale({ cash: 1 })).body.values.total as number;   // the refusal tells the exact total
  const inv = await sale({ cash: total });
  expect(inv.status).toBe(201);
  R.created.invoices.push(inv.body.id);
  return total;
};

for (const [n, lang] of LANGS.entries()) {
  test(`sale (${lang}): cash + 3 banks, the bar equals the saved totals to the piastre, the price breakdown`, { tags: ['e2e', 'sales', 'payments'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    await setup();
    const code = S.pieces[n].pieceCode;
    const seen = await capture(browser, /\/sales-invoices(\?|$)/, ['POST']);
    await go('superadmin', '/sales/invoices?new=create', lang);
    await browser.locator('#ws [data-type=sale]').tap();
    await pick(browser, screen, '[data-k=branchId]', 'Main branch');
    await browser.locator('#ws #pc').fill(code);
    await browser.locator('#ws #addPiece').tap();
    await expect(browser.locator('#ws #lineRows tr[data-line]').first()).toBeVisible();
    await browser.locator('#ws #f-customerPhone').fill('01012345678');
    await browser.locator('#ws #f-customerName').fill('E2E Customer');
    await expect(browser.locator('#ws #tot')).toBeVisible();
    const before = await bar(browser);
    expect(before.gold + before.making).toBe(before.gross);
    expect(before.left).toBe(before.gross);
    // the line price button opens its breakdown: gold + workmanship of the piece = the price
    await browser.locator(`#ws [data-price="${code}"]`).tap();
    await expect(browser.locator(`#ws #how-${code}`)).toBeVisible();
    expect(await browser.evaluate((c: string) => document.getElementById(`how-${c}`)?.textContent ?? '', code)).toContain(text2(before.gross).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    await shot(`pay-sale-${lang}-1-breakdown`);
    // cash + 3 banks, the last bank takes the rest to the piastre
    // whatever the day's gold price: cash about a quarter, two banks with odd piastres, the last bank takes the rest to the piastre
    const cash = Math.floor(before.gross / 4);
    const banks = [Math.floor(before.gross / 5) + 1, Math.floor(before.gross / 6) + 2];
    banks.push(before.gross - cash - banks[0] - banks[1]);
    await browser.locator('#ws #f-cash').fill(text2(cash));
    await fillBanks(browser, screen, banks);
    const after = await bar(browser);
    expect(after).toEqual({ ...before, paid: before.gross, left: 0 });
    await shot(`pay-sale-${lang}-2-paid`);
    expect(await scan(browser)).toEqual([]);
    await browser.locator('#ws #sec-save button[type=submit]').tap();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].body.cash).toBe(cash);
    expect(seen[0].body.bankPayments).toEqual(banks.map((amount, i) => ({ bankAccountId: acc.ids[i], amount })));
    await expect.poll(async () => ((await S.api('GET', `/piece-look-up?pieceCode=${code}`)).body.sold)).toBe(true);
    const list = (await S.api('GET', '/sales-invoices?search=01012345678')).body.items as any[];
    for (const inv of list) if (!S.created.invoices.includes(inv.id)) S.created.invoices.push(inv.id);
    const mine = (await Promise.all(list.map((x) => S.api('GET', `/sales-invoices/${x.id}`)))).map((r) => r.body).find((x) => x.lines.some((l: any) => l.pieceCode === code));
    expect(mine.totals).toMatchObject({ goldTotal: before.gold, makingTotal: before.making, grossTotal: before.gross, total: before.gross, paid: before.gross });
    expect(mine.bankPayments).toEqual(banks.map((amount, i) => ({ bankAccountId: acc.ids[i], amount })));
    // the saved invoice shows the same bar and its three bank rows
    await go('superadmin', `/sales/invoices?open=${mine.id}`, lang);
    await expect(browser.locator('#tot')).toBeVisible();
    expect(await bar(browser)).toEqual({ ...before, paid: before.gross, left: 0 });
    await expect(browser.locator('[data-saved-bank="2"]')).toBeVisible();
    await shot(`pay-sale-${lang}-3-saved`);
  });

  test(`reservation (${lang}): the price is read only, from the system, equal to the sale price of the same item, count and day`, { tags: ['e2e', 'sales', 'payments'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    await setup();
    const seen = await capture(browser, /\/reservations(\?|$)/, ['POST']);
    const priced = (await S.api('GET', `/reservations/line-price?itemId=${S.item.id}&quantity=3&date=${cairoDay()}`)).body;
    const piece = (await S.api('GET', `/piece-look-up?pieceCode=${S.pieces[3].pieceCode}`)).body;   // a piece of the same item, priced to sell today
    expect(priced.linePrice).toBe(piece.livePrice * 3);
    expect(priced.goldValue + priced.makingCharge).toBe(priced.linePrice);
    await go('superadmin', '/sales/reservations?new=create', lang);
    await pick(browser, screen, '[data-k=branchId]', 'Main branch');
    await browser.locator('#ws #f-customerPhone').fill('01098765432');
    await browser.locator('#ws #f-customerName').fill('E2E Reserver');
    await pick(browser, screen, '[data-k=line0Item]', `${S.item.itemName} · 21`);
    await browser.locator('#ws #iq0').fill('3');
    await expect(browser.locator('#ws #ip0 .price-btn')).toBeVisible();
    expect(await browser.evaluate(() => document.querySelector('#ip0')?.tagName ?? '')).toBe('OUTPUT');   // nothing to type
    expect(piastres(await browser.evaluate(() => document.querySelector('#ip0 .price-btn')?.textContent ?? ''))).toBe(priced.linePrice);
    await browser.locator('#ws #ip0 .price-btn').tap();
    await expect(browser.locator('#ws #how-l0')).toBeVisible();
    await shot(`pay-reservation-${lang}-1-price`);
    const b = await bar(browser);
    expect(b).toEqual({ gold: priced.goldValue, making: priced.makingCharge, gross: priced.linePrice, discount: 0, paid: 0, left: priced.linePrice });
    await browser.locator('#ws #f-cash').fill(text2(priced.linePrice - 5000));
    await fillBanks(browser, screen, [5000]);
    expect((await bar(browser)).left).toBe(0);
    await shot(`pay-reservation-${lang}-2-paid`);
    expect(await scan(browser)).toEqual([]);
    await browser.locator('#ws #sec-save button[type=submit]').tap();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].body.lines).toEqual([{ itemId: S.item.id, quantity: 3 }]);   // no typed price
    expect(seen[0].body).toMatchObject({ cash: priced.linePrice - 5000, bankPayments: [{ bankAccountId: acc.ids[0], amount: 5000 }] });
    await expect.poll(async () => ((await S.api('GET', '/reservations?search=01098765432')).body.items as any[]).length).toBeGreaterThan(0);
    const rs = (await S.api('GET', '/reservations?search=01098765432')).body.items as any[];
    for (const r of rs) if (!S.created.reservations.includes(r.id)) S.created.reservations.push(r.id);
    const saved = (await S.api('GET', `/reservations/${rs[0].id}`)).body;
    expect(saved.totals).toMatchObject({ goldTotal: priced.goldValue, makingTotal: priced.makingCharge, grossTotal: priced.linePrice, paid: priced.linePrice, remaining: 0 });
    await go('superadmin', `/sales/reservations?open=${saved.id}`, lang);
    await expect(browser.locator('#tot')).toBeVisible();
    expect(await bar(browser)).toEqual({ ...b, paid: priced.linePrice, left: 0 });
    await shot(`pay-reservation-${lang}-3-saved`);
  });
}

// The three screens that sent one bank account: 0, 1 and 3 bank rows, the language alternating.
const COUNTS = [[0, 'ar'], [1, 'en'], [3, 'ar']] as const;
for (const [count, lang] of COUNTS) {
  test(`sales return (${lang}): cash + ${count} bank rows`, { tags: ['e2e', 'sales', 'payments'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    await setup(); R ??= await seed();
    const code = R.pieces[{ 0: 0, 1: 1, 3: 2 }[count]].pieceCode;
    await sell(code);
    const seen = await capture(browser, /\/returns(\?|$)/, ['POST']);
    await go('superadmin', '/sales/returns?new=create', lang);
    await pick(browser, screen, '[data-k=branchId]', 'Main branch');
    await browser.locator('#ws #pc').fill(code);
    await expect(browser.locator('#ws #f-cashRefund')).toBeVisible();
    const banks = [100, 201, 302].slice(0, count);
    await browser.locator('#ws #f-cashRefund').fill('10.00');
    await fillBanks(browser, screen, banks);
    expect(piastres(await browser.evaluate(() => document.querySelector('#paySum')?.textContent ?? ''))).toBe(1000 + banks.reduce((a, b) => a + b, 0));
    await shot(`pay-return-${lang}-${count}banks`);
    await browser.locator('#ws #sec-save button[type=submit]').tap();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].body).toMatchObject({ pieceCode: code, cashRefund: 1000, bankPayments: banks.map((amount, i) => ({ bankAccountId: acc.ids[i], amount })) });
    expect(Object.keys(seen[0].body)).not.toContain('bankAccountId');
    const returns = async () => (await R.api('GET', `/returns?search=${code}`)).body.items as any[];
    await expect.poll(async () => (await returns()).length).toBe(1);   // the request is seen before its answer
    const mine = await returns();
    for (const r of mine) R.created.returns.push(r.id);
    const saved = (await S.api('GET', `/returns/${mine[0].id}`)).body;
    expect(saved).toMatchObject({ cashRefund: 1000, bankRefund: banks.reduce((a, b) => a + b, 0), refundTotal: 1000 + banks.reduce((a, b) => a + b, 0) });
  });

  for (const kind of ['expense', 'refund'] as const) {
    test(`${kind} (${lang}): cash + ${count} bank rows, the code picks the type`, { tags: ['e2e', 'money', 'payments'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
      await setup();
      const type = (await S.api('POST', '/expense-types', { expenseTypeName: `E2E Type ${stamp()}` })).body;
      made.types.push(type.id);
      const path = kind === 'expense' ? '/expenses' : '/expense-refunds';
      const seen = await capture(browser, new RegExp(`${path}(\\?|$)`), ['POST']);
      await go('superadmin', `/expenses/expenses?new=${kind === 'expense' ? 'createExpense' : 'createRefund'}`, lang);
      await pick(browser, screen, '[data-k=branchId]', 'Main branch');
      await browser.locator('#ws #f-expenseCode').fill(String(type.expenseCode));
      await expect.poll(() => browser.evaluate(() => document.querySelector('#ws [data-k=expenseTypeId] [role=combobox]')?.textContent ?? '')).toContain(type.expenseTypeName);
      const note = `E2E ${stamp()}`;
      await browser.locator('#ws #f-note').fill(note);
      const banks = [150, 251, 352].slice(0, count);
      await browser.locator('#ws #f-cash').fill('25.00');
      await fillBanks(browser, screen, banks);
      await shot(`pay-${kind}-${lang}-${count}banks`);
      await browser.locator('#ws #sec-save button[type=submit]').tap();
      await expect.poll(() => seen.length).toBe(1);
      expect(seen[0].body).toEqual({ date: cairoDay(), branchId: MAIN_BRANCH, expenseTypeId: type.id, note, cash: 2500, bankPayments: banks.map((amount, i) => ({ bankAccountId: acc.ids[i], amount })) });
      const find = async () => (await S.api('GET', `${path}?search=${encodeURIComponent(note)}`)).body.items as any[];
      await expect.poll(async () => (await find()).length).toBe(1);
      const list = await find();
      (kind === 'expense' ? made.expenses : made.refunds).push(...list.map((x) => x.id));
      expect(list[0]).toMatchObject({ cash: 2500, bankAmount: banks.reduce((a, b) => a + b, 0), total: 2500 + banks.reduce((a, b) => a + b, 0) });
      // the saved document lists every bank row
      await go('superadmin', `/expenses/expenses?view=${kind === 'expense' ? 'history' : 'refunds'}`, lang);
      await browser.locator(`tbody tr:has-text("${note}")`).tap();
      if (count) await expect(browser.locator(`[data-saved-bank="${count - 1}"]`)).toBeVisible();
      await shot(`pay-${kind}-${lang}-${count}banks-saved`);
    });
  }
}

for (const lang of LANGS) {
  test(`refusals (${lang}): nothing paid, the same account twice, an account gone before Save, a refund above the price`, { tags: ['e2e', 'payments'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    await setup();
    const type = (await S.api('POST', '/expense-types', { expenseTypeName: `E2E Type ${stamp()}` })).body;
    made.types.push(type.id);
    const seen = await capture(browser, /\/expenses(\?|$)/, ['POST']);
    await go('superadmin', '/expenses/expenses?new=createExpense', lang);
    await pick(browser, screen, '[data-k=branchId]', 'Main branch');
    await browser.locator('#ws #f-expenseCode').fill(String(type.expenseCode));
    // 1. nothing paid: said once under the block, nothing sent
    await browser.locator('#ws #sec-save button[type=submit]').tap();
    await expect(browser.locator('#ws #paySumErr .err')).toHaveText(M(lang, 'expenses', 'expenses.amountsRequired'));
    expect(seen.length).toBe(0);
    await shot(`pay-refuse-${lang}-1-nothing`);
    // 2. the same account on two rows: under the second row's account
    await fillBanks(browser, screen, [100]);
    await browser.locator('#ws [data-addbank]').tap();
    await pick(browser, screen, '[data-k=bank1Account]', acc.labels[0]);
    await browser.locator('#ws #bm1').fill('2.00');
    await browser.locator('#ws #sec-save button[type=submit]').tap();
    await expect(browser.locator('#ws [data-k=bank1Account] .err')).toHaveText(M(lang, 'common', 'fieldErrors.duplicateAccount'));
    expect(seen.length).toBe(0);
    await shot(`pay-refuse-${lang}-2-twice`);
    // 3. the server refuses an account deleted after it was picked: its text lands under that row (the 2nd sent row = form row 1)
    await browser.locator('#ws [data-rmbank="1"]').tap();
    await browser.locator('#ws [data-addbank]').tap();
    const doomed = `E2E Gone ${stamp()}`;
    const gone = (await S.api('POST', '/bank-accounts', { accountName: doomed, bankId: acc.bank, commission: '0.00' })).body.id;
    await go('superadmin', '/expenses/expenses?new=createExpense', lang);   // reload so the new account is offered
    await pick(browser, screen, '[data-k=branchId]', 'Main branch');
    await browser.locator('#ws #f-expenseCode').fill(String(type.expenseCode));
    await fillBanks(browser, screen, [100]);
    await browser.locator('#ws [data-addbank]').tap();
    await browser.locator('#ws [data-k=bank1Account] [role=combobox]').tap();
    await screen.getByRole('option', `${doomed} · ${acc.labels[0].split(' · ')[1]}`).tap();
    await browser.locator('#ws #bm1').fill('2.00');
    expect((await S.api('DELETE', `/bank-accounts/${gone}`)).status).toBeLessThan(300);
    await browser.locator('#ws #sec-save button[type=submit]').tap();
    await expect.poll(() => seen.length).toBe(1);
    await expect(browser.locator('#ws [data-k=bank1Account] .err')).toBeVisible();
    expect(await browser.evaluate(() => (document.querySelector('#ws [data-k=bank0Account] .err') ? 'shown' : 'none'))).toBe('none');
    await shot(`pay-refuse-${lang}-3-gone`);
    // 4. a refund above the piece's price: the server's 409, said in a banner
    R ??= await seed();
    const code = R.pieces[3].pieceCode;
    if (!(await R.api('GET', `/piece-look-up?pieceCode=${code}`)).body.sold) await sell(code);
    await go('superadmin', '/sales/returns?new=create', lang);
    await pick(browser, screen, '[data-k=branchId]', 'Main branch');
    await browser.locator('#ws #pc').fill(code);
    await browser.locator('#ws #f-cashRefund').fill('99999999.00');
    await browser.locator('#ws #sec-save button[type=submit]').tap();
    await expect(browser.locator('#ws #banners .note')).toHaveText(M(lang, 'gold-sales', 'returns.refundAboveLinePrice'));
    await shot(`pay-refuse-${lang}-4-above`);
  });
}

afterAll(async () => {
  if (!S) return;
  for (const id of made.expenses) await S.api('DELETE', `/expenses/${id}`);
  for (const id of made.refunds) await S.api('DELETE', `/expense-refunds/${id}`);
  if (R) await R.remove();
  await S.remove();
  for (const id of made.types) await S.api('DELETE', `/expense-types/${id}`);
  for (const id of acc.ids) await S.api('DELETE', `/bank-accounts/${id}`);
  if (acc.bank) await S.api('DELETE', `/banks/${acc.bank}`);
});
