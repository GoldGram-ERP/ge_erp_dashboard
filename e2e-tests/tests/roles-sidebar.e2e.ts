import { test, expect, LANGS, NAV, M, canOpen, apiAs, type Role } from './lib.ts';

// Sidebar versus the permission matrix: for each role the sidebar links are exactly the pages canOpen allows, and a page not allowed is refused on a direct URL.
for (const role of ['e2eadmin', 'e2euser'] as Role[]) {
  for (const lang of LANGS) {
    test(`sidebar matches the matrix and a direct URL is refused: ${role} (${lang})`, { tags: ['e2e', 'roles'], requires: ['browser'] }, async ({ go, browser, shot }) => {
      const me = (await (await apiAs(role))('GET', '/access/me')).body;
      const items = NAV.flatMap((g) => g.items);
      const allowed = items.filter((i) => canOpen(me, i.screens)).map((i) => `/${lang}${i.route}`);
      const denied = items.filter((i) => !canOpen(me, i.screens));
      await go(role, '/', lang);
      await browser.locator('#nav a[href]').first().waitFor();
      const hrefs = (await browser.evaluate(() => [...document.querySelectorAll('#nav a[href]')].map((a) => a.getAttribute('href')))) as string[];
      for (const h of allowed) expect(hrefs).toContain(h);
      for (const i of denied) expect(hrefs).not.toContain(`/${lang}${i.route}`);
      await shot(`roles-${role}-${lang}-sidebar`);
      if (denied.length) {
        await go(role, denied[0].route, lang);
        await expect(browser.locator('#ws')).toContainText(M(lang, 'app', 'noAccess'));
        await shot(`roles-${role}-${lang}-refused`);
      }
      // the Users admin pages are not offered to a plain User
      if (role === 'e2euser') expect(hrefs.some((h) => h.includes('/setup/users'))).toBe(false);
    });
  }
}
