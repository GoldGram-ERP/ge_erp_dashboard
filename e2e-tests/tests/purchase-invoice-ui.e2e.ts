import { afterAll } from 'e2e';
import { test, expect, seed, capture } from './lib.ts';

// Gold purchase invoice through the real form: validation, a valid save (body captured), then a coded invoice refuses delete.
let S: Awaited<ReturnType<typeof seed>>;
const itemLabel = (n: number, name: string) => `${String(n).padStart(6, '0')} · ${name}`; // as shown in the item box

test('purchase invoice UI: validation, save with the exact body, coded invoice cannot be deleted', { tags: ['e2e', 'purchases'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
  S ??= await seed();
  const ids = async () => ((await S.api('GET', `/purchase-invoices?fromDate=${S.day}&toDate=${S.day}`)).body.items as any[]).map((x) => x.id as string);
  const before = new Set(await ids());
  const seen = await capture(browser, /\/purchase-invoices(\?|$)/, ['POST']);
  await go('superadmin', '/buy/purchases?new=create', 'en');
  await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
  await screen.getByRole('option', 'Main branch').tap();
  // empty save: item and quantity refused, nothing sent
  await browser.locator('#ws #inv-save').tap();
  await expect(browser.locator('#ws [data-k="lines.0.itemId"] [role=alert], #ws [data-k="lines.0.itemId"] .err')).toBeVisible();
  await shot('purchase-1-empty-refused');
  expect(seen.length).toBe(0);
  // bad quantity and weight
  await browser.locator('#ws [data-f=quantity]').fill('0');
  await browser.locator('#ws [data-f=weight]').fill('abc');
  await browser.locator('#ws #inv-save').tap();
  expect(seen.length).toBe(0);
  await shot('purchase-2-bad-values');
  // valid: pick the item by typing its name
  const it = (await S.api('GET', `/items/${S.item.id}`)).body;
  await browser.locator('#ws [data-f=item]').fill(String(it.itemName ?? `E2E Ring ${S.tag}`));
  await expect.poll(async () => (await browser.evaluate(() => document.querySelectorAll('#inv-items option').length))).toBeGreaterThan(0);
  const label = await browser.evaluate(() => (document.querySelector('#inv-items option') as HTMLOptionElement).value);
  await browser.locator('#ws [data-f=item]').fill(label);
  await browser.locator('#ws [data-f=quantity]').fill('2');
  await browser.locator('#ws [data-f=weight]').fill('10.000');
  await browser.locator('#ws #inv-save').tap();
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0].body).toMatchObject({ lines: [{ itemId: S.item.id, quantity: 2, weight: 10000 }] });
  await shot('purchase-3-saved');
  const mine = (await ids()).filter((id) => !before.has(id)).map((id) => ({ id }));
  expect(mine.length).toBeGreaterThan(0);
  // the seeded invoice is coded: delete is refused
  const del = await S.api('DELETE', `/purchase-invoices/${S.inv.id}`);
  expect(del.status).toBe(409);
  for (const x of mine) await S.api('DELETE', `/purchase-invoices/${x.id}`);
});

afterAll(async () => { if (S) await S.remove(); });
