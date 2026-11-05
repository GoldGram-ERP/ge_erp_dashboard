import { test, expect, LANGS } from './lib.ts';

// (The production report said 'Could not load the list': that sentence is the one under a FILTER dropdown whose options failed, so the test reads the whole page for it.)
// Gold stock opens both lists (totals, piece by piece) for the Super admin, who has no branch, in ar and en: after Run the list
// is loaded, not the "something went wrong / try again" state, and no cell prints the word "null" (a returned piece has no purchase
// invoice: its invoice number and date are blank). A list that fails to load fails this test: the pages smoke only checked that
// the page opened, never that its list answered (the 2026-11-05 production report).
for (const lang of LANGS) {
  test(`gold stock lists load for the superadmin (${lang})`, { tags: ['e2e', 'lists'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    for (const view of ['totals', 'pieces']) {
      await go('superadmin', `/sales/pieces?view=${view}`, lang);
      await browser.locator('#run').tap();
      await browser.locator('#tbl').waitFor({ timeout: 20_000 });
      await expect.poll(() => browser.evaluate(() => !!document.querySelector('#tbl tbody tr, #tbl .empty')), { timeout: 20_000 }).toBe(true);
      const s = await browser.evaluate(() => ({ retry: !!document.querySelector('#tbl #retry'), text: (document.querySelector('#tbl') as HTMLElement).innerText }));
      expect(s.retry, `${view}: the list shows the error state`).toBe(false);
      expect(/null|undefined|NaN/.test(s.text), `${view}: a cell prints null/undefined/NaN`).toBe(false);
      // The text under a filter whose list (branches, categories, items, treasuries) did not load: the production report was this, not the table.
      const page = await browser.evaluate(() => document.body.innerText);
      expect(/Could not load the list|تعذّر تحميل القائمة/.test(page), `${view}: a filter list did not load`).toBe(false);
      await shot(`gold-stock-${view}-${lang}`);
    }
  });
}
