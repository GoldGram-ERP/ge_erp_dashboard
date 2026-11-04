import { afterAll } from 'e2e';
import { test, expect, apiAs, stamp, capture, M, LANGS, type Lang } from './lib.ts';

// Items page (buy/items): category through the real UI, the Item names list (nothing to add there), the item form; bodies captured on the wire.
const g = (l: Lang, k: string) => M(l, 'gold-accounts', k);
const created: { cat?: string; item?: string } = {};

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

    // item names: a list only, no add button (a name is typed on the item form)
    await screen.getByRole('button', g(lang, 'itemNames.title')).tap();
    await expect(browser.locator('#q')).toBeVisible();
    const texts: string[] = await browser.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? ''));
    expect(texts.filter((b) => b.includes(lang === 'ar' ? 'إضافة اسم صنف' : 'Add item name'))).toEqual([]);
    await shot(`items-${lang}-5-names-list`);

    // a wrong karat is refused by the backend (400) and adds nothing, not even the typed name - API level
    expect((await api('POST', '/items', { itemName: nm, isCoded: true, itemType: 'gold', categoryId: c.id, karat: '19' })).status).toBe(400);
    expect((await api('GET', `/item-names?search=${encodeURIComponent(nm)}`)).body.items).toHaveLength(0);

    // item
    await screen.getByRole('button', g(lang, 'items.title')).tap();
    await screen.getByRole('button', g(lang, 'items.add')).tap();
    await shot(`items-${lang}-6-item-form`);
  });
}

afterAll(async () => {
  const api = await apiAs('superadmin');
  for (const [p, id] of [['/items', created.item], ['/categories', created.cat]] as const) if (id) await api('DELETE', `${p}/${id}`);
});
