import { afterAll } from 'e2e';
import { test, expect, apiAs, signInApi, stamp, capture, M, LANGS, WEB, type Lang } from './lib.ts';

// Items (issue #1): weight, karat following the type, workmanship and cashback with the example box at today's price,
// the Active switch (Admin yes, normal User disabled and never sent), the Active / Inactive chips, and the Karats screen.
const g = (l: Lang, k: string) => M(l, 'gold-accounts', `items.${k}`);
const B = BigInt;
const PASS = 'E2e-Items-Pass-2468', FIRST = 'E2e-Items-First-1357';
const cleanup: string[] = [];   // DELETE paths, run in order at the end
const tx = (br: any, sel: string): Promise<string> => br.evaluate((q: string) => document.querySelector(q)?.textContent ?? '', sel);
const disabled = (br: any): Promise<boolean> => br.evaluate(() => (document.querySelector('#f-isActive') as HTMLInputElement).disabled);
// the options of the open karat list (the one #f-karat-btn controls)
const options = (br: any): Promise<string[]> => br.evaluate(() => {
  const id = document.querySelector('#f-karat-btn')?.getAttribute('aria-controls');
  return [...document.querySelectorAll(`[id="${id}"] [role=option]`)].map((o) => o.textContent?.trim() ?? '');
});
// piastres -> "18,040.09", as the screen writes money
const money = (p: bigint) => { const d = String(p).padStart(3, '0'); return `${d.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ',')}.${d.slice(-2)}`; };

// One Admin and one normal User, made through the API as the Super admin (removed at the end).
let people: Promise<{ admin: string; user: string }> | undefined;
const setup = () => (people ??= (async () => {
  const api = await apiAs('superadmin');
  const t = stamp().toLowerCase();
  const branches = ((await api('GET', '/branches')).body.items ?? []) as { id: string }[];
  const screens = ['gold-accounts/categories', 'gold-accounts/categories-list', 'gold-accounts/item-names', 'gold-accounts/item-names-list', 'gold-accounts/items', 'gold-accounts/items-list'];
  // An existing branch (a new branch needs an Admin first); an Admin goes where the branch takes one (adminTaken elsewhere).
  const add = async (username: string, userType: string) => {
    let last: any;
    for (const br of branches) {
      last = await api('POST', '/users', { branchId: br.id, username, email: `${username}@example.com`, password: FIRST, userType, firstName: 'E2E', familyName: userType, ...(userType === 'user' ? { screens, canUseTreasuries: false } : {}) });   // an Admin takes no screens
      if (last.status < 300) {
        cleanup.push(`/users/${last.body.id}`);
        const changed = await (await apiAs(username, FIRST))('POST', '/access/forced-password-change', { newPassword: PASS });   // a new account must change it first
        if (changed.status !== 204) throw new Error(`password ${changed.status}`);
        return username;
      }
    }
    throw new Error(`user ${last?.status} ${JSON.stringify(last?.body)}`);
  };
  const out = { admin: await add(`itadm${t}`, 'admin'), user: await add(`itusr${t}`, 'user') };
  return out;
})());

async function openAs(app: any, browser: any, username: string, path: string, lang: Lang) {
  const s = await signInApi(username, PASS);
  await browser.setCookies([{ url: WEB, name: s.name, value: s.value, httpOnly: true, sameSite: 'Lax' }]);
  await app.open(`/${lang}${path}`);
}

