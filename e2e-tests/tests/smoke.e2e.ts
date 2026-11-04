import { test, expect, LANGS, M, NAV, canOpen, PASSWORD, apiAs, signInApi, type Lang } from './lib.ts';

const T = (l: Lang, k: string) => M(l, 'access', k);

for (const lang of LANGS) {
  test(`sign-in page renders (${lang})`, { tags: ['smoke'], requires: ['browser'] }, async ({ app, screen, browser, shot }) => {
    await app.open(`/${lang}/sign-in`);
    await expect(screen.getByRole('heading', T(lang, 'signIn.title'))).toBeVisible();
    await expect(browser.locator('#f-email')).toBeVisible();
    await expect(browser.locator('#f-password')).toBeVisible();
    await expect(screen.getByText('GoldGram', { exact: true })).toBeVisible();
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    await shot(`signin-${lang}`);
  });

  test(`sign in as superadmin lands on Home, sidebar items, sign out (${lang})`, { tags: ['smoke'], requires: ['browser'] }, async ({ app, screen, browser, shot }) => {
    await app.open(`/${lang}/sign-in`);
    await browser.locator('#f-email').fill('superadmin');
    await browser.locator('#f-password').fill(PASSWORD);
    await browser.locator('#si-go').tap();
    await expect(browser).toHaveURL(new RegExp(`/${lang}/?$`));
    await expect(screen.getByRole('heading', /E2E Super admin/)).toBeVisible();
    await shot(`home-${lang}`);
    // every leaf of the nav tree the superadmin may open is a link in the sidebar
    const me = await (await apiAs('superadmin'))('GET', '/access/me');
    const want = NAV.flatMap((g) => g.items.filter((i) => canOpen(me.body, i.screens)).map((i) => `/${lang}${i.route}`));
    const hrefs = await browser.evaluate(() => [...document.querySelectorAll('#nav a[href]')].map((a) => a.getAttribute('href')));
    for (const h of want) expect(hrefs).toContain(h);
    expect(want.length).toBeGreaterThan(10);
    await screen.getByRole('button', M(lang, 'app', 'signOut')).tap();
    await expect(browser).toHaveURL(new RegExp(`/${lang}/sign-in`));
    await shot(`signed-out-${lang}`);
  });

  test(`unauthenticated visit redirects to sign-in (${lang})`, { tags: ['smoke'], requires: ['browser'] }, async ({ app, browser }) => {
    await app.open(`/${lang}/money/banks`);
    await expect(browser).toHaveURL(new RegExp(`/${lang}/sign-in`));
  });

  test(`wrong password shows the error (${lang})`, { tags: ['smoke', 'auth'], requires: ['browser'] }, async ({ app, screen, browser, shot }) => {
    await app.open(`/${lang}/sign-in`);
    await browser.locator('#f-email').fill('e2euser');
    await browser.locator('#f-password').fill('Wrong-Pass-9999');
    await browser.locator('#si-go').tap();
    await expect(browser.locator('form .note.warn')).toContainText(T(lang, 'signIn.errorTitle'));
    await shot(`wrong-password-${lang}`);
    await signInApi('e2euser'); // a good sign-in resets the failed-attempts counter
  });

  // Owner brief: the wrong-password message is followed by how many attempts are left. The page only shows errorTitle; the backend sign-in does not send attemptsLeft.
  test(`wrong password also shows the attempts left text (${lang})`, { tags: ['auth', 'bug-candidate'], requires: ['browser'] }, async ({ app, screen, browser }) => {
    await app.open(`/${lang}/sign-in`);
    await browser.locator('#f-email').fill('e2euser');
    await browser.locator('#f-password').fill('Wrong-Pass-9999');
    await browser.locator('#si-go').tap();
    const tail = T(lang, 'signIn.attemptsLeft').replace('{count}', '').trim();
    await expect(browser.locator('form .note.warn')).toContainText(tail);
    await signInApi('e2euser');
  });
}

test('language switch flips dir and keeps the brand', { tags: ['smoke'], requires: ['browser'] }, async ({ go, screen, browser, shot }) => {
  await go('superadmin', '/', 'ar');
  const read = () => browser.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, brand: document.body.innerText.includes('GoldGram') }));
  expect(await read()).toMatchObject({ dir: 'rtl', lang: 'ar', brand: true });
  await shot('lang-ar');
  await screen.getByRole('button', 'English').tap();
  await expect(browser).toHaveURL(/\/en\/?$/);
  expect(await read()).toMatchObject({ dir: 'ltr', lang: 'en', brand: true });
  await shot('lang-en');
  await screen.getByRole('button', 'العربية').tap();
  await expect(browser).toHaveURL(/\/ar\/?$/);
  expect(await read()).toMatchObject({ dir: 'rtl', brand: true });
});
