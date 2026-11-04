import { afterAll } from 'e2e';
import { test, expect, seed, capture } from './lib.ts';

// Stocktake through the real UI: start a count for a category (body captured), scan a piece, an unknown code is refused, delete the count.
let S: Awaited<ReturnType<typeof seed>>;

test('stocktake UI: start a count, scan a piece, refuse an unknown code', { tags: ['e2e', 'stocktake'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
  S ??= await seed();
  const seen = await capture(browser, /\/stock-counts(\?|$)/, ['POST']);
  await go('superadmin', '/stock/count?new=create', 'en');
  await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
  await screen.getByRole('option', /Main branch/).tap();
  await browser.locator('#ws [data-k=categoryId] [role=combobox]').tap();
  await screen.getByRole('option', `E2E Cat ${S.tag}`).tap();
  await shot('stocktake-1-start');
  await browser.locator('#ws #save').tap();
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0].body).toMatchObject({ branchId: S.inv.branchId, categoryId: S.cat.id });
  await expect(browser.locator('#ws #sc-code')).toBeVisible();
  await browser.locator('#ws #sc-code').fill(S.pieces[3].pieceCode);
  await browser.locator('#ws #sc-go').tap();
  await expect.poll(async () => (await browser.evaluate(() => document.querySelector('#ws')!.innerText)).includes(S.pieces[3].pieceCode)).toBe(true);
  await shot('stocktake-2-scanned');
  await browser.locator('#ws #sc-code').fill('nope-0');
  await browser.locator('#ws #sc-go').tap();
  await expect(browser.locator('#ws [role=alert]')).toBeVisible();
  await shot('stocktake-3-unknown-refused');
  const counts = (await S.api('GET', '/stock-counts')).body.items as any[];
  for (const k of counts) if (k.categoryId === S.cat.id || k.categoryName === `E2E Cat ${S.tag}`) S.created.counts.push(k.id);
});

afterAll(async () => { if (S) await S.remove(); });
