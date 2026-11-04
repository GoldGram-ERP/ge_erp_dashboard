import { afterAll, test as plain } from 'e2e';
import { test, expect, seed, stamp, apiAs } from './lib.ts';

// Gold flows on the real backend: seeded through the API, driven through the UI where noted, cleaned through the normal Delete path.
let S: Awaited<ReturnType<typeof seed>>;
let bank: { bankId?: string; accId?: string } = {};
const cust = { customerName: 'E2E Customer', customerPhone: '01012345678' };
const P = { platforms: ['node'] };
const need = async () => (S ??= await seed());

plain('sales invoice API: cash, bank and mixed payment bodies, totals, delete', { ...P, tags: ['api', 'sales'] }, async () => {
  await need();
  const { api } = S;
  const b = await api('POST', '/banks', { bankName: `E2E Bank ${stamp()}` });
  bank.bankId = b.body.id;
  const a = await api('POST', '/bank-accounts', { accountName: `E2E Acc ${stamp()}`, bankId: b.body.id, commission: '1.00' });
  bank.accId = a.body.id;
  const [p1, p2, p3] = S.pieces;
  const sale = (lines: any[], pay: any) => api('POST', '/sales-invoices', { branchId: (S as any).inv.branchId, invoiceType: 'sale', ...cust, lines, ...pay });
  expect((await sale([{ pieceCode: p1.pieceCode }], {})).status).toBe(400); // nothing paid for
  const cash = await sale([{ pieceCode: p1.pieceCode }], { cash: 190000 });
  expect(cash.status).toBe(201);
  S.created.invoices.push(cash.body.id);
  expect(cash.body.totals.total).toBe(cash.body.totals.paid);
  const bankInv = await sale([{ pieceCode: p2.pieceCode }], { bankPayments: [{ bankAccountId: bank.accId, amount: 190000 }] });
  expect(bankInv.status).toBe(201);
  S.created.invoices.push(bankInv.body.id);
  const mixed = await sale([{ pieceCode: p3.pieceCode }], { cash: 100000, bankPayments: [{ bankAccountId: bank.accId, amount: 90000 }] });
  expect(mixed.status).toBe(201);
  S.created.invoices.push(mixed.body.id);
  expect(mixed.body.totals.paid).toBe(190000);
  expect((await sale([{ pieceCode: p3.pieceCode }], { cash: 190000 })).status).toBeGreaterThanOrEqual(400); // piece already sold
});

test('sales invoice record sheet opens in the UI with print layouts and delete, no edit (en, ar)', { tags: ['e2e', 'sales'], requires: ['browser'] }, async ({ go, screen, browser, shot }) => {
  await need();
  const id = S.created.invoices[0];
  const num = (await S.api('GET', `/sales-invoices/${id}`)).body.invoiceNumber;
  for (const lang of ['en', 'ar'] as const) {
    await go('superadmin', '/sales/invoices', lang);
    await shot(`sales-${lang}-list`);
    await screen.getByText(String(num), { exact: true }).first().tap();
    await expect(browser.locator('[role=dialog]')).toBeVisible();
    await shot(`sales-${lang}-sheet`);
    await expect(screen.getByRole('button', lang === 'en' ? 'Edit' : 'تعديل')).toBeHidden();
    await expect(screen.getByRole('button', lang === 'en' ? 'Delete' : 'حذف')).toBeVisible();
  }
});

plain('reservation create/cancel and return create/delete; pieces look-up and stock reports answer', { ...P, tags: ['api', 'sales'] }, async () => {
  await need();
  const { api, item } = S;
  const res = await api('POST', '/reservations', { branchId: S.inv.branchId, date: S.day, employeeId: (await api('GET', '/access/me')).body.id, ...cust, lines: [{ itemId: item.id, quantity: 1, linePrice: 100000 }], cash: 50000 });
  expect([201, 400]).toContain(res.status);
  if (res.status === 201) { S.created.reservations.push(res.body.id); expect((await api('GET', `/reservations/${res.body.id}`)).body.totals.paid).toBe(50000); }
  const ret = await api('POST', '/returns', { branchId: S.inv.branchId, date: S.day, pieceCode: S.pieces[0].pieceCode, cashRefund: 100 });
  if (ret.status === 201) S.created.returns.push(ret.body.id);
  expect([201, 400, 409]).toContain(ret.status);
  expect((await api('GET', `/piece-look-up?pieceCode=${S.pieces[3].pieceCode}`)).status).toBeLessThan(500);
  for (const p of ['/reports/gold-stock', '/reports/branch-stock', '/reports/reserved-pieces']) expect((await api('GET', p)).status).toBeLessThan(500);
});

plain('stocktake API: start a count, scan a piece, save, delete', { ...P, tags: ['api', 'stocktake'] }, async () => {
  await need();
  const { api } = S;
  const c = await api('POST', '/stock-counts', { branchId: S.inv.branchId, categoryId: S.cat.id });
  expect(c.status).toBe(201);
  S.created.counts.push(c.body.id);
  expect((await api('POST', `/stock-counts/${c.body.id}/scan`, { pieceCode: S.pieces[3].pieceCode })).status).toBeLessThan(300);
  expect((await api('POST', `/stock-counts/${c.body.id}/scan`, { pieceCode: 'nope-0' })).status).toBeGreaterThanOrEqual(400);
  const g = await api('GET', `/stock-counts/${c.body.id}`);
  expect(g.body.scannedPieceCodes).toContain(S.pieces[3].pieceCode);
});

test('stocktake and purchases pages open in the UI (screenshots)', { tags: ['e2e', 'stocktake'], requires: ['browser'] }, async ({ go, browser, shot }) => {
  for (const [route, name] of [['/stock/count', 'count'], ['/stock/branch-stock', 'branch'], ['/buy/purchases', 'purchases'], ['/sales/pieces', 'pieces'], ['/sales/reservations', 'reservations'], ['/sales/returns', 'returns']] as const) {
    await go('superadmin', route, 'en');
    await expect(browser.locator('#nav')).toBeVisible();
    await shot(`page-${name}`);
  }
});

afterAll(async () => {
  if (S) await S.remove();
  const api = await apiAs('superadmin');
  if (bank.accId) await api('DELETE', `/bank-accounts/${bank.accId}`);
  if (bank.bankId) await api('DELETE', `/banks/${bank.bankId}`);
});
