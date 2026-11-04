import { test as base } from '@e2e-dev/web';
import { createRequire } from 'node:module';
import { NAV, canOpen } from '../../src/nav/tree.ts';

export { NAV, canOpen };
const require = createRequire(import.meta.url);
export const WEB = `http://localhost:${process.env.E2E_PORT ?? '3100'}`;
export const API = process.env.E2E_API ?? 'http://localhost:8100';
export const PASSWORD = process.env.E2E_PASSWORD ?? 'E2e-Local-Pass-1234'; // local test accounts only (seeded by scripts/seed-users.mjs)
export type Role = 'superadmin' | 'e2eadmin' | 'e2euser';
export type Lang = 'ar' | 'en';
export const LANGS: Lang[] = ['ar', 'en'];
export const msgs = { ar: require('../../messages/ar.json'), en: require('../../messages/en.json') } as Record<Lang, any>;
/** Message by dotted path, e.g. M('en','bank-accounts','banks.title'). */
export const M = (l: Lang, ns: string, key: string): string => key.split('.').reduce((o: any, k) => o?.[k], msgs[l][ns]);
// Words the engine hardcodes with L(ar, en)
export const W = {
  save: { ar: 'حفظ', en: 'Save' }, cancel: { ar: 'إلغاء', en: 'Cancel' },
  del: { ar: 'حذف', en: 'Delete' }, edit: { ar: 'تعديل', en: 'Edit' },
};
export const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const H = { 'content-type': 'application/json', origin: WEB };

export async function signInApi(username: string, password = PASSWORD) {
  const r = await fetch(`${API}/access/sign-in`, { method: 'POST', headers: H, body: JSON.stringify({ email: `${username}@example.com`, password }) });
  const raw = r.headers.get('set-cookie')?.split(';')[0] ?? '';
  const i = raw.indexOf('=');
  return { status: r.status, name: raw.slice(0, i), value: raw.slice(i + 1), cookie: raw };
}
/** Direct backend call as a role (for setup, cleanup and API-level checks). */
export async function apiAs(username: string, password = PASSWORD) {
  const s = await signInApi(username, password);
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(API + path, { method, headers: { ...H, cookie: s.cookie, 'idempotency-key': crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : undefined };
  };
}

export const test = base.extend<{
  /** Sets the session cookie for a role through POST /access/sign-in (fast), then opens /<lang><path>. */
  go: (role: Role, path: string, lang?: Lang) => Promise<void>;
  /** Screenshot with a label. */
  shot: (label: string) => Promise<void>;
}>({
  go: async ({ app, browser }, use) => {
    await use(async (role, path, lang = 'en') => {
      const s = await signInApi(role);
      await browser.setCookies([{ url: WEB, name: s.name, value: s.value, httpOnly: true, sameSite: 'Lax' }]);
      await app.open(`/${lang}${path}`);
    });
  },
  shot: async ({ app }, use) => { await use(async (label) => { await app.screenshot(label); }); },
});
export { expect } from 'e2e';

/** Unlocks a seeded account the sign-in attempts tests may have locked (POST /users/:id/unlock as superadmin). */
export async function unlock(username: string) {
  const api = await apiAs('superadmin');
  const list = await api('GET', '/users');
  const u = list.body.items.find((x: any) => x.username === username);
  if (u?.locked) await api('POST', `/users/${u.id}/unlock`);
}

/** Records the JSON bodies of the browser's requests whose url matches (network capture); the request still goes on. */
export async function capture(browser: any, re: RegExp, methods = ['POST', 'PATCH', 'DELETE', 'PUT']) {
  const seen: { method: string; url: string; body: any }[] = [];
  await browser.route(re, async (route: any) => {
    const r = route.request;
    if (methods.includes(r.method)) seen.push({ method: r.method, url: r.url, body: r.postData ? JSON.parse(r.postData) : undefined });
    await route.continue();
  });
  return seen;
}

export const MAIN_BRANCH = process.env.E2E_MAIN_BRANCH ?? 'a2deabe8-31a9-448e-95e5-04e74efceaee'; // seeded "Main branch" (no admin, so the superadmin can use it)
/** Goods for the gold tests, all through the real API as superadmin; remove() deletes what can be deleted, in order. */
export async function seed(tag = stamp()) {
  const api = await apiAs('superadmin');
  const day = new Date().toISOString().slice(0, 10);
  const must = async (p: Promise<{ status: number; body: any }>) => { const r = await p; if (r.status >= 300) throw new Error(`seed failed ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
  const cat = await must(api('POST', '/categories', { categoryName: `E2E Cat ${tag}`, qrLabel: false }));
  // the name is typed with the item (the backend adds it to the category), as the item form does
  const item = await must(api('POST', '/items', {
    itemName: `E2E Ring ${tag}`, isCoded: true, itemType: 'gold', categoryId: cat.id, karat: '21', weight: 5000,
    workmanshipMode: 'per_gram', workmanshipValue: '50.00', cashbackMode: 'per_gram', cashbackValue: '0.00',
  }));
  const name = { id: item.itemNameId as string, itemName: item.itemName as string };
  const inv = await must(api('POST', '/purchase-invoices', { date: day, branchId: MAIN_BRANCH, lines: [{ itemId: item.id, quantity: 4, weight: 20000 }] }));
  const coding = await must(api('GET', `/purchase-coding/invoices/${inv.id}`));
  const piece = { weight: 5000, makingChargePerGram: 5000, tagPrice: 200000, salePrice: 190000 };
  await must(api('POST', `/purchase-coding/invoices/${inv.id}`, { lines: [{ lineId: coding.lines[0].lineId, pieces: [piece, piece, piece, piece] }] }));
  const pieces = (await must(api('GET', `/pieces?invoiceId=${inv.id}`))).items as { id: string; pieceCode: string }[];
  const created = { invoices: [] as string[], returns: [] as string[], reservations: [] as string[], counts: [] as string[] };
  const remove = async () => {
    for (const id of created.counts) await api('DELETE', `/stock-counts/${id}`);
    for (const id of created.returns) await api('DELETE', `/returns/${id}`);
    for (const id of created.invoices) await api('DELETE', `/sales-invoices/${id}`);
    for (const id of created.reservations) await api('DELETE', `/reservations/${id}`);
    await api('DELETE', `/purchase-invoices/${inv.id}`); // refused (invoiceCoded) once coded: reported as a leftover
    await api('DELETE', `/items/${item.id}`); await api('DELETE', `/item-names/${name.id}`); await api('DELETE', `/categories/${cat.id}`);
  };
  return { api, tag, cat, name, item, inv, pieces, created, remove, day };
}
