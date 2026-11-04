import { test, expect } from './lib.ts';

// Universal search in the sidebar: Arabic word, keyboard-swapped Arabic typed on an English layout, and Ctrl K sheet.
for (const [q, why] of [['مبيعات', 'Arabic word'], ['lfduhj', 'Arabic typed on the English layout']] as const) {
  test(`sidebar search finds the Sales pages: ${why}`, { tags: ['e2e', 'search'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    await go('superadmin', '', 'en');
    await browser.locator('#usearch-input').fill(q);
    await expect(browser.locator('#usearch-list [role=option]').first()).toBeVisible();
    const names = await browser.evaluate(() => [...document.querySelectorAll('#usearch-list [role=option]')].map((o) => (o as HTMLElement).innerText).join('|'));
    for (const n of ['Sales invoices', 'Reservations', 'Returns']) expect(names).toContain(n);
    await shot(`search-${why.split(' ')[0]}`);
  });
}

test('Ctrl K opens the search sheet', { tags: ['e2e', 'search'], requires: ['browser'] }, async ({ go, browser, app, shot }) => {
  await go('superadmin', '', 'en');
  await browser.locator('#usearch-input').press('Control+k');
  await expect(browser.locator('dialog.palette[open]')).toBeVisible();
  await shot('search-sheet');
});
