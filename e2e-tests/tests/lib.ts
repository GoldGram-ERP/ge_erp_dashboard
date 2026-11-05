import { test as base } from '@e2e-dev/web';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
  const once = async () => {
    const r = await fetch(`${API}/access/sign-in`, { method: 'POST', headers: H, body: JSON.stringify({ email: `${username}@example.com`, password }) });
    const raw = r.headers.get('set-cookie')?.split(';')[0] ?? '';
    const i = raw.indexOf('=');
    return { status: r.status, name: raw.slice(0, i), value: raw.slice(i + 1), cookie: raw };
  };
  // A 200 with no cookie (a rare answer under load) made the browser refuse the empty cookie ("Invalid cookie fields"): ask once more, no sleep.
  const first = await once();
  return first.status === 200 && first.name ? first : once();
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

/** Today in Cairo (the business day), not the UTC date: they differ between midnight and 2 or 3 a.m. Cairo time. */
export const cairoDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
export const MAIN_BRANCH = process.env.E2E_MAIN_BRANCH ?? 'a2deabe8-31a9-448e-95e5-04e74efceaee'; // seeded "Main branch" (no admin, so the superadmin can use it)
/** Goods for the gold tests, all through the real API as superadmin; remove() deletes what can be deleted, in order. */
export async function seed(tag = stamp()) {
  const api = await apiAs('superadmin');
  const day = cairoDay();
  const must = async (p: Promise<{ status: number; body: any }>) => { const r = await p; if (r.status >= 300) throw new Error(`seed failed ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
  const cat = await must(api('POST', '/categories', { categoryName: `E2E Cat ${tag}`, qrLabel: false }));
  // the name is typed with the item (the backend adds it to the category), as the item form does
  const itemForm = {
    itemName: `E2E Ring ${tag}`, isCoded: true, itemType: 'gold', categoryId: cat.id, karat: '21', weight: 5000,
    workmanshipMode: 'per_gram', workmanshipValue: '50.00', cashbackMode: 'per_gram', cashbackValue: '0.00',
  };
  const item = await must(api('POST', '/items', itemForm));
  /** Switches the seeded item on or off through the Items edit (the whole form, as the Items screen sends it). */
  const setItemActive = async (isActive: boolean) => { await must(api('PATCH', `/items/${item.id}`, { ...itemForm, isActive })); };
  const name = { id: item.itemNameId as string, itemName: item.itemName as string };
  const inv = await must(api('POST', '/purchase-invoices', { date: day, branchId: MAIN_BRANCH, lines: [{ itemId: item.id, quantity: 4 }] }));
  const coding = await must(api('GET', `/purchase-coding/invoices/${inv.id}`));
  const piece = { tagPrice: 200000, salePrice: 190000 }; // weight and workmanship come from the item (5 g, 50.00 per gram)
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
  return { api, tag, cat, name, item, inv, pieces, created, remove, day, setItemActive };
}

// WCAG 2.2 AA scan with axe-core: the serious and critical violations on the page, as text. Used by a11y.e2e.ts and the flow tests.
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
// Allow-list for third-party false positives. Empty on purpose: every finding so far was ours and was fixed.
const ALLOW: { rule: string; target: RegExp; why: string }[] = [];

type Hit = { id: string; impact: string; targets: string[] };
export async function scan(browser: any): Promise<string[]> {
  await browser.evaluate((src: string) => { (0, eval)(src); return null; }, AXE);
  const hits: Hit[] = await browser.evaluate(() => (globalThis as any).axe
    .run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })
    .then((r: any) => r.violations.map((v: any) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n: any) => n.target.join(' ')) }))));
  return hits
    .filter((h) => h.impact === 'serious' || h.impact === 'critical')
    .flatMap((h) => h.targets.map((t) => ({ id: h.id, impact: h.impact, t })))
    .filter((x) => !ALLOW.some((a) => a.rule === x.id && a.target.test(x.t)))
    .map((x) => `${x.impact} ${x.id} ${x.t}`);
}

// The machine eye of the e2ev "Eyes" mechanism: measures the rendered page and returns one text line per defect (empty = clean).
// Run it on every state a UI test screenshots, on both targets and both languages, and `expect(await layoutAudit(browser, '#root')).toEqual([])`.
export async function layoutAudit(browser: any, root = 'body'): Promise<string[]> {
  return (await browser.evaluate((rootSel: string) => {
    const out: string[] = [];
    const base = document.querySelector(rootSel) ?? document.body;
    const R = (e: Element) => e.getBoundingClientRect();
    const name = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.getAttribute('class') ? '.' + (e.getAttribute('class') ?? '').trim().split(/\s+/).join('.') : ''}`;
    // 1 scroll: a control that scrolls shows a bar
    for (const e of Array.from(base.querySelectorAll('.seg, button, input, select, .sel-btn'))) {
      const cs = getComputedStyle(e);
      if ((/auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) || (/auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1)) out.push(`scrolls: ${name(e)}`);
    }
    // 2 page wider than the screen
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`page wider than the screen: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    // 3 raw native controls left in the browser's default look
    for (const e of Array.from(base.querySelectorAll('input[type=checkbox]:not([role=switch]), input[type=radio], select'))) {
      if (getComputedStyle(e).appearance !== 'none' && !e.closest('[class*=sel], .sel')) out.push(`raw native control: ${name(e)}`);
    }
    // 4 pinned or floating elements that should be in the flow
    for (const e of Array.from(base.querySelectorAll('.wn-kind, .copy-btn, .chk, .field label'))) if (getComputedStyle(e).position === 'fixed') out.push(`position:fixed on ${name(e)}`);
    // 5 table alignment: each header's text starts on the same side as its cells' text
    for (const table of Array.from(base.querySelectorAll('table'))) {
      const head = Array.from(table.querySelectorAll('thead tr:last-child th'));
      const row = table.querySelector('tbody tr');
      if (!row || head.length === 0) continue;
      const cells = Array.from(row.children);
      const rtl = getComputedStyle(table).direction === 'rtl';
      let col = 0;
      for (const th of head) {
        const span = (th as HTMLTableCellElement).colSpan || 1;
        const cell = cells[col]; col += span;
        if (!cell || span !== 1 || !(th.textContent ?? '').trim() || !(cell.textContent ?? '').trim()) continue;
        const text = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
        const a = text(th), b = text(cell);
        const hdrEnd = Math.abs((rtl ? a.left : a.right) - (rtl ? b.left : b.right)) <= 2, hdrStart = Math.abs((rtl ? a.right : a.left) - (rtl ? b.right : b.left)) <= 2;
        if (!hdrEnd && !hdrStart) { const tr = R(th), cr = R(cell), tcs = getComputedStyle(th), ccs = getComputedStyle(cell); out.push(`table column not aligned: "${(th.textContent ?? '').trim().slice(0, 18)}" header text x=${Math.round(a.left)}..${Math.round(a.right)} (box ${Math.round(tr.left)}..${Math.round(tr.right)}, ${tcs.textAlign}/${tcs.direction}) cell text x=${Math.round(b.left)}..${Math.round(b.right)} (box ${Math.round(cr.left)}..${Math.round(cr.right)}, ${ccs.textAlign}/${ccs.direction}, ${cell.tagName}.${cell.className})`); }
      }
    }
    return out;
  }, root)) as string[];
}
