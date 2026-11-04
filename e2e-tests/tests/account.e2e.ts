import { test, expect, LANGS, M, PASSWORD, signInApi, unlock, stamp, type Lang } from './lib.ts';
const txtOf = (b: any, sel: string): Promise<string> => b.evaluate((q: string) => (document.querySelector(q) as HTMLElement | null)?.innerText ?? '', sel);
const attr = (b: any, sel: string, a: string): Promise<string> => b.evaluate((x: string) => { const [q, n] = x.split('||'); return document.querySelector(q)?.getAttribute(n) ?? ''; }, `${sel}||${a}`);

const A = (l: Lang, k: string) => M(l, 'app', `account.${k}`);
const P = (l: Lang, k: string) => M(l, 'access', `password.${k}`);

for (const lang of LANGS) {
  test(`account page shows name, username, type, branch, access (${lang})`, { tags: ['ui', 'account'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('e2eadmin', '/account', lang);
    await expect(browser.locator('#acct')).toBeVisible();
    const txt = await txtOf(browser, '#acct');
    for (const k of ['name', 'username', 'type', 'branch', 'pages', 'cashDiscount']) expect(txt).toContain(A(lang, k));
    expect(txt).toContain('e2eadmin');
    expect(txt).toContain(M(lang, 'app', 'userType.admin'));
    await shot(`account-${lang}`);
  });

  test(`text size buttons change the zoom and stop at both ends (${lang})`, { tags: ['ui', 'account'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('e2eadmin', '/account', lang);
    const now = () => txtOf(browser, '#ts-now');
    const base = await now();
    await browser.locator('#ts-up').tap();
    const up = await now();
    expect(up).not.toBe(base);
    await shot(`text-larger-${lang}`);
    for (let i = 0; i < 8 && (await attr(browser, '#ts-up', 'aria-disabled')) !== 'true'; i++) await browser.locator('#ts-up').tap();
    expect(await attr(browser, '#ts-up', 'aria-disabled')).toBe('true');
    for (let i = 0; i < 8 && (await attr(browser, '#ts-down', 'aria-disabled')) !== 'true'; i++) await browser.locator('#ts-down').tap();
    expect(await attr(browser, '#ts-down', 'aria-disabled')).toBe('true');
    const smallest = await now();
    expect(smallest).not.toBe(await (async () => { await browser.locator('#ts-up').tap(); return now(); })()); // one step up from the smallest changes it
    while ((await now()) !== base) await browser.locator('#ts-up').tap(); // leave the account as found
  });

  test(`change password: every validation message and the show/hide buttons (${lang})`, { tags: ['ui', 'account', 'validation'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await unlock('e2euser');
    await go('e2euser', '/account', lang);
    const fill = async (cur: string, nw: string, conf: string) => {
      await browser.locator('#f-currentPassword').fill(cur); await browser.locator('#f-newPassword').fill(nw); await browser.locator('#f-confirmPassword').fill(conf);
      await browser.locator('#pw-save').tap();
    };
    const err = (n: string) => browser.locator(`#e-${n}`);
    await browser.locator('#pw-save').tap(); // all empty
    for (const n of ['currentPassword', 'newPassword', 'confirmPassword']) await expect(err(n)).toContainText(P(lang, 'errors.required'));
    await shot(`pw-required-${lang}`);
    await fill(PASSWORD, 'short1', 'short1');
    await expect(err('newPassword')).toContainText(P(lang, 'errors.tooShort'));
    await fill(PASSWORD, 'x'.repeat(129), 'x'.repeat(129));
    await expect(err('newPassword')).toContainText(P(lang, 'errors.tooLong'));
    await fill(PASSWORD, PASSWORD, PASSWORD);
    await expect(err('newPassword')).toContainText(P(lang, 'errors.sameAsCurrent'));
    await fill(PASSWORD, 'Brand-New-Pass-77', 'Different-Pass-88');
    await expect(err('confirmPassword')).toContainText(P(lang, 'errors.mismatch'));
    await shot(`pw-mismatch-${lang}`);
    await fill('Wrong-Current-1234', 'Brand-New-Pass-77', 'Brand-New-Pass-77'); // reaches the backend
    await expect(err('currentPassword')).toContainText(P(lang, 'errors.currentWrong'));
    await shot(`pw-current-wrong-${lang}`);
    // show/hide: each of the three fields has its own button
    for (const n of ['currentPassword', 'newPassword', 'confirmPassword']) {
      expect(await attr(browser, `#f-${n}`, 'type')).toBe('password');
      await browser.locator(`#f-${n} ~ button`).tap();
      expect(await attr(browser, `#f-${n}`, 'type')).toBe('text');
      await browser.locator(`#f-${n} ~ button`).tap();
      expect(await attr(browser, `#f-${n}`, 'type')).toBe('password');
    }
    await signInApi('e2euser'); // a good sign-in resets the failed-attempts counter
  });
}

test('change password round trip through the UI: change, sign in with the new one, change back', { tags: ['ui', 'account', 'round-trip'], requires: ['browser'] }, async ({ go, app, browser, shot }) => {
  await unlock('e2euser');
  const NEW = `E2e-Temp-${stamp()}-x9`;
  const change = async (cur: string, nw: string) => {
    await browser.locator('#f-currentPassword').fill(cur); await browser.locator('#f-newPassword').fill(nw); await browser.locator('#f-confirmPassword').fill(nw);
    await browser.locator('#pw-save').tap();
    await expect(browser.locator('#pw-rules')).toBeVisible();
    await expect(browser.locator('.note[role=status]')).toContainText(P('en', 'saved'));
  };
  try {
    await go('e2euser', '/account', 'en');
    await change(PASSWORD, NEW);
    await shot('pw-changed');
    expect((await signInApi('e2euser', PASSWORD)).status).toBe(401);
    await signInApi('e2euser', NEW);
    await app.open('/en/sign-in');
    await browser.locator('#f-email').fill('e2euser');
    await browser.locator('#f-password').fill(NEW);
    await browser.locator('#si-go').tap();
    await expect(browser).toHaveURL(/\/en\/?$/);
    await shot('signed-in-with-new');
    await app.open('/en/account');
    await change(NEW, PASSWORD);
  } finally {
    // safety net: whichever password is current, end on the standard one
    if ((await signInApi('e2euser', PASSWORD)).status !== 200) {
      const s = await signInApi('e2euser', NEW);
      if (s.status === 200) await fetch('http://localhost:8100/access/change-password', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3100', cookie: s.cookie, 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ currentPassword: NEW, newPassword: PASSWORD }) });
    }
  }
  expect((await signInApi('e2euser', PASSWORD)).status).toBe(200);
});
