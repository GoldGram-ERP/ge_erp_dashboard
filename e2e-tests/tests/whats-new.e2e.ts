import { test, expect, LANGS, M } from './lib.ts';

// What's new (Admin and Super admin only): reached from the version label in the sidebar, a dot until it is read, one line per change
// with where to see it (Group > Screen from the real menu) and a button that opens the screen. A plain User gets none of it.
const SEEN = 'ge-erp:whats-new-seen';
const text = (b: any) => b.evaluate(() => document.body.innerText) as Promise<string>;
const path = (b: any) => b.evaluate(() => location.pathname) as Promise<string>;
// On a phone the side menu is a drawer, closed after every page: open it to reach the version label.
const menu = async (b: any) => { if (await b.evaluate(() => window.innerWidth <= 900)) { await b.locator('#trigger').tap(); await new Promise((r) => setTimeout(r, 700)); } };

for (const lang of LANGS) {
  test(`What's new: the Super admin reads it from the version, the dot goes, and a change opens its screen (${lang})`, { tags: ['e2e', 'whats-new'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('superadmin', '', lang);
    await browser.evaluate((k: string) => { localStorage.removeItem(k); return null; }, SEEN);
    await go('superadmin', '', lang);
    await menu(browser);
    await expect(browser.locator('a#app-version')).toBeVisible();
    await expect(browser.locator('#app-version .wn-dot')).toBeVisible();   // a version nobody has looked at
    await shot(`whats-new-${lang}-1-version-with-dot`);

    await browser.locator('a#app-version').tap();
    await expect.poll(() => path(browser)).toBe(`/${lang}/whats-new`);
    await expect(browser.locator('#whats-new')).toBeVisible();
    expect(await browser.evaluate(() => document.querySelector('h1')?.textContent ?? '')).toContain(M(lang, 'app', 'whatsNew.title'));
    const body = await text(browser);
    expect(body).toContain('v1.0.16');
    expect(body).toContain(M(lang, 'app', 'whatsNew.latest'));
    expect(body).toContain(M(lang, 'app', 'whatsNew.kind.new'));
    // "where" is built from the real menu names
    expect(body).toContain(`${M(lang, 'nav', 'group.buy')} › ${M(lang, 'nav', 'item.items')}`);
    await shot(`whats-new-${lang}-2-page`);
    expect(await browser.evaluate((k: string) => localStorage.getItem(k), SEEN)).toBe('1.0.16');

    // back to Home: the dot is gone for good
    await go('superadmin', '', lang);
    await menu(browser);
    await expect(browser.locator('a#app-version')).toBeVisible();
    await expect(browser.locator('#app-version .wn-dot')).toHaveCount(0);

    // one tap opens the screen of a change
    await go('superadmin', '/whats-new', lang);
    await expect(browser.locator('#whats-new')).toBeVisible();
    await browser.locator('#whats-new a[href$="/buy/items"]').first().tap();
    await expect.poll(() => path(browser)).toBe(`/${lang}/buy/items`);
    await shot(`whats-new-${lang}-3-opened-items`);
  });

  test(`What's new: an Admin sees it too (${lang})`, { tags: ['e2e', 'whats-new'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('e2eadmin', '/whats-new', lang);
    await expect(browser.locator('#whats-new')).toBeVisible();
    await menu(browser);
    await expect(browser.locator('a#app-version')).toBeVisible();
    await shot(`whats-new-${lang}-4-admin`);
  });

  test(`What's new: a plain User has no link, and the address goes Home (${lang})`, { tags: ['e2e', 'whats-new'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('e2euser', '', lang);
    await menu(browser);
    await expect(browser.locator('span#app-version')).toBeVisible();
    await expect(browser.locator('a#app-version')).toHaveCount(0);
    await go('e2euser', '/whats-new', lang);
    await expect.poll(() => path(browser)).toBe(`/${lang}`);
    expect(await text(browser)).not.toContain(M(lang, 'app', 'whatsNew.sub'));
    await shot(`whats-new-${lang}-5-user-goes-home`);
  });
}
