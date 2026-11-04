import { afterAll } from 'e2e';
import { test, expect, apiAs, stamp, capture, LANGS, type Lang } from './lib.ts';

// Users page through the real UI: add (validation, By jobs, By screens, exact bodies), no Shortcuts in the form, then cleanup by API.
const made: string[] = [];
const T = { en: { save: 'Save', user: 'User' }, ar: { save: 'حفظ', user: 'مستخدم عادي' } } as const;

for (const lang of LANGS) {
  test(`users UI: add a User with jobs and screens, body captured (${lang})`, { tags: ['e2e', 'users'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    const tag = stamp().toLowerCase(), name = `e2eu${tag}`;
    const seen = await capture(browser, /\/users(\/[^?]*)?(\?|$)/, ['POST', 'PUT', 'PATCH']);
    await go('superadmin', '/setup/users?new=create', lang);
    await expect(browser.locator('#ws #save')).toBeVisible();
    await shot(`users-${lang}-1-form`);
    expect(await browser.evaluate(() => document.querySelector('#ws')!.innerText)).not.toMatch(/Shortcuts|الاختصارات/);
    await browser.locator('#ws #save').tap();                                   // empty: refused, nothing sent
    expect(seen.length).toBe(0);
    await shot(`users-${lang}-2-empty-refused`);
    await browser.locator('#ws [data-k=branchId] [role=combobox]').tap();
    await screen.getByRole('option', '000001 · Main branch').tap();
    await browser.locator('#ws [data-k=userType] [role=combobox]').tap();
    await screen.getByRole('option', T[lang].user).tap();
    await browser.locator('#ws #f-username').fill(name);
    await browser.locator('#ws #f-password').fill('E2e-Temp-Pass-9876');
    await browser.locator('#ws #f-confirmPassword').fill('E2e-Temp-Pass-9876');
    await expect(browser.locator('#ws input[data-job]').first()).toBeVisible();
    await browser.locator('#ws input[data-job]:not([disabled])').first().tap();    // tick a job card
    await shot(`users-${lang}-3-job-ticked`);
    await browser.locator('#ws [role=tab]').nth(1).tap();                          // By screens
    await browser.locator('#ws #screen-q').fill('zzzz-no-such');
    expect(await browser.evaluate(() => document.querySelectorAll('#ws input[data-screen]').length)).toBe(0);
    await browser.locator('#ws #screen-q').fill('');
    await expect(browser.locator('#ws input[data-screen]').first()).toBeVisible();
    await shot(`users-${lang}-4-screens`);
    await browser.locator('#ws #save').tap();
    await expect.poll(() => seen.filter((s) => s.method === 'POST').length).toBe(1);
    const post = seen.find((s) => s.method === 'POST')!;
    expect(post.body).toMatchObject({ username: name, userType: 'user', password: 'E2e-Temp-Pass-9876' });
    expect(post.body.screens.length).toBeGreaterThan(0);
    expect(post.body).not.toHaveProperty('shortcutScreens');
    await expect.poll(() => seen.filter((s) => s.method === 'PUT').length).toBe(1);
    expect(seen.find((s) => s.method === 'PUT')!.body.jobIds.length).toBe(1);
    await shot(`users-${lang}-5-saved`);
    const api = await apiAs('superadmin');
    const u = (await api('GET', `/users?search=${name}`)).body.items.find((x: any) => x.username === name);
    expect(u).toBeTruthy(); made.push(u.id);
    expect(u.screens.length).toBe(post.body.screens.length);
  });
}

afterAll(async () => { const api = await apiAs('superadmin'); for (const id of made) await api('DELETE', `/users/${id}`); });
