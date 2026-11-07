import { afterAll } from 'e2e';
import { test, expect, seed, capture } from './lib.ts';

// Sales return through the real form: a sold piece is returned with a cash refund; exact POST body captured; return and invoice deleted in cleanup.
let S: Awaited<ReturnType<typeof seed>>;

test('sales return UI: cash refund of a sold piece, body captured, saved', { tags: ['e2e', 'sales'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
  S ??= await seed();
  const code = S.pieces[0].pieceCode;
  const sale = (pay: any) => S.api('POST', '/sales-invoices', { branchId: S.inv.branchId, invoiceType: 'sale', customerName: 'E2E Customer', customerPhone: '01012345678', lines: [{ pieceCode: code }], ...pay });
  const total = (await sale({ cash: 1 })).body.values.total as number; // the refusal tells the exact total
  const inv = await sale({ cash: total });
  expect(inv.status).toBe(201);
  S.created.invoices.push(inv.body.id);
  const seen = await capture(browser, /\/returns(\?|$)/, ['POST']);
  await go('superadmin', '/sales/returns?new=create', 'en');
  await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
  await screen.getByRole('option', 'Main branch').tap();
  await browser.locator('#ws #pc').fill(code);
  await expect(browser.locator('#ws #f-cashRefund')).toBeVisible();
  await browser.locator('#ws #f-cashRefund').fill('100.00');
  await shot('return-1-filled');
  await browser.locator('#ws #sec-save button[type=submit]').tap();
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0].body).toMatchObject({ pieceCode: code, cashRefund: 10000 });
  await shot('return-2-saved');
  // the request is captured when it leaves the browser: wait for the saved return to show in the list
  const find = async () => ((await S.api('GET', '/returns')).body.items as any[]).filter((r) => r.pieceCode === code || r.lines?.some?.((l: any) => l.pieceCode === code));
  await expect.poll(async () => (await find()).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const mine = await find();
  for (const r of mine) S.created.returns.push(r.id);
});

afterAll(async () => { if (S) await S.remove(); });
