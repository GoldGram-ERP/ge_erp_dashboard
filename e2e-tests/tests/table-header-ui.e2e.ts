import { afterAll } from 'e2e';
import { test, expect, seed, LANGS } from './lib.ts';

// The header row of a table is NOT fixed (owner, 2026-11-05): it scrolls away with the rows. Items and Purchases lists.
// The card is made short so any list scrolls; after scrolling to the end the header is above the card's top edge, and is not sticky.
let S: Awaited<ReturnType<typeof seed>>;
const probe = (browser: any) => browser.evaluate(() => {
  const card = document.querySelector('#tbl') as HTMLElement;
  card.style.maxHeight = '70px';
  card.scrollTop = 9999;
  const th = card.querySelector('thead th') as HTMLElement;
  return { scrolled: card.scrollTop, above: Math.round(card.getBoundingClientRect().top - th.getBoundingClientRect().bottom), position: getComputedStyle(th).position };
});

for (const lang of LANGS) {
  test(`table header scrolls away with the rows, not fixed: items and purchases (${lang})`, { tags: ['e2e', 'tables'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    S ??= await seed();
    const inv = (await S.api('POST', '/purchase-invoices', { date: S.day, branchId: S.inv.branchId, lines: [{ itemId: S.item.id, quantity: 1 }] })).body;
    try {
      for (const path of ['/buy/items?view=items', '/buy/purchases']) {
        await go('superadmin', path, lang);
        await expect(browser.locator('#tbl tbody tr').first()).toBeVisible();
        const seen = await probe(browser);
        expect(seen.scrolled, path).toBeGreaterThan(0);
        expect(seen.position, path).not.toBe('sticky');
        expect(seen.above, path).toBeGreaterThanOrEqual(0);   // the header is out of sight, above the card's top edge
        await shot(`table-header-scrolled-${lang}-${path.split('/')[2].split('?')[0]}`);
      }
    } finally {
      await S.api('DELETE', `/purchase-invoices/${inv.id}`);
    }
  });
}

afterAll(async () => { if (S) await S.remove(); });
