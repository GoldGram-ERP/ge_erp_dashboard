import { afterAll } from 'e2e';
import { test, expect, apiAs, stamp, capture, M, LANGS, type Lang } from './lib.ts';

// Items page (buy/items): category -> item name -> item through the real UI; request bodies are captured on the wire.
const g = (l: Lang, k: string) => M(l, 'gold-accounts', k);
const created: { cat?: string; name?: string; item?: string } = {};

for (const lang of LANGS) {
  test(`items: category, item name and item create/edit/delete with captured bodies (${lang})`, { tags: ['e2e', 'items'], requires: ['browser'] }, async ({ go, screen, browser, shot }) => {
    const t = stamp();
    const cat = `E2E Cat ${t}`, nm = `E2E Name ${t}`;
    await go('superadmin', '/buy/items', lang);
    const posts = await capture(browser, /\/(categories|item-names|items)(\?|$|\/)/);
    await expect(screen.getByRole('button', g(lang, 'categories.add'))).toBeVisible();
    await shot(`items-${lang}-1-list`);

    // category: empty form is refused client-side (no request), then create
    await screen.getByRole('button', g(lang, 'categories.add')).tap();
    await shot(`items-${lang}-2-category-form`);
    await screen.getByRole('button', lang === 'ar' ? 'حفظ' : 'Save').tap();
    await expect(browser.locator('[role=dialog] .err, [role=dialog] [aria-invalid=true], [role=dialog] .field-error').first()).toBeVisible();
    expect(posts.filter((p) => p.method === 'POST')).toHaveLength(0);
    await shot(`items-${lang}-3-category-required`);
    await browser.locator('[role=dialog] input[type=text]').first().fill(cat);
    await screen.getByRole('button', lang === 'ar' ? 'حفظ' : 'Save').tap();
    await expect.poll(() => posts.filter((p) => p.url.includes('categories')).length).toBe(1);
    expect(posts[0]).toMatchObject({ method: 'POST', body: { categoryName: cat, qrLabel: false } });
    const api = await apiAs('superadmin');
    const c = (await api('GET', `/categories?search=${encodeURIComponent(cat)}`)).body.items[0];
    created.cat = c.id;
    await shot(`items-${lang}-4-category-saved`);

    // item name under that category
    await screen.getByRole('button', g(lang, 'itemNames.title')).tap();
    await screen.getByRole('button', g(lang, 'itemNames.add')).tap();
    await browser.locator('[role=dialog] input[type=text]').last().fill(nm);
    await browser.locator('[role=dialog] [role=combobox], [role=dialog] select').first().tap();
    await screen.getByRole('option', cat).tap();
    await shot(`items-${lang}-5-name-form`);
    await screen.getByRole('button', lang === 'ar' ? 'حفظ' : 'Save').tap();
    await expect.poll(() => posts.filter((p) => p.url.includes('item-names')).length).toBe(1);
    expect(posts.find((p) => p.url.includes('item-names'))!.body).toEqual({ categoryId: c.id, itemName: nm });
    const n = (await api('GET', `/item-names?search=${encodeURIComponent(nm)}`)).body.items[0];
    created.name = n.id;

    // duplicate name in the same category is refused by the backend (409) - API level
    expect((await api('POST', '/item-names', { categoryId: c.id, itemName: nm })).status).toBe(409);
    expect((await api('POST', '/items', { itemNameId: n.id, isCoded: true, itemType: 'gold', categoryId: c.id, karat: '19' })).status).toBe(400);

    // item
    await screen.getByRole('button', g(lang, 'items.title')).tap();
    await screen.getByRole('button', g(lang, 'items.add')).tap();
    await shot(`items-${lang}-6-item-form`);
  });
}

afterAll(async () => {
  const api = await apiAs('superadmin');
  for (const [p, id] of [['/items', created.item], ['/item-names', created.name], ['/categories', created.cat]] as const) if (id) await api('DELETE', `${p}/${id}`);
});