for (const lang of LANGS) {
  test(`items: every new field, karat follows type, example box, Active by role (${lang})`, { tags: ['e2e', 'items'], requires: ['browser'] }, async ({ app, screen, browser, shot }) => {
    const { admin, user } = await setup();
    const api = await apiAs('superadmin');
    const t = stamp();
    const cat = (await api('POST', '/categories', { categoryName: `E2E Cat ${t}`, qrLabel: false })).body;
    const name = (await api('POST', '/item-names', { categoryId: cat.id, itemName: `E2E Ring ${t}` })).body;
    cleanup.unshift(`/item-names/${name.id}`); cleanup.push(`/categories/${cat.id}`);
    const price = await api('GET', '/gold-prices/today');
    expect(price.status).toBe(200);   // the example needs a saved price
    const perGram21 = (B(2) * B(price.body.sellPrice) * B(21) + B(21)) / B(42);
    const gold = (perGram21 * B(4375) + B(500)) / B(1000);

    await openAs(app, browser, admin, '/buy/items', lang);
    const calls = await capture(browser, /\/items(\?|$|\/)/);
    const sent = (m: string) => calls.filter((c) => c.method === m);
    const pick = async (field: string, label: string) => { await browser.locator(`#f-${field}-btn`).tap(); await screen.getByRole('option', label).tap(); };
    const save = () => browser.locator('#save').tap();

    await screen.getByRole('button', M(lang, 'gold-accounts', 'items.title')).tap();
    await screen.getByRole('button', g(lang, 'add')).tap();
    await expect(browser.locator('#f-weight')).toBeVisible();
    await shot(`items-fields-${lang}-1-form`);

    // every field validates: an empty form sends nothing
    await save();
    for (const f of ['categoryId', 'itemNameId', 'karat', 'weight', 'workmanshipMode', 'workmanshipValue', 'cashbackMode', 'cashbackValue'])
      await expect(browser.locator(`#f-${f}-err`)).toBeVisible();
    expect(sent('POST')).toHaveLength(0);
    await shot(`items-fields-${lang}-2-required`);

    // the karat list follows the type
    await browser.locator('#f-karat-btn').tap();
    expect(await options(browser)).toEqual(['18', '21', '24']);
    await shot(`items-fields-${lang}-3-karats-gold`);
    await browser.locator('#f-karat-btn').tap();
    await pick('itemType', g(lang, 'itemTypes.other_or_silver'));
    await expect(browser.locator('#f-karat-btn')).toContainText('999');
    await browser.locator('#f-karat-btn').tap();
    expect(await options(browser)).toEqual(['999']);
    await shot(`items-fields-${lang}-4-karats-silver`);
    await browser.locator('#f-karat-btn').tap();
    await pick('itemType', g(lang, 'itemTypes.gold'));
    await expect(browser.locator('#f-karat-btn')).not.toContainText('999');

    // fill it; weight and value take Arabic digits; wrong values are refused before any request
    await pick('categoryId', cat.categoryName);
    await pick('itemNameId', name.itemName);
    await pick('karat', '21');
    await browser.locator('#f-weight').fill('1.2345');
    await pick('workmanshipMode', g(lang, 'modes.percent'));
    await browser.locator('#f-workmanshipValue').fill('100.01');
    await save();
    await expect(browser.locator('#f-weight-err')).toBeVisible();
    await expect(browser.locator('#f-workmanshipValue-err')).toContainText(g(lang, 'percentMax'));
    expect(sent('POST')).toHaveLength(0);
    await browser.locator('#f-weight').fill(lang === 'ar' ? '٤٫٣٧٥' : '4.375');

    // the example box follows the typing: per gram, percent, per piece
    const box = '#workmanship-example';
    await pick('workmanshipMode', g(lang, 'modes.per_gram'));
    await browser.locator('#f-workmanshipValue').fill('187.50');
    let charge = (B(18750) * B(4375) + B(500)) / B(1000);
    await expect.poll(() => tx(browser, box)).toContain(`${money(gold)}`);
    for (const n of [charge, gold + charge]) expect(await tx(browser, box)).toContain(money(n));
    await shot(`items-fields-${lang}-5-example-per-gram`);
    await pick('workmanshipMode', g(lang, 'modes.percent'));
    await browser.locator('#f-workmanshipValue').fill('4.5');
    charge = (gold * B(450) + B(5000)) / B(10000);
    await expect.poll(() => tx(browser, box)).toContain(money(gold + charge));
    await shot(`items-fields-${lang}-6-example-percent`);
    await pick('workmanshipMode', g(lang, 'modes.per_piece'));
    await browser.locator('#f-workmanshipValue').fill('800');
    await expect.poll(() => tx(browser, box)).toContain(money(gold + B(80000)));
    await pick('cashbackMode', g(lang, 'modes.per_gram'));
    await browser.locator('#f-cashbackValue').fill('10');
    await expect.poll(() => tx(browser, '#cashback-example')).toContain(money((B(1000) * B(4375) + B(500)) / B(1000)));
    await shot(`items-fields-${lang}-7-example-cashback`);
    expect(await disabled(browser)).toBe(false);

    // save: the exact body on the wire
    await save();
    await expect.poll(() => sent('POST').length).toBe(1);
    expect(sent('POST')[0].body).toEqual({
      itemNameId: name.id, isCoded: true, itemType: 'gold', categoryId: cat.id, karat: '21', weight: 4375,
      workmanshipMode: 'per_piece', workmanshipValue: '800.00', cashbackMode: 'per_gram', cashbackValue: '10.00', isActive: true,
    });
    let item: any; await expect.poll(async () => { item = (await api('GET', `/items?search=${encodeURIComponent(name.itemName)}`)).body.items?.[0]; return !!item; }).toBe(true);
    cleanup.unshift(`/items/${item.id}`);
    expect(item).toMatchObject({ weight: 4375, workmanshipMode: 'per_piece', workmanshipValue: '800.00', cashbackMode: 'per_gram', cashbackValue: '10.00', isActive: true });
    await browser.locator('#q').fill(name.itemName);
    await expect(screen.getByText(name.itemName, { exact: true })).toBeVisible();
    await expect(browser.locator('tr.row').first()).toContainText('4.375');
    await shot(`items-fields-${lang}-8-list`);

    // the Admin switches it off: the PATCH carries isActive false; the Inactive chip shows it, the Active chip does not
    await screen.getByText(name.itemName, { exact: true }).tap();
    await screen.getByRole('button', M(lang, 'common', 'edit')).tap();
    await browser.locator('#f-isActive').tap();
    await save();
    await expect.poll(() => sent('PATCH').length).toBe(1);
    expect(sent('PATCH')[0].body).toMatchObject({ isActive: false, weight: 4375, workmanshipValue: '800.00' });
    await expect.poll(async () => (await api('GET', `/items/${item.id}`)).body.isActive).toBe(false);
    await browser.locator('#q').fill(name.itemName);
    await screen.getByRole('button', g(lang, 'inactiveOnly')).tap();
    await expect(browser.locator('tr.row.inactive')).toContainText(name.itemName);
    await shot(`items-fields-${lang}-9-inactive`);
    await screen.getByRole('button', g(lang, 'activeOnly')).tap();
    await expect.poll(() => tx(browser, 'tbody')).not.toContain(name.itemName);

    // and on again
    await screen.getByRole('button', M(lang, 'common', 'report.all')).tap();
    await screen.getByText(name.itemName, { exact: true }).tap();
    await screen.getByRole('button', M(lang, 'common', 'edit')).tap();
    await browser.locator('#f-isActive').tap();
    await save();
    await expect.poll(async () => (await api('GET', `/items/${item.id}`)).body.isActive).toBe(true);

    // a normal User: the switch is disabled with its reason, and the edit never sends it
    await openAs(app, browser, user, '/buy/items', lang);
    const userCalls = await capture(browser, /\/items(\?|$|\/)/);
    await screen.getByRole('button', M(lang, 'gold-accounts', 'items.title')).tap();
    await browser.locator('#q').fill(name.itemName);
    await screen.getByText(name.itemName, { exact: true }).tap();
    await screen.getByRole('button', M(lang, 'common', 'edit')).tap();
    expect(await disabled(browser)).toBe(true);
    await expect(browser.locator('#f-isActive-help')).toContainText(g(lang, 'activeAdminOnly'));
    await shot(`items-fields-${lang}-10-user-active-disabled`);
    await save();
    await expect.poll(() => userCalls.filter((c) => c.method === 'PATCH').length).toBe(1);
    expect(userCalls.find((c) => c.method === 'PATCH')!.body).not.toHaveProperty('isActive');
    // and the API refuses a User who sends it anyway
    const asUser = await apiAs(user, PASS);
    const { id: _id, itemCode: _c, itemName: _n, categoryName: _cn, createdAt: _a, updatedAt: _u, deletedAt: _d, ...form } = (await api('GET', `/items/${item.id}`)).body;
    expect((await asUser('PATCH', `/items/${item.id}`, { ...form, isActive: false })).status).toBe(403);
  });

  test(`karats: the read-only list has four rows (${lang})`, { tags: ['e2e', 'karats'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await go('superadmin', '/setup/karats', lang);
    await expect.poll(() => browser.locator('tr.row').count(), { timeout: 30_000 }).toBe(4);
    expect(await browser.evaluate(() => [...document.querySelectorAll('tr.row')].map((r) => r.textContent?.trim()))).toEqual(['18', '21', '24', '999']);
    await shot(`karats-${lang}-list`);
  });
}

afterAll(async () => {
  const api = await apiAs('superadmin');
  for (const p of cleanup) await api('DELETE', p);
});
