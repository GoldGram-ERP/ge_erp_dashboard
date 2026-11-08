import { test, expect } from './lib.ts';

// Dashboard #19: a report's filter panel folds into one bar when "تقرير" runs, "Edit filters" opens it again with the values kept,
// and a result never scrolls inside a box of its own (the page scrolls). Written for manual runs; not part of the quick checks.
// Safe balances is the simplest report: one optional date filter and no required field.
for (const lang of ['en', 'ar'] as const) {
  test(`report filters fold after the run and open again with the values kept (${lang})`, { tags: ['e2e', 'report-filters'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('superadmin', '/money/cash?view=safe-balances', lang);
    await browser.locator('#filters').first().waitFor({ timeout: 25_000 });
    expect(await browser.locator('#filters-bar').count()).toBe(0);   // before the first run the panel is open, as always

    await browser.locator('#run').click();
    await browser.locator('#filters-bar').first().waitFor({ timeout: 25_000 });
    expect(await browser.locator('#filters').count()).toBe(0);       // the panel is folded: only the thin bar is left
    expect(await browser.locator('#edit-filters').count()).toBe(1);
    await shot(`report-filters-folded-${lang}`);

    await browser.locator('#edit-filters').click();
    await browser.locator('#filters').first().waitFor({ timeout: 10_000 });
    expect(await browser.locator('#filters-bar').count()).toBe(0);   // opened again
    expect(await browser.locator('#run').count()).toBe(1);

    await browser.locator('#run').click();                           // running again folds it again
    await browser.locator('#filters-bar').first().waitFor({ timeout: 25_000 });
    expect(await browser.locator('#filters').count()).toBe(0);
  });

  test(`a result table has no vertical scroll of its own (${lang})`, { tags: ['e2e', 'report-filters'], requires: ['browser'] }, async ({ go, browser }) => {
    await go('superadmin', '/money/cash?view=safe-balances', lang);
    await browser.locator('#run').click();
    await browser.locator('#tbl').first().waitFor({ timeout: 25_000 });
    // The table card takes the height of its rows: nothing to scroll vertically inside it.
    const own = await browser.evaluate(() => { const t = document.getElementById('tbl'); return t ? t.scrollHeight - t.clientHeight : -1; });
    expect(own).toBeLessThanOrEqual(1);
  });
}
