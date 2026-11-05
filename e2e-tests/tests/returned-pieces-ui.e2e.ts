import { afterAll } from 'e2e';
import { test, expect, seed, capture, stamp, apiAs, M, LANGS } from './lib.ts';

// Returned pieces, not from us (issue #4, backend #167), through the real page as an Admin of the seeded branch: category and item required,
// an item of another category is never offered, karat/weight/workmanship read only from the item, Save sends five fields and the label
// (code, category, karat, weight; no name, phone or price) fills the print window; find by phone and by code with the filters; Reprint;
// the piece is in stock (the sales invoice adds it, and it sells); Delete is refused while sold, then marks it.
// The print window: window.open is swapped for an iframe on the page (the engine does not follow new tabs), so the label can be read and seen.
let S: Awaited<ReturnType<typeof seed>>;
const cp = (lang: (typeof LANGS)[number], k: string) => M(lang, 'gold-accounts', `customerPieces.${k}`);
const arabicDigits = (s: string) => s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const PRINT_FRAME = () => {
  window.open = () => {
    document.getElementById('e2e-print')?.remove();
    const f = document.createElement('iframe');
    f.id = 'e2e-print';
    f.style.cssText = 'position:fixed;bottom:16px;inset-inline-end:16px;width:340px;height:150px;z-index:99999;border:2px solid #7a5710;background:#fff';
    document.body.appendChild(f);
    const w = f.contentWindow!;
    w.close = () => f.remove();      // a refused Save closes the print window
    return w;
  };
};
const labelHtml = (browser: any) => browser.evaluate(() => (document.querySelector('#e2e-print') as HTMLIFrameElement | null)?.contentDocument?.body?.innerHTML ?? '');
const optionTexts = (browser: any) => browser.evaluate(() => [...document.querySelectorAll('[role=listbox] [role=option]')].map((o) => (o.textContent ?? '').trim()));
const code6 = (n: unknown) => String(n).padStart(6, '0');

