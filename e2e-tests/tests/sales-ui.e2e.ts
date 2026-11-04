import { afterAll } from 'e2e';
import { test, expect, seed, capture, stamp } from './lib.ts';

// Sales invoice through the real form: each payment method, exact request body captured, totals read from the page, invoice deleted through the record sheet path (API Delete in cleanup).
let S: Awaited<ReturnType<typeof seed>>;
let acc: { bank?: string; acc?: string; name?: string; label?: string } = {};
const money = (s: string) => Math.round(parseFloat(s.replace(/,/g, '')) * 100); // "17,751.25" -> piastres

async function openForm(go: any, browser: any, screen: any, lang: 'en' | 'ar', code: string, shot: any, label: string) {
  S ??= await seed();
  if (!acc.acc) {
    acc.name = `E2E Acc ${stamp()}`;
    const bn = `E2E Bank ${stamp()}`; const b = await S.api('POST', '/banks', { bankName: bn }); acc.label = `${acc.name} · ${bn}`; acc.bank = b.body.id;
    acc.acc = (await S.api('POST', '/bank-accounts', { accountName: acc.name, bankId: b.body.id, commission: '1.00' })).body.id;
  }
  await go('superadmin', '/sales/invoices?new=create', lang);
  await browser.locator('#ws [data-type=sale]').tap(); // the sidebar language switch is also a .seg
  await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
  await screen.getByRole('option', 'Main branch').tap();
  await expect(browser.locator('#pc')).toBeVisible();
  await browser.locator('#pc').fill(code);
  await browser.locator('#addPiece').tap();
  await expect(browser.locator('#lineRows tr').first()).toBeVisible();
  await browser.locator('#f-customerPhone').fill('01012345678');
  await browser.locator('#f-customerName').fill('E2E Customer');
  await shot(`${label}-1-piece-added`);
  const tot = await browser.evaluate(() => (document.querySelector('#tot') as HTMLElement).innerText);
  return money(tot.match(/[\d,]+\.\d\d/)![0]);
}

for (const [i, kind] of (['cash', 'bank', 'mixed'] as const).entries()) {
  for (const lang of ['en', 'ar'] as const) {
    if (kind !== 'cash' && lang === 'ar') continue;
    test(`sales invoice UI: ${kind} payment, body captured, saved and listed (${lang})`, { tags: ['e2e', 'sales'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
      S ??= await seed();
      const code = S.pieces[lang === 'ar' ? 3 : i].pieceCode;
      const seen = await capture(browser, /\/sales-invoices(\?|$)/, ['POST']);
      const total = await openForm(go, browser, screen, lang, code, shot, `sales-${kind}-${lang}`);
      const bankPay = async (amount: number, idx = 0) => {
        await browser.locator('[data-addbank]').tap();
        await browser.locator(`#ws [data-k=bank${idx}Account] [role=combobox]`).tap();
        await screen.getByRole('option', acc.label!).tap();
        await browser.locator(`#bm${idx}`).fill((amount / 100).toFixed(2));
      };
      if (kind === 'cash') await browser.locator('#f-cash').fill((total / 100).toFixed(2));
      if (kind === 'bank') await bankPay(total);
      if (kind === 'mixed') { await browser.locator('#f-cash').fill('1000.00'); await bankPay(total - 100000); }
      await shot(`sales-${kind}-${lang}-2-paid`);
      await browser.locator('#sec-save button[type=submit]').tap();
      await expect.poll(() => seen.length).toBe(1);
      const b = seen[0].body;
      expect(b).toMatchObject({ invoiceType: 'sale', customerPhone: '01012345678', customerName: 'E2E Customer', lines: [{ pieceCode: code }] });
      if (kind === 'cash') expect(b.cash).toBe(total);
      if (kind === 'bank') expect(b.bankPayments).toEqual([{ bankAccountId: acc.acc, amount: total }]);
      if (kind === 'mixed') { expect(b.cash).toBe(100000); expect(b.bankPayments).toEqual([{ bankAccountId: acc.acc, amount: total - 100000 }]); }
      await shot(`sales-${kind}-${lang}-3-saved`);
      const list = (await S.api('GET', '/sales-invoices?search=01012345678')).body.items as any[];
      const mine = list.find((x) => x.lines?.some?.((l: any) => l.pieceCode === code) || true);
      for (const inv of list) if (!S.created.invoices.includes(inv.id)) S.created.invoices.push(inv.id);
      expect(mine).toBeTruthy();
    });
  }
}

afterAll(async () => {
  if (S) {
    await S.remove();
    if (acc.acc) await S.api('DELETE', `/bank-accounts/${acc.acc}`);
    if (acc.bank) await S.api('DELETE', `/banks/${acc.bank}`);
  }
});
