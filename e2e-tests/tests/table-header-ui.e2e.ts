import { afterAll } from 'e2e';
import { test, expect, seed, LANGS } from './lib.ts';

// The header row of a table stays at the top of its card while the rows scroll under it (owner, 2026-11-05): Items and Purchases lists.
// The card is made short so any list scrolls; after scrolling to the end the header is still at the card's top and is not transparent.
let S: Awaited<ReturnType<typeof seed>>;
const probe = (browser: any) => browser.evaluate(() => {
  const card = document.querySelector('#tbl') as HTMLElement;
  card.style.maxHeight = '70px';
  card.scrollTop = 9999;
  const th = card.querySelector('thead th') as HTMLElement;
  return { scrolled: card.scrollTop, gap: Math.round(th.getBoundingClientRect().top - card.getBoundingClientRect().top), background: getComputedStyle(th).backgroundColor };
});

for (const lang of LANGS) {
  test(`table header stays on top while the rows scroll: items and purchases (${lang})`, { tags: ['e2e', 'tables'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    S ??= await seed();
    const inv = (await S.api('POST', '/purchase-invoices', { date: S.day, branchId: S.inv.branchId, lines: [{ itemId: S.item.id, quantity: 1 }] })).body;
    try {
      for (const path of ['/buy/items?view=items', '/buy/purchases']) {
        await go('superadmin', path, lang);
        await expect(browser.locator('#tbl tbody tr').first()).toBeVisible();
        const seen = await probe(browser);
        expect(seen.scrolled, path).toBeGreaterThan(0);
        expect(Math.abs(seen.gap), path).toBeLessThanOrEqual(2);
        expect(seen.background, path).not.toBe('rgba(0, 0, 0, 0)');
        await shot(`table-header-${lang}-${path.split('/')[2].split('?')[0]}`);
      }
    } finally {
      await S.api('DELETE', `/purchase-invoices/${inv.id}`);
    }
  });
}

afterAll(async () => { if (S) await S.remove(); });
