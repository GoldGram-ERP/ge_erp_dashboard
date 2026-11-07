import { afterAll } from 'e2e';
import { test, expect, seed, capture } from './lib.ts';

// Stocktake through the real UI: start a count for a category (body captured), scan a piece, an unknown code is refused, delete the count.
let S: Awaited<ReturnType<typeof seed>>;

// A tap before React has attached its handlers (a production build on a busy machine) is dropped: tap again until the list is open.
async function openBox(browser: any, key: string) {
  const box = browser.locator(`#ws [data-k=${key}] [role=combobox]`);
  await expect.poll(async () => {
    if ((await browser.evaluate((k: string) => document.querySelector(`#ws [data-k=${k}] [role=combobox]`)?.getAttribute('aria-expanded'), key)) !== 'true') await box.tap();
    return browser.evaluate((k: string) => document.querySelector(`#ws [data-k=${k}] [role=combobox]`)?.getAttribute('aria-expanded'), key);
  }, { timeout: 20_000 }).toBe('true');
}

test('stocktake UI: start a count, scan a piece, refuse an unknown code', { tags: ['e2e', 'stocktake'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
  S ??= await seed();
  const seen = await capture(browser, /\/stock-counts(\?|$)/, ['POST']);
  await go('superadmin', '/stock/count?new=create', 'en');
  await openBox(browser, 'branchId');
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

// The lists behind the form (branches, categories, every item) load in the background; a big catalogue is many pages. When the last one lands the screen
// is rebuilt, and the start form must keep what was picked (it used to be remounted: the branch went back to "Choose" and the category box vanished).
test('stocktake UI: the start form keeps its picks when the lists arrive late', { tags: ['e2e', 'stocktake'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
  await browser.route(/\/api\/items\?/, async (route: any) => { if (new URL(route.request.url).searchParams.get('page') === '1') await new Promise((r) => setTimeout(r, 4000)); await route.continue(); });   // the items list lands after 4 s
  await go('superadmin', '/stock/count?new=create', 'en');
  await openBox(browser, 'branchId');
  await screen.getByRole('option', /Main branch/).tap();
  await expect(browser.locator('#ws [data-k=categoryId] [role=combobox]')).toBeVisible();
  await expect.poll(() => browser.evaluate(() => document.querySelector('#ws [data-k=branchId] .sel-val')?.textContent ?? '')).toMatch(/Main branch/);
  await new Promise((r) => setTimeout(r, 6000));   // the items list has landed by now
  expect(await browser.evaluate(() => document.querySelector('#ws [data-k=branchId] .sel-val')?.textContent ?? '')).toMatch(/Main branch/);
  await expect(browser.locator('#ws [data-k=categoryId] [role=combobox]')).toBeVisible();
  await shot('stocktake-4-picks-kept');
});

afterAll(async () => { if (S) await S.remove(); });
