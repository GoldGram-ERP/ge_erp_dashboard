import { test, expect, LANGS, scan, type Lang, type Role } from './lib.ts';

// WCAG 2.2 AA scan with axe-core (lib.ts scan) on each kind of screen, in ar and en. Fails on serious/critical violations.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const press = (b: any, k: string) => b.keyboard.press(k);

type Screen = { name: string; role: Role | null; path: string; width?: number; act?: (b: any) => Promise<void> };
const SCREENS: Screen[] = [
  { name: 'sign-in', role: null, path: '/sign-in' },
  { name: 'home', role: 'superadmin', path: '' },
  { name: 'list-with-filters', role: 'superadmin', path: '/setup/users' },
  { name: 'record-sheet', role: 'superadmin', path: '/setup/users', act: async (b) => { await b.locator('tbody tr').first().tap(); await sleep(800); } },
  { name: 'create-invoice', role: 'superadmin', path: '/sales/invoices?new=create' },
  { name: 'create-return', role: 'superadmin', path: '/sales/returns?new=create' },
  { name: 'create-expense', role: 'superadmin', path: '/expenses/expenses?new=createExpense' },   // the payment block: cash and bank rows
  { name: 'settings-account', role: 'superadmin', path: '/account' },
  { name: 'search-sheet-ctrl-k', role: 'superadmin', path: '', act: async (b) => { await press(b, 'Control+k'); await sleep(600); } },
  { name: 'sidebar-collapsed', role: 'superadmin', path: '/setup/users', act: async (b) => { await b.locator('#collapse').tap(); await sleep(500); } },
  { name: 'mobile-drawer-390', role: 'superadmin', path: '', width: 390, act: async (b) => { await b.locator('#trigger').tap(); await sleep(600); } },
  { name: 'select-popover', role: 'superadmin', path: '/sales/invoices?new=create', act: async (b) => { await b.locator('button.sel-btn').first().tap(); await sleep(500); } },
  { name: 'date-picker-popover', role: 'superadmin', path: '/sales/returns?new=create', act: async (b) => { await b.locator('button.dp-btn').first().tap(); await sleep(500); } },
  { name: 'jobs-home', role: 'superadmin', path: '/jobs' },
  { name: 'e2euser-home', role: 'e2euser', path: '' },
];

for (const lang of LANGS) {
  for (const s of SCREENS) {
    test(`axe: ${s.name} (${lang})`, { tags: ['a11y'], requires: ['browser'] }, async ({ go, app, browser }) => {
      await browser.setViewport({ width: s.width ?? 1440, height: 900 });
      const open = () => (s.role ? go(s.role, s.path, lang as Lang) : app.open(`/${lang}${s.path}`));
      await open();
      // The dev server sometimes answers with an empty document while it compiles a route: reload once, then scan.
      for (let i = 0; i < 3 && !(await browser.evaluate(() => document.documentElement.lang)); i++) { await sleep(2000); await open(); }
      await sleep(1200);
      await s.act?.(browser);
      expect(await scan(browser)).toEqual([]);
    });
  }

  test(`every route has its own title (${lang})`, { tags: ['a11y'], requires: ['browser'] }, async ({ go, browser }) => {
    await go('superadmin', '/setup/users', lang as Lang);
    await sleep(1500);
    for (let i = 0; i < 20 && (await browser.evaluate(() => document.title)) === 'GoldGram'; i++) await sleep(500);
    expect(await browser.evaluate(() => document.title)).toMatch(/ - GoldGram$/);
  });

  test(`html lang and dir, landmarks, one h1 (${lang})`, { tags: ['a11y'], requires: ['browser'] }, async ({ go, browser }) => {
    await go('superadmin', '/setup/users', lang as Lang);
    await sleep(1500);
    expect(await browser.evaluate(() => document.documentElement.lang)).toBe(lang);
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    expect(await browser.evaluate(() => ['nav', 'main', 'aside'].map((q) => document.querySelectorAll(q).length > 0))).toEqual([true, true, true]);
    expect(await browser.evaluate(() => document.querySelectorAll('h1').length)).toBe(1);
  });

  test(`Esc closes the search sheet and focus returns (${lang})`, { tags: ['a11y'], requires: ['browser'] }, async ({ go, browser }) => {
    await go('superadmin', '', lang as Lang);
    await sleep(1200);
    await press(browser, 'Control+k');
    await sleep(500);
    expect(await browser.evaluate(`!!document.querySelector('dialog.palette[open]')`)).toBe(true);
    await press(browser, 'Escape');
    await sleep(400);
    expect(await browser.evaluate(`!!document.querySelector('dialog.palette[open]')`)).toBe(false);
    expect(await browser.evaluate(`document.activeElement?.tagName`)).not.toBe('DIALOG');
  });
}
