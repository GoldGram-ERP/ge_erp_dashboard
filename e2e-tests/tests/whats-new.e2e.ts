import { readFileSync } from 'node:fs';
import { test, expect, LANGS, M } from './lib.ts';
// The newest released version, read from the data the page shows, so a new release never breaks the test.
const LATEST: string = (JSON.parse(readFileSync(new URL('../../changelog/changelog.json', import.meta.url), 'utf8')) as { version: string }[]).find((r) => r.version !== 'next')!.version;

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
    await expect(browser.locator('a#nav-whats-new')).toBeVisible();        // and a menu tab of its own, with the same dot
    await expect(browser.locator('#nav-whats-new .wn-dot')).toBeVisible();
    await shot(`whats-new-${lang}-1-version-with-dot`);

    await browser.locator('a#app-version').tap();
    await expect.poll(() => path(browser)).toBe(`/${lang}/whats-new`);
    await expect(browser.locator('#whats-new')).toBeVisible();
    expect(await browser.evaluate(() => document.querySelector('h1')?.textContent ?? '')).toContain(M(lang, 'app', 'whatsNew.title'));
    const body = await text(browser);
    expect(body).toContain(`v${LATEST}`);
    expect(body).toContain(M(lang, 'app', 'whatsNew.latest'));
    expect(body).toContain(M(lang, 'app', 'whatsNew.kind.new'));
    // "where" is built from the real menu names
    expect(body).toContain(`${M(lang, 'nav', 'group.buy')} › ${M(lang, 'nav', 'item.items')}`);
    // Layout, not just presence: every kind pill sits inside its own card and is in the normal flow (a Tailwind `.fixed` once pinned it over the text).
    const pills = await browser.evaluate(() => Array.from(document.querySelectorAll('#whats-new .wn-kind')).map((el) => {
      const r = el.getBoundingClientRect(), c = (el.closest('.wn-change') as HTMLElement).getBoundingClientRect(), t = (el.parentElement!.querySelector('.wn-text') as HTMLElement).getBoundingClientRect();
      const inside = r.top >= c.top - 1 && r.bottom <= c.bottom + 1 && r.left >= c.left - 1 && r.right <= c.right + 1;
      const overlapsText = r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
      return { position: getComputedStyle(el).position, inside, overlapsText };
    })) as { position: string; inside: boolean; overlapsText: boolean }[];
    expect(pills.length).toBeGreaterThan(3);
    for (const p of pills) expect(p).toEqual({ position: 'static', inside: true, overlapsText: false });
    await shot(`whats-new-${lang}-2-page`);
    expect(await browser.evaluate((k: string) => localStorage.getItem(k), SEEN)).toBe(LATEST);

    // back to Home: the dot is gone for good
    await go('superadmin', '', lang);
    await menu(browser);
    await expect(browser.locator('a#app-version')).toBeVisible();
    await expect(browser.locator('#app-version .wn-dot')).toHaveCount(0);
    await expect(browser.locator('#nav-whats-new .wn-dot')).toHaveCount(0);

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
    expect(await browser.locator('span#app-version').textContent()).not.toContain('+');   // the build commit is for Admin and Super admin only
    await expect(browser.locator('a#app-version')).toHaveCount(0);
    await expect(browser.locator('a#nav-whats-new')).toHaveCount(0);
    await go('e2euser', '/whats-new', lang);
    await expect.poll(() => path(browser)).toBe(`/${lang}`);
    expect(await text(browser)).not.toContain(M(lang, 'app', 'whatsNew.sub'));
    await shot(`whats-new-${lang}-5-user-goes-home`);
  });
}
