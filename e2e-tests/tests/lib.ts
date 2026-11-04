import { test as base } from '@e2e-dev/web';
import { createRequire } from 'node:module';
import { NAV, canOpen } from '../../src/nav/tree.ts';

export { NAV, canOpen };
const require = createRequire(import.meta.url);
export const WEB = 'http://localhost:3100';
export const API = 'http://localhost:8100';
export const PASSWORD = 'E2e-Local-Pass-1234'; // local test accounts only (seeded by scripts/seed-users.mjs)
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
