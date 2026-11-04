import { afterAll } from 'e2e';
import { test, expect, seed, capture } from './lib.ts';

// Gold stock (dashboard #5), on the Pieces and balances page: the totals by branch and karat, a row that opens exactly its pieces,
// and the job link (?view=pieces) that lands on the piece-by-piece view. Pieces come from a real coded purchase through the API.
let S: Awaited<ReturnType<typeof seed>>;

for (const lang of ['en', 'ar'] as const) {
  test(`gold stock UI: a totals row opens the pieces of that branch and karat (${lang})`, { tags: ['e2e', 'stock', 'gold-stock'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    S ??= await seed();
    const seen = await capture(browser, /\/reports\/gold-stock(\?|$)/, ['GET']);
    await go('superadmin', '/sales/pieces?view=totals', lang);
    await browser.locator('#run').tap();
    const row = browser.locator(`tr.row[data-k="${S.inv.branchId}|21"]`);
    await expect(row).toBeVisible();
    await shot(`gold-stock-${lang}-1-totals`);
    await row.tap();
    // The pieces view is asked for exactly that branch and karat, and shows the pieces just coded.
    await expect(browser.locator('body')).toContainText(S.pieces[0].pieceCode);
    const last = seen[seen.length - 1];
    const q = new URL(last.url).searchParams;
    expect(q.get('view')).toBe('pieces');
    expect(q.get('branchId')).toBe(S.inv.branchId);
    expect(q.get('karat')).toBe('21');
    for (const piece of S.pieces) await expect(browser.locator('body')).toContainText(piece.pieceCode);
    await shot(`gold-stock-${lang}-2-pieces-of-the-row`);
    // The same figures as the report: the totals row's count is the number of pieces behind it.
    const totals = (await S.api('GET', `/reports/gold-stock?view=totals&branchId=${S.inv.branchId}&karat=21`)).body;
    const pieces = (await S.api('GET', `/reports/gold-stock?view=pieces&branchId=${S.inv.branchId}&karat=21`)).body;
    expect(pieces.total).toBe(totals.items[0].count);
    expect(pieces.totals.weightMg).toBe(totals.items[0].weightMg);
  });

  test(`gold stock UI: the job link lands on the piece-by-piece view (${lang})`, { tags: ['e2e', 'stock', 'gold-stock'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    S ??= await seed();
    const seen = await capture(browser, /\/reports\/gold-stock(\?|$)/, ['GET']);
    await go('superadmin', '/sales/pieces?view=pieces', lang);
    await browser.locator('#run').tap();
    await expect(browser.locator('body')).toContainText(S.pieces[1].pieceCode);
    expect(new URL(seen[seen.length - 1].url).searchParams.get('view')).toBe('pieces');
    await shot(`gold-stock-${lang}-3-job-link`);
  });
}

afterAll(async () => { if (S) await S.remove(); });
