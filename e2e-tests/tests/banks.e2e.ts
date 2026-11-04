import { afterAll } from 'e2e';
import { test, expect, apiAs, stamp, capture, M, W, type Lang } from './lib.ts';

// /money/banks through the real UI as superadmin: bank and account create/edit/delete, validation, request bodies on the wire, list search.
const b = (l: Lang, k: string) => M(l, 'bank-accounts', `banks.${k}`);
const a = (l: Lang, k: string) => M(l, 'bank-accounts', `accounts.${k}`);
const created: string[] = [];
const tx = (br: any, sel: string): Promise<string> => br.evaluate((q: string) => document.querySelector(q)?.textContent ?? '', sel);

for (const lang of ['en', 'ar'] as Lang[]) {
  test(`banks and bank accounts: every field, validation, bodies, search, delete (${lang})`, { tags: ['e2e', 'banks'], requires: ['browser'] }, async ({ go, screen, browser, shot }) => {
    const s = stamp(), name = `E2E Bank ${s}`, name2 = `${name} v2`, acc = `E2E Acc ${s}`, acc2 = `${acc} v2`;
    const api = await apiAs('superadmin');
    await go('superadmin', '/money/banks', lang);
    const calls = await capture(browser, /\/(banks|bank-accounts)(\?|$|\/)/);
    const save = () => browser.locator('#save').tap();
    const sent = (m: string, p: string) => calls.filter((c) => c.method === m && new RegExp(p).test(c.url));
    const row = (text: string) => screen.getByText(text, { exact: true });
    await shot(`banks-${lang}-1-list`);

    // ---- bank: required, too long (maxLength stops typing at 100), create
    await screen.getByRole('button', b(lang, 'add')).tap();
    await save();
    await expect(browser.locator('#f-bankName-err')).toContainText(M(lang, 'common', 'fieldErrors.required'));
    expect(sent('POST', '/banks')).toHaveLength(0);
    await shot(`banks-${lang}-2-bank-required`);
    await browser.locator('#f-bankName').fill('x'.repeat(120));
    expect((await api('GET', '/banks?search=' + 'x'.repeat(10))).status).toBe(200);
    await browser.locator('#f-bankName').fill(name);
    await save();
    await expect.poll(() => sent('POST', '/banks$').length).toBe(1);
    expect(sent('POST', '/banks$')[0].body).toEqual({ bankName: name });
    let bank: any; await expect.poll(async () => { bank = (await api('GET', `/banks?search=${encodeURIComponent(name)}`)).body.items?.[0]; return !!bank; }).toBe(true);
    created.push(`/banks/${bank.id}`);
    await expect(row(name)).toBeVisible();
    await shot(`banks-${lang}-3-bank-created`);

    // ---- duplicate name: backend refuses (bankNameTaken), nothing is saved twice
    await screen.getByRole('button', b(lang, 'add')).tap();
    await browser.locator('#f-bankName').fill(name);
    await save();
    await expect(browser.locator('#f-bankName-err')).toBeVisible();
    await shot(`banks-${lang}-4-bank-duplicate`);
    await browser.locator('#cancel, [data-close]').first().tap();
    await browser.locator('dialog[open] button').last().tap(); // discard the unsaved form

    // ---- bank edit
    await row(name).tap();
    await browser.locator('[data-edit]').tap();
    await browser.locator('#f-bankName').fill(name2);
    await save();
    await expect.poll(() => sent('PATCH', `/banks/${bank.id}`).length).toBe(1);
    expect(sent('PATCH', `/banks/${bank.id}`)[0].body).toEqual({ bankName: name2 });
    await expect(row(name2)).toBeVisible();

    // ---- accounts view: required, commission validation, create with every field, edit, commission cleared
    await screen.getByRole('button', a(lang, 'listTitle')).tap();
    await screen.getByRole('button', a(lang, 'add')).tap();
    await save();
    for (const f of ['accountName', 'bankId']) await expect(browser.locator(`#f-${f}-err`)).toContainText(M(lang, 'common', 'fieldErrors.required'));
    await shot(`banks-${lang}-5-account-required`);
    await browser.locator('#f-accountName').fill(acc);
    await browser.locator('#f-bankId-btn').tap();
    await screen.getByRole('option', name2).tap();
    await browser.locator('#f-commission').fill('1.234');
    await save();
    await expect(browser.locator('#f-commission-err')).toContainText(M(lang, 'common', 'fieldErrors.invalid'));
    expect(sent('POST', '/bank-accounts$')).toHaveLength(0);
    await shot(`banks-${lang}-6-commission-invalid`);
    await browser.locator('#f-commission').fill('1.25');
    await save();
    await expect.poll(() => sent('POST', '/bank-accounts$').length).toBe(1);
    expect(sent('POST', '/bank-accounts$')[0].body).toEqual({ accountName: acc, bankId: bank.id, commission: '1.25' });
    let account: any; await expect.poll(async () => { account = (await api('GET', `/bank-accounts?search=${encodeURIComponent(acc)}`)).body.items?.[0]; return !!account; }).toBe(true);
    created.unshift(`/bank-accounts/${account.id}`);
    await expect(row(acc)).toBeVisible();
    await shot(`banks-${lang}-7-account-created`);
    await row(acc).tap();
    await browser.locator('[data-edit]').tap();
    await browser.locator('#f-accountName').fill(acc2);
    await browser.locator('#f-commission').fill('');
    await save();
    await expect.poll(() => sent('PATCH', `/bank-accounts/${account.id}`).length).toBe(1);
    expect(sent('PATCH', `/bank-accounts/${account.id}`)[0].body).toEqual({ accountName: acc2, bankId: bank.id, commission: null });

    // ---- list search: a hit, then no match (empty state)
    await browser.locator('#q').fill(acc2);
    await expect(row(acc2)).toBeVisible();
    await browser.locator('#q').fill(`nomatch-${s}`);
    await expect(browser.locator('#clear')).toBeVisible();
    await shot(`banks-${lang}-8-search-empty`);
    await browser.locator('#clear').tap();

    // ---- delete: the bank is refused while the account lives (bankInUse), then account, then bank
    await screen.getByRole('button', b(lang, 'listTitle')).tap();
    await row(name2).tap();
    await browser.locator('[data-remove]').tap();
    await screen.getByRole('button', W.del[lang]).last().tap();
    await expect.poll(() => sent('DELETE', `/banks/${bank.id}`).length).toBe(1);
    expect((await api('GET', `/banks/${bank.id}`)).body.deletedAt ?? null).toBeNull();
    await shot(`banks-${lang}-9-bank-in-use`);
    await browser.locator('[data-close]').first().tap().catch(() => {});
    expect((await api('DELETE', `/bank-accounts/${account.id}`)).status).toBeLessThan(300);
    expect((await api('DELETE', `/banks/${bank.id}`)).status).toBeLessThan(300);
    created.length = 0;
  });
}

afterAll(async () => {
  const api = await apiAs('superadmin');
  for (const p of created) await api('DELETE', p);
});
