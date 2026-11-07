import { test, expect, apiAs, capture, stamp, LANGS, type Lang } from './lib.ts';

// Settings > Workmanship and cashback (bulk screen): the superadmin edits two rows, applies one value to a filtered set, saves, reloads and sees the saved
// values; a negative value is blocked before anything is sent; a refusal from the backend (an item deleted meanwhile) saves nothing and says so.
// Needs a backend with PATCH /items/fees. Items are seeded through the API (own category, tagged names) and removed at the end of each test.
const GO = '/setup/item-fees';

async function seedItems(tag: string) {
  const api = await apiAs('superadmin');
  const must = (r: { status: number; body: any }) => { if (r.status >= 300) throw new Error(`seed failed ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
  const cat = must(await api('POST', '/categories', { categoryName: `E2E Fees ${tag}`, qrLabel: false }));
  const spec = [['21', 'A'], ['21', 'B'], ['18', 'C'], ['18', 'D']] as const;
  const items: { id: string; nameId: string }[] = [];
  for (const [karat, n] of spec) {
    const it = must(await api('POST', '/items', {
      itemName: `E2E Fee ${tag} ${n}`, isCoded: true, itemType: 'gold', categoryId: cat.id, karat, weight: 5000,
      workmanshipMode: 'per_gram', workmanshipValue: '12.00', cashbackMode: 'per_gram', cashbackValue: '1.00',
    }));
    items.push({ id: it.id, nameId: it.itemNameId });
  }
  const remove = async () => {
    for (const i of items) await api('DELETE', `/items/${i.id}`);
    for (const i of items) await api('DELETE', `/item-names/${i.nameId}`);
    await api('DELETE', `/categories/${cat.id}`);
  };
  return { api, items, remove };
}
const text = (br: any, sel: string, prop = 'textContent'): Promise<string> => br.evaluate((a: string[]) => String((document.querySelector(a[0]) as any)?.[a[1]] ?? ''), [sel, prop]);
const fees = async (api: any, id: string) => { const b = (await api('GET', `/items/${id}`)).body; return `${b.workmanshipValue}/${b.cashbackValue}`; };

for (const lang of LANGS as Lang[]) {
  test(`item fees: edit two rows, bulk on a filtered set, save, reload (${lang})`, { tags: ['e2e', 'item-fees'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const tag = stamp();
    const { api, items, remove } = await seedItems(tag);
    const [A, B, C, D] = items.map((i) => i.id);
    try {
      const seen = await capture(browser, /\/api\/items\/fees/, ['PATCH']);
      await go('superadmin', GO, lang);
      await browser.locator('#fee-q').fill(tag);
      await expect.poll(() => browser.locator('#fees-body tr').count()).toBe(4);
      await shot(`item-fees-${lang}-1-list`);

      // two typed edits: both rows and both cells are marked, the counter says 2, Save is on
      await browser.locator(`#fee-w-${A}`).fill('20');
      await browser.locator(`#fee-c-${B}`).fill('3.5');
      await expect.poll(() => browser.locator('#fees-body tr[data-state=changed]').count()).toBe(2);
      expect(await browser.locator('#fees-body td[data-state=changed]').count()).toBe(2);
      expect((await text(browser, '#fee-save', 'disabled')) === 'false').toBe(true);
      expect((await text(browser, '#fee-count'))).toMatch(lang === 'en' ? /2 changes/ : /تعديلان/);
      await shot(`item-fees-${lang}-2-two-edits`);

      // a negative value is blocked: an error on the cell, Save is off, nothing was sent
      await browser.locator(`#fee-w-${C}`).fill('-5');
      await expect.poll(() => browser.locator(`[data-row="${C}"] .err`).count()).toBe(1);
      expect((await text(browser, '#fee-save', 'disabled')) === 'false').toBe(false);
      expect(seen.length).toBe(0);
      await shot(`item-fees-${lang}-3-negative-blocked`);
      await browser.locator(`#fee-w-${C}`).fill('12.00');   // typing the saved text again drops the edit
      await expect.poll(() => browser.locator('#fees-body .err').count()).toBe(0);

      // bulk: karat 18 narrows to C and D, cashback 7.25 for those
      await browser.locator('#fee-karat-btn').tap();
      await browser.locator('[role=option]:has-text("18")').first().tap();
      await expect.poll(() => browser.locator('#fees-body tr').count()).toBe(2);
      await browser.locator('#fees-bulk [data-f="cashback"]').tap();
      await browser.locator('#fee-bulk-value').fill('7.25');
      await browser.locator('#fee-bulk-apply').tap();
      await expect.poll(() => browser.locator('#fees-body tr[data-state=changed]').count()).toBe(2);
      // clear the karat filter: all four rows are marked changed (A, B typed; C, D bulk)
      await browser.locator('#fee-karat-btn').tap();
      await browser.locator('[role=option]:has-text("18")').first().tap();   // picking the chosen option again clears it
      await expect.poll(() => browser.locator('#fees-body tr').count()).toBe(4);
      expect(await browser.locator('#fees-body tr[data-state=changed]').count()).toBe(4);
      expect((await text(browser, '#fee-count'))).toMatch(lang === 'en' ? /4 changes/ : /4 تعديلات/);
      await shot(`item-fees-${lang}-4-bulk-applied`);

      // one Save for all four
      await browser.locator('#fee-save').tap();
      await expect.poll(() => text(browser, '#toast')).toMatch(lang === 'en' ? /Saved 4 items/ : /تم حفظ 4 صنف/);   // the success toast
      await expect.poll(() => fees(api, C)).toBe('12.00/7.25');
      expect(await fees(api, A)).toBe('20.00/1.00');
      expect(await fees(api, B)).toBe('12.00/3.50');
      expect(await fees(api, D)).toBe('12.00/7.25');
      expect(seen.length).toBe(1);
      expect(seen[0].body.changes).toHaveLength(4);
      expect(seen[0].body.changes.find((c: any) => c.id === A)).toEqual({ id: A, workmanshipValue: '20.00', cashbackValue: '1.00' });
      await expect.poll(() => browser.locator('#fees-body tr[data-state=changed]').count()).toBe(0);   // the table was reloaded: nothing is marked
      await shot(`item-fees-${lang}-5-saved`);

      // a reload shows the saved values in the cells
      await go('superadmin', GO, lang);
      await browser.locator('#fee-q').fill(tag);
      await expect.poll(() => browser.locator('#fees-body tr').count()).toBe(4);
      const val = (sel: string) => browser.evaluate((s: string) => (document.querySelector(s) as HTMLInputElement).value, sel);
      expect(await val(`#fee-w-${A}`)).toBe('20.00');
      expect(await val(`#fee-c-${B}`)).toBe('3.50');
      expect(await val(`#fee-c-${D}`)).toBe('7.25');
      await shot(`item-fees-${lang}-6-reloaded`);
    } finally { await remove(); }
  });

  // The browser remembers the last list (stale-while-revalidate). On this editable grid the remembered numbers must never be painted into the
  // cells: another user saved a fee since, and the slow reload (a big catalogue is many pages) would show the old value as if it were current.
  test(`item fees: a reload never shows remembered fees from before another user's save (${lang})`, { tags: ['e2e', 'item-fees'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const tag = stamp();
    const { api, items, remove } = await seedItems(tag);
    const A = items[0].id;
    try {
      await go('superadmin', GO, lang);
      await browser.locator('#fee-q').fill(tag);
      await expect.poll(() => browser.locator('#fees-body tr').count()).toBe(4);
      await expect.poll(() => browser.evaluate((id: string) => String(localStorage.getItem('ge-erp:query')?.includes(id)), A)).toBe('true');   // the list is remembered (written after 1 s)
      const saved = await api('PATCH', '/items/fees', { changes: [{ id: A, workmanshipValue: '20.00', cashbackValue: '1.00' }] });   // someone else saves
      expect(saved.status).toBeLessThan(300);
      await browser.route(/\/api\/items\?/, async (route: any) => { if (new URL(route.request.url).searchParams.get('page') === '1') await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });   // the first page of the list takes 3 s
      await go('superadmin', GO, lang);
      await browser.evaluate((id: string) => {
        const w = window as any; w.__seen = [];
        setInterval(() => { const v = (document.querySelector(`#fee-w-${id}`) as HTMLInputElement | null)?.value; if (v !== undefined) w.__seen.push(v); }, 50);
      }, A);
      await expect.poll(() => browser.evaluate((id: string) => (document.querySelector(`#fee-w-${id}`) as HTMLInputElement | null)?.value ?? '', A), { timeout: 30_000 }).toBe('20.00');
      expect(await browser.evaluate(() => JSON.stringify([...new Set((window as any).__seen)]))).toBe('["20.00"]');   // never the remembered 12.00
      await browser.locator('#fee-q').fill(tag);
      await expect.poll(() => browser.locator('#fees-body tr').count()).toBe(4);
      await shot(`item-fees-${lang}-8-fresh-after-reload`);
    } finally { await remove(); }
  });

  test(`item fees: a refusal from the backend saves nothing and is said (${lang})`, { tags: ['e2e', 'item-fees'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const tag = stamp();
    const { api, items, remove } = await seedItems(tag);
    const [A, B] = items.map((i) => i.id);
    try {
      await go('superadmin', GO, lang);
      await browser.locator('#fee-q').fill(tag);
      await expect.poll(() => browser.locator('#fees-body tr').count()).toBe(4);
      await browser.locator(`#fee-w-${A}`).fill('30');
      await browser.locator(`#fee-w-${B}`).fill('31');
      expect((await api('DELETE', `/items/${B}`)).status).toBeLessThan(300);   // deleted by someone else meanwhile
      await browser.locator('#fee-save').tap();
      await expect.poll(() => text(browser, '#toast')).toMatch(lang === 'en' ? /Nothing was saved/ : /لم يُحفظ شيء/);
      expect(await text(browser, '#toast', 'className')).toContain('error');
      expect(await fees(api, A)).toBe('12.00/1.00');                            // the whole save was refused: A is unchanged too
      expect(await browser.locator('#fees-body tr[data-state=changed]').count()).toBe(2);   // the edits stay for another try
      await shot(`item-fees-${lang}-7-refused`);
    } finally { await remove(); }
  });
}
