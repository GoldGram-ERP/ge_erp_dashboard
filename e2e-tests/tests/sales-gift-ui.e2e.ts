import { afterAll } from 'e2e';
import { test, expect, seed, capture, stamp, M } from './lib.ts';

// Gift invoice through the real screens (backend #169, dashboard #7): the switch and the recipient on the new invoice (the exact
// request body is captured), then the invoice view: gift badge, recipient, the buyer marked internal, and the print box.
let S: Awaited<ReturnType<typeof seed>>;
const money = (s: string) => Math.round(parseFloat(s.replace(/,/g, '')) * 100);
const phone = `0109${Date.now().toString().slice(-7)}`;

for (const lang of ['en', 'ar'] as const) {
  const m = (k: string) => M(lang, 'gold-sales', `salesInvoices.${k}`);

  test(`gift invoice UI: the switch asks for the recipient, and the body carries it (${lang})`, { tags: ['e2e', 'sales', 'gift'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    S ??= await seed();
    const code = S.pieces[lang === 'en' ? 0 : 1].pieceCode;
    const seen = await capture(browser, /\/sales-invoices(\?|$)/, ['POST']);
    await go('superadmin', '/sales/invoices?new=create', lang);
    await browser.locator('#ws [data-type=sale]').tap();
    // With several branches the form asks which one; with one it takes it.
    if (await browser.evaluate(() => Boolean(document.querySelector('#ws [data-k=branchId] [role=combobox]')))) {
      await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
      await screen.getByRole('option', 'Main branch').tap();
    }
    await browser.locator('#pc').fill(code);
    await browser.locator('#addPiece').tap();
    await expect(browser.locator('#lineRows tr').first()).toBeVisible();
    await browser.locator('#f-customerPhone').fill(phone);
    await browser.locator('#f-customerName').fill('E2E Buyer');
    // The recipient boxes are hidden until the switch is on.
    await expect(browser.locator('#f-giftRecipientName')).toHaveCount(0);
    await browser.locator('#f-isGift').tap();
    await expect(browser.locator('#f-giftRecipientName')).toBeVisible();
    await expect(browser.locator('#gift')).toContainText(m('giftSwitch'));
    await shot(`gift-${lang}-1-switch-on`);
    const tot = await browser.evaluate(() => (document.querySelector('#tot') as HTMLElement).innerText);
    await browser.locator('#f-cash').fill((money(tot.match(/[\d,]+\.\d\d/)![0]) / 100).toFixed(2));
    // A gift without a recipient is not sent.
    await browser.locator('#sec-save button[type=submit]').tap();
    await expect(browser.locator('#gift .err').first()).toBeVisible();
    expect(seen.length).toBe(0);
    await shot(`gift-${lang}-2-recipient-required`);
    await browser.locator('#f-giftRecipientPhone').fill('01055443322');
    await browser.locator('#f-giftRecipientName').fill(`E2E Recipient ${lang}`);
    await browser.locator('#sec-save button[type=submit]').tap();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].body).toMatchObject({ isGift: true, giftRecipientName: `E2E Recipient ${lang}`, giftRecipientPhone: '01055443322', customerName: 'E2E Buyer', customerPhone: phone });
    await shot(`gift-${lang}-3-saved`);
    const made = (await S.api('GET', `/sales-invoices?search=01055443322`)).body.items as any[];
    for (const inv of made) if (!S.created.invoices.includes(inv.id)) S.created.invoices.push(inv.id);
    expect(made.length).toBeGreaterThan(0);
  });

  test(`gift invoice UI: the view shows the badge, the recipient and the buyer as internal, and the print box (${lang})`, { tags: ['e2e', 'sales', 'gift'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    S ??= await seed();
    const code = S.pieces[lang === 'en' ? 2 : 3].pieceCode;
    const buyer = `View Buyer ${stamp()}`;
    const sale = (pay: any) => S.api('POST', '/sales-invoices', { branchId: S.inv.branchId, invoiceType: 'sale', customerName: buyer, customerPhone: '01012345678', isGift: true, giftRecipientName: 'Saved Recipient', giftRecipientPhone: '01099887766', lines: [{ pieceCode: code }], ...pay });
    const total = (await sale({ cash: 1 })).body.values.total as number;
    const inv = await sale({ cash: total });
    expect(inv.status).toBe(201);
    S.created.invoices.push(inv.body.id);
    await go('superadmin', '/sales/invoices', lang);
    await browser.locator('input[type=search], .search input').first().fill(buyer);
    await browser.locator('table tbody tr').first().tap();
    await expect(browser.locator('[data-gift]').first()).toBeVisible();
    await expect(browser.locator('body')).toContainText('Saved Recipient');
    await expect(browser.locator('body')).toContainText(m('buyerInternal'));
    await expect(browser.locator('body')).toContainText(buyer);
    await expect(browser.locator('#giftPrint')).toBeVisible();
    // The print box starts from the invoice's own recipient, and the prices switch is off.
    await expect(browser.locator('#f-printRecipientName')).toHaveValue('Saved Recipient');
    await expect(browser.locator('#f-printRecipientPhone')).toHaveValue('01099887766');
    expect(await browser.locator('#f-showPrices').isChecked()).toBe(false);
    await shot(`gift-${lang}-4-view-and-print-box`);
    // Clearing the recipient stops the print and says why.
    await browser.locator('#f-printRecipientName').fill('');
    await browser.locator('#print-gift').tap();
    await expect(browser.locator('#giftPrint .err').first()).toBeVisible();
    await shot(`gift-${lang}-5-print-needs-recipient`);
    // The data a print would draw: the recipient, no buyer, no seller; prices only when asked.
    const q = `layout=gift&recipientName=${encodeURIComponent('Saved Recipient')}&recipientPhone=01099887766`;
    const plain = (await S.api('GET', `/sales-invoices/${inv.body.id}/print?${q}`)).body;
    expect(plain.totals.total).toBeNull();
    const text = JSON.stringify(plain);
    for (const secret of [buyer, '01012345678', 'seller']) expect(text).not.toContain(secret);
    expect(((await S.api('GET', `/sales-invoices/${inv.body.id}/print?${q}&showPrices=true`)).body).totals.total).toBe(total);
  });
}

afterAll(async () => { if (S) await S.remove(); });
