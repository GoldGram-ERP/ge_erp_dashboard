import { afterAll } from 'e2e';
import { test, expect, seed, capture } from './lib.ts';

// Reservation through the real form (the line priced by the system, paid in full), then converted to an invoice (?new=create&reservation=<id>);
// bodies captured; everything deleted in cleanup.
let S: Awaited<ReturnType<typeof seed>>;

test('reservation UI: create paid in cash, then convert to a sales invoice', { tags: ['e2e', 'sales'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
  S ??= await seed();
  const seenR = await capture(browser, /\/reservations(\?|$)/, ['POST']);
  await go('superadmin', '/sales/reservations?new=create', 'en');
  await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
  await screen.getByRole('option', 'Main branch').tap();
  await browser.locator('#ws #f-customerPhone').fill('01012345678');
  await browser.locator('#ws #f-customerName').fill('E2E Customer');
  await browser.locator('#ws [data-k=line0Item] [role=combobox]').tap();
  await screen.getByRole('option', `E2E Ring ${S.tag} · 21`).tap();
  await browser.locator('#ws #iq0').fill('1');
  await expect(browser.locator('#ws #ip0 .price-btn')).toBeVisible();
  const price = (await S.api('GET', `/reservations/line-price?itemId=${S.item.id}&quantity=1&date=${S.day}`)).body.linePrice as number;
  await browser.locator('#ws #f-cash').fill(`${Math.trunc(price / 100)}.${String(price % 100).padStart(2, '0')}`);
  await shot('reservation-1-filled');
  await browser.locator('#ws #sec-save button[type=submit]').tap();
  await expect.poll(() => seenR.length).toBe(1);
  expect(seenR[0].body).toMatchObject({ customerPhone: '01012345678', customerName: 'E2E Customer', lines: [{ itemId: S.item.id, quantity: 1 }], cash: price });
  await shot('reservation-2-saved');
  const rs = (await S.api('GET', '/reservations?search=01012345678')).body.items as any[];
  expect(rs.length).toBeGreaterThan(0);
  for (const r of rs) S.created.reservations.push(r.id);
  // convert
  const seenI = await capture(browser, /\/sales-invoices(\?|$)/, ['POST']);
  await go('superadmin', `/sales/invoices?new=create&reservation=${rs[0].id}`, 'en');
  await expect(browser.locator('#ws #pc')).toBeVisible();
  await browser.locator('#ws [data-type=sale]').tap();
  await browser.locator('#ws #pc').fill(S.pieces[0].pieceCode);
  await browser.locator('#ws #addPiece').tap();
  await expect(browser.locator('#ws #lineRows tr').first()).toBeVisible();
  await shot('reservation-3-convert-piece-added');
  await browser.locator('#ws #sec-save button[type=submit]').tap();
  await expect.poll(() => seenI.length).toBe(1);
  expect(seenI[0].body).toMatchObject({ invoiceType: 'sale', reservationId: rs[0].id, bankPayments: [], lines: [{ pieceCode: S.pieces[0].pieceCode }] });
  await shot('reservation-4-converted');
  for (const inv of (await S.api('GET', '/sales-invoices?search=01012345678')).body.items as any[]) S.created.invoices.push(inv.id);
});

afterAll(async () => { if (S) await S.remove(); });
