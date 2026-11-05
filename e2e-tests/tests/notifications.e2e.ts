import { test, expect, LANGS, M } from './lib.ts';

// The notification sheet (bell in the menu header, every signed-in person): under progress, so it opens, says so, and closes.
const text = (b: any) => b.evaluate(() => document.body.innerText) as Promise<string>;
const menu = async (b: any) => { if (await b.evaluate(() => window.innerWidth <= 900)) { await b.locator('#trigger').tap(); await new Promise((r) => setTimeout(r, 700)); } };

for (const lang of LANGS) {
  test(`Notifications: the bell opens a sheet that says it is under progress, Escape and the close button shut it (${lang})`, { tags: ['e2e', 'notifications'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('e2euser', '', lang);
    await menu(browser);
    await expect(browser.locator('#notif')).toHaveCount(0);
    await browser.locator('#notif-btn').tap();
    await expect(browser.locator('#notif')).toBeVisible();
    expect(await text(browser)).toContain(M(lang, 'app', 'notifications.progress'));
    await shot(`notifications-${lang}-1-open`);
    await browser.keyboard.press('Escape');
    await expect(browser.locator('#notif')).toHaveCount(0);
    await browser.locator('#notif-btn').tap();
    await expect(browser.locator('#notif')).toBeVisible();
    await browser.locator('#notif button[aria-label]').tap();
    await expect(browser.locator('#notif')).toHaveCount(0);
  });
}
