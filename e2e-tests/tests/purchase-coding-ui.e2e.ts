import { afterAll } from 'e2e';
import { test, expect, seed, capture, LANGS, M } from './lib.ts';

// Purchase coding through the real page (issue #2, owner 2026-11-04: one source). Each piece shows the item's weight and workmanship
// per gram read only, nothing is typed, the request carries no weight or making charge; an item switched off is refused (itemInactive).
let S: Awaited<ReturnType<typeof seed>>;
const pc = (lang: (typeof LANGS)[number], key: string) => M(lang, 'gold-accounts', `purchaseCoding.${key}`);
const boxes = (browser: any) => browser.evaluate(() => ({
  typed: document.querySelectorAll('#ws [data-line] input:not([readonly]):not([disabled])').length,
  weights: [...document.querySelectorAll('#ws [data-line] input[data-f=weight]')].map((x) => (x as HTMLInputElement).value),
  making: [...document.querySelectorAll('#ws [data-line] input[data-f=makingChargePerGram]')].map((x) => (x as HTMLInputElement).value),
}));

for (const lang of LANGS) {
  test(`purchase coding UI (${lang}): weight and workmanship from the item, nothing typed, inactive item refused`, { tags: ['e2e', 'purchases'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    S ??= await seed();
    const newInvoice = async (quantity: number) => (await S.api('POST', '/purchase-invoices', { date: S.day, branchId: S.inv.branchId, lines: [{ itemId: S.item.id, quantity }] })).body;
    const openCoding = async (inv: any) => {
      await go('superadmin', `/buy/purchases?view=coding&invoiceNumber=${inv.invoiceNumber}`, lang);
      await browser.locator('tr.row').first().tap();
      await expect(browser.locator('#cd-save')).toBeVisible();
    };
    const seen = await capture(browser, /\/purchase-coding\/invoices\//, ['POST']);
    const made: string[] = [];
    try {
      // two units: two pieces, each 5.000 g and 50.00 per gram, read only; the request is the line and two empty pieces
      const inv = await newInvoice(2);
      made.push(inv.id);
      await openCoding(inv);
      await expect.poll(() => boxes(browser)).toEqual({ typed: 0, weights: ['5.000', '5.000'], making: ['50.00', '50.00'] });
      await expect(browser.locator('#cd-form')).toContainText(pc(lang, 'fromItem'));
      await shot(`coding-${lang}-1-from-item`);
      await browser.locator('#cd-save').tap();
      await expect.poll(() => seen.length).toBe(1);
      expect(seen[0].body.lines).toHaveLength(1);
      expect(Object.keys(seen[0].body.lines[0])).toEqual(['lineId', 'pieces']);
      expect(seen[0].body.lines[0].pieces).toEqual([{}, {}]);
      await expect(browser.locator('#cd-made')).toBeVisible();
      const coded = (await S.api('GET', `/purchase-coding/invoices/${inv.id}`)).body.lines[0];
      expect(coded.coded).toBe(true);
      expect(coded.pieces.map((p: any) => [p.weight, p.makingChargePerGram])).toEqual([[5000, 5000], [5000, 5000]]);
      await shot(`coding-${lang}-2-coded`);
      for (const p of coded.pieces) await S.api('DELETE', `/pieces/${p.id}`);   // the line opens again, the invoice can go

      // switched off after the page opened: Save is refused with words, and the line says which item
      const inv2 = await newInvoice(1);
      made.push(inv2.id);
      await openCoding(inv2);
      await expect.poll(async () => (await boxes(browser)).weights).toEqual(['5.000']);
      await S.setItemActive(false);
      await browser.locator('#cd-save').tap();
      await expect.poll(() => seen.length).toBe(2);
      await expect(browser.locator('#cd-alert')).toContainText(M(lang, 'errors', 'itemInactive').replace('{itemName}', S.item.itemName));
      const label = `${String(S.item.itemCode).padStart(6, '0')} · ${S.item.itemName}`;
      await expect(browser.locator('[data-item-problem="0"]')).toContainText(M(lang, 'gold-accounts', 'purchaseInvoices.itemInactive').replace('{item}', label));
      await shot(`coding-${lang}-3-inactive-refused`);
      expect((await S.api('GET', `/purchase-coding/invoices/${inv2.id}`)).body.lines[0].coded).toBe(false);
    } finally {
      await S.setItemActive(true);
      for (const id of made) await S.api('DELETE', `/purchase-invoices/${id}`);
    }
  });
}

afterAll(async () => { if (S) await S.remove(); });
