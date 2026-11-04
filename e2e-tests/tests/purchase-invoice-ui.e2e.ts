import { afterAll } from 'e2e';
import { test, expect, seed, capture, LANGS, M } from './lib.ts';

// Gold purchase invoice through the real form (issue #2, owner 2026-11-04: one source). The weight is the item weight x the count,
// read only, and never sent; an item switched off after it was picked is refused under the item box in the reader's language.
let S: Awaited<ReturnType<typeof seed>>;
const pi = (lang: (typeof LANGS)[number], key: string) => M(lang, 'gold-accounts', `purchaseInvoices.${key}`);
const weightBox = (browser: any) => browser.evaluate(() => { const el = document.querySelector('#ws [data-f=weight]') as HTMLInputElement; return { readOnly: el.readOnly, value: el.value }; });

for (const lang of LANGS) {
  test(`purchase invoice UI (${lang}): weight read only from the item, body without weight, inactive item refused`, { tags: ['e2e', 'purchases'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    S ??= await seed();
    const ids = async () => ((await S.api('GET', `/purchase-invoices?fromDate=${S.day}&toDate=${S.day}`)).body.items as any[]).map((x) => x.id as string);
    const before = new Set(await ids());
    const seen = await capture(browser, /\/purchase-invoices(\?|$)/, ['POST']);
    const open = async () => {
      await go('superadmin', '/buy/purchases?new=create', lang);
      await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
      await screen.getByRole('option', 'Main branch').tap();
    };
    const pickItem = async () => {
      await browser.locator('#ws [data-f=item]').fill(S.item.itemName);
      await expect.poll(async () => browser.evaluate(() => document.querySelectorAll('#inv-items option').length)).toBeGreaterThan(0);
      const label = await browser.evaluate(() => (document.querySelector('#inv-items option') as HTMLOptionElement).value);
      await browser.locator('#ws [data-f=item]').fill(label);
      return label as string;
    };
    try {
      await open();
      // empty save: the item is refused, nothing sent; the weight box is read only and empty
      await browser.locator('#ws #inv-save').tap();
      await expect(browser.locator('#ws [data-k="lines.0.itemId"] .err')).toBeVisible();
      expect(seen.length).toBe(0);
      expect(await weightBox(browser)).toEqual({ readOnly: true, value: '' });
      await expect(browser.locator('#inv-weight-help')).toContainText(pi(lang, 'weightFromItem'));
      await shot(`purchase-${lang}-1-empty-refused`);

      // the item fills the weight (5.000 g x 2), the count updates it (x 3); typing into the box changes nothing
      await pickItem();
      await browser.locator('#ws [data-f=quantity]').fill('2');
      await expect.poll(() => weightBox(browser)).toEqual({ readOnly: true, value: '10.000' });
      await browser.locator('#ws [data-f=quantity]').fill(lang === 'ar' ? '٣' : '3');
      await expect.poll(() => weightBox(browser)).toEqual({ readOnly: true, value: '15.000' });
      await expect(browser.locator('#inv-totals')).toContainText('15.000');
      await shot(`purchase-${lang}-2-weight-from-item`);
      await browser.locator('#ws #inv-save').tap();
      await expect.poll(() => seen.length).toBe(1);
      expect(seen[0].body.lines).toEqual([{ itemId: S.item.id, quantity: 3 }]);   // no weight on the wire
      const mine = (await ids()).filter((id) => !before.has(id));
      expect(mine.length).toBe(1);
      expect((await S.api('GET', `/purchase-invoices/${mine[0]}`)).body.lines[0]).toMatchObject({ quantity: 3, weight: 15000 });
      await S.api('DELETE', `/purchase-invoices/${mine[0]}`);
      await shot(`purchase-${lang}-3-saved`);

      // picked while active, switched off before Save: the backend's refusal (inactive) names the item under its box
      await open();
      const label = await pickItem();
      await expect.poll(() => weightBox(browser)).toEqual({ readOnly: true, value: '5.000' });
      await S.setItemActive(false);
      await browser.locator('#ws #inv-save').tap();
      await expect.poll(() => seen.length).toBe(2);
      await expect(browser.locator('#ws [data-k="lines.0.itemId"] .err')).toContainText(pi(lang, 'itemInactive').replace('{item}', label));
      await shot(`purchase-${lang}-4-inactive-refused`);
      expect((await ids()).filter((id) => !before.has(id) && id !== mine[0])).toEqual([]);
    } finally {
      await S.setItemActive(true);
    }
  });
}

test('purchase invoice API: a sent weight is refused, the coded seed invoice cannot be deleted', { tags: ['api', 'purchases'] }, async () => {
  S ??= await seed();
  const r = await S.api('POST', '/purchase-invoices', { date: S.day, branchId: S.inv.branchId, lines: [{ itemId: S.item.id, quantity: 1, weight: 5000 }] });
  expect(r.status).toBe(400);
  expect(JSON.stringify(r.body)).toContain('lines.0.weight');
  expect((await S.api('DELETE', `/purchase-invoices/${S.inv.id}`)).status).toBe(409);
});

afterAll(async () => { if (S) await S.remove(); });