for (const lang of LANGS) {
  test(`returned pieces UI (${lang}): category required, item of its category only, save and print the label, find, reprint, sell, delete`, { tags: ['e2e', 'purchases', 'returned-pieces'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    S ??= await seed();
    const admin = await apiAs('e2eadmin');
    const tag = stamp();
    const other = (await S.api('POST', '/categories', { categoryName: `E2E Other ${tag}`, qrLabel: false })).body;
    const otherItem = (await S.api('POST', '/items', { itemName: `E2E Other item ${tag}`, isCoded: true, itemType: 'gold', categoryId: other.id, karat: '18', weight: 3000, workmanshipMode: 'per_gram', workmanshipValue: '40.00', cashbackMode: 'per_gram', cashbackValue: '0.00' })).body;
    const name = `E2E Mona ${tag}`;
    const phone = `010${Date.now().toString().slice(-8)}`;
    const itemLabel = `${code6(S.item.itemCode)} · ${S.item.itemName}`;
    const made: { piece?: any; invoice?: string } = {};
    await browser.addInitScript(PRINT_FRAME);
    const seen = await capture(browser, /\/customer-pieces(\?|$)/, ['POST']);
    try {
      // 1. Nothing chosen: category and item say required, nothing is sent
      await go('e2eadmin', '/buy/returned-pieces?new=create', lang);
      await expect(browser.locator('#cp-save')).toBeVisible();
      await expect(browser.locator('#itemId-btn')).toBeDisabled();
      await browser.locator('#cp-save').tap();
      await expect(browser.locator('[data-k=categoryId] .err')).toBeVisible();
      await expect(browser.locator('[data-k=itemId] .err')).toBeVisible();
      expect(seen.length).toBe(0);
      await shot(`returned-${lang}-1-category-required`);

      // 2. The category offers its own items only; the chosen item shows its karat, weight and workmanship, read only
      await browser.locator('#categoryId-btn').tap();
      await screen.getByRole('option', S.cat.categoryName).tap();
      await browser.locator('#itemId-btn').tap();
      await expect.poll(() => optionTexts(browser)).toContain(itemLabel);
      expect((await optionTexts(browser)).some((t: string) => t.includes(otherItem.itemName))).toBe(false);
      await screen.getByRole('option', itemLabel).tap();
      await expect(browser.locator('#cp-karat')).toHaveValue('21');
      await expect(browser.locator('#cp-weight')).toHaveValue('5.000');
      await expect(browser.locator('#cp-workmanship')).toHaveValue('50.00');
      expect(await browser.evaluate(() => ['#cp-karat', '#cp-weight', '#cp-workmanship'].every((s) => (document.querySelector(s) as HTMLInputElement).readOnly))).toBe(true);
      await browser.locator('#f-description').fill('E2E ring with a red stone');
      await browser.locator('#f-customerName').fill(name);
      await browser.locator('#f-customerPhone').fill(arabicDigits(phone));
      await shot(`returned-${lang}-2-filled`);

      // 3. The item switched off after it was chosen: refused, and the item box names it
      await S.setItemActive(false);
      await browser.locator('#cp-save').tap();
      await expect.poll(() => seen.length).toBe(1);
      await expect(browser.locator('[data-k=itemId] .err')).toContainText(cp(lang, 'itemInactive').replace('{item}', S.item.itemName));
      await expect(browser.locator('#e2e-print')).toHaveCount(0);
      await shot(`returned-${lang}-3-item-inactive`);
      await S.setItemActive(true);

      // 4. Save: five fields, the phone in Latin digits; the label holds code, category, karat and weight, never the name, phone or a price
      await browser.locator('#cp-save').tap();
      await expect.poll(() => seen.length).toBe(2);
      expect(seen[1].body).toEqual({ categoryId: S.cat.id, itemId: S.item.id, description: 'E2E ring with a red stone', customerName: name, customerPhone: phone });
      await expect(browser.locator('#cp-saved')).toBeVisible();
      made.piece = (await admin('GET', `/customer-pieces/by-phone?phone=${phone}`)).body.items[0];
      expect(made.piece).toMatchObject({ categoryId: S.cat.id, itemId: S.item.id, karat: '21', weight: 5000, customerPhone: phone });
      await expect.poll(() => labelHtml(browser)).toContain('data-label-code');
      const html = await labelHtml(browser);
      expect(html).toContain(`>${made.piece.code}<`);
      expect(html).toContain(S.cat.categoryName);
      expect(html).toContain('5.000');
      expect(html).toContain(M(lang, 'gold-accounts', 'purchaseCoding.karatValue').replace('{karat}', '21'));
      for (const leak of [name, 'Mona', phone, phone.slice(3), 'EGP', 'ج.م']) expect(html).not.toContain(leak);
      await shot(`returned-${lang}-4-saved-and-label`);

      // 5. Find by the phone, then narrow by karat and category; find by the code; Reprint from the row
      await go('e2eadmin', '/buy/returned-pieces', lang);
      await browser.locator('#f-find').fill(arabicDigits(phone));
      await browser.locator('#run').tap();
      await expect(browser.locator(`[data-reprint="${made.piece.code}"]`)).toBeVisible();
      await expect(browser.locator('#tbl')).toContainText(name);
      await shot(`returned-${lang}-5-found-by-phone`);
      await browser.locator('#f-karat-btn').tap();
      await screen.getByRole('option', '18').tap();
      await browser.locator('#run').tap();
      await expect(browser.locator(`[data-reprint="${made.piece.code}"]`)).toHaveCount(0);
      await browser.locator('#f-karat-btn').tap();
      await screen.getByRole('option', '21').tap();
      await browser.locator('#f-categoryId-btn').tap();
      await screen.getByRole('option', other.categoryName).tap();
      await browser.locator('#run').tap();
      await expect(browser.locator(`[data-reprint="${made.piece.code}"]`)).toHaveCount(0);
      await go('e2eadmin', '/buy/returned-pieces', lang);
      await browser.locator('#f-find').fill(made.piece.code);
      await browser.locator('#run').tap();
      await expect(browser.locator('#tbl tbody tr')).toHaveCount(1);
      await browser.evaluate(() => document.getElementById('e2e-print')?.remove());
      await browser.locator(`[data-reprint="${made.piece.code}"]`).tap();
      await expect.poll(() => labelHtml(browser)).toContain(`>${made.piece.code}<`);
      expect(await labelHtml(browser)).not.toContain(name);
      await shot(`returned-${lang}-6-found-by-code-reprint`);

      // 6. In stock: the sales invoice finds it by its code, and it sells like any piece
      await go('e2eadmin', '/sales/invoices?new=create', lang);
      await browser.locator('#ws [data-type=sale]').tap();
      await browser.locator('#pc').fill(made.piece.code);
      await browser.locator('#addPiece').tap();
      await expect(browser.locator('#lineRows tr').first()).toContainText(made.piece.code);
      await shot(`returned-${lang}-7-in-sales-invoice`);
      const sale = (cash: number) => admin('POST', '/sales-invoices', { invoiceType: 'sale', customerName: 'E2E Buyer', customerPhone: '01055443322', lines: [{ pieceCode: made.piece.code }], cash });
      const total = (await sale(1)).body.values.total as number;
      const sold = await sale(total);
      expect(sold.status).toBe(201);
      made.invoice = sold.body.id;

      // 7. Delete: refused while sold (in this screen's words), then marks the record once the sale is gone
      const openRecord = async () => {
        await go('e2eadmin', '/buy/returned-pieces', lang);
        await browser.locator('#f-find').fill(made.piece.code);
        await browser.locator('#run').tap();
        await browser.locator('#tbl tbody tr').first().tap();
        await browser.locator('.sheet footer button.danger').tap();
        await expect(browser.locator('dialog[open]')).toContainText(cp(lang, 'deleteTitle'));
        await browser.locator('dialog[open] button.danger').tap();
      };
      await openRecord();
      await expect(browser.locator('body')).toContainText(cp(lang, 'pieceSold'));
      await shot(`returned-${lang}-8-delete-refused-sold`);
      expect((await admin('DELETE', `/sales-invoices/${made.invoice}`)).status).toBeLessThan(300);
      made.invoice = undefined;
      await openRecord();
      await expect(browser.locator('body')).toContainText(cp(lang, 'deletedToast').replace('{code}', made.piece.code));
      expect((await admin('GET', `/customer-pieces/${made.piece.id}`)).status).toBe(404);
      await shot(`returned-${lang}-9-deleted`);
      made.piece = undefined;
    } finally {
      await S.setItemActive(true);
      if (made.invoice) await admin('DELETE', `/sales-invoices/${made.invoice}`);
      if (made.piece) await admin('DELETE', `/customer-pieces/${made.piece.id}`);
      await S.api('DELETE', `/items/${otherItem.id}`);
      if (otherItem.itemNameId) await S.api('DELETE', `/item-names/${otherItem.itemNameId}`);
      await S.api('DELETE', `/categories/${other.id}`);
    }
  });
}

afterAll(async () => { if (S) await S.remove(); });
