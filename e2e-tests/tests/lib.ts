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
// opts.bars (the sales desk): the owner's no-stretched-bar rule, see check 7. Other screens still have a full-width sticky .formbar, so it is opt-in until they are moved.
export async function layoutAudit(browser: any, root = 'body', opts: { bars?: boolean; scroll?: boolean } = {}): Promise<string[]> {
  return (await browser.evaluate((rootSel: string, withBars: boolean, withScroll: boolean) => {
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
        const a = text(th.querySelector('.th-label') ?? th), b = text(cell); // a sort header: the label, not its arrow
        const hdrEnd = Math.abs((rtl ? a.left : a.right) - (rtl ? b.left : b.right)) <= 2, hdrStart = Math.abs((rtl ? a.right : a.left) - (rtl ? b.right : b.left)) <= 2;
        if (!hdrEnd && !hdrStart) { const tr = R(th), cr = R(cell), tcs = getComputedStyle(th), ccs = getComputedStyle(cell); out.push(`table column not aligned: "${(th.textContent ?? '').trim().slice(0, 18)}" header text x=${Math.round(a.left)}..${Math.round(a.right)} (box ${Math.round(tr.left)}..${Math.round(tr.right)}, ${tcs.textAlign}/${tcs.direction}) cell text x=${Math.round(b.left)}..${Math.round(b.right)} (box ${Math.round(cr.left)}..${Math.round(cr.right)}, ${ccs.textAlign}/${ccs.direction}, ${cell.tagName}.${cell.className})`); }
      }
    }
    // 6 size scale (globals.css :root --fs-*/--h-*; the sales desk follows it too): the real sizes must equal the variables, desktop and phone
    const v = (n: string) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n));
    const S = { fsBase: v('--fs-base'), fsTable: v('--fs-table'), fsTitle: v('--fs-title'), field: v('--h-field'), btn: v('--h-btn'), btnSm: v('--h-btn-sm'), row: v('--h-row'), th: v('--h-th') };
    const shown = (e: Element) => { const r = R(e); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const fsz = (e: Element) => parseFloat(getComputedStyle(e).fontSize), off = (a: number, b: number) => Math.abs(a - b) > 0.6;
    const scale = (sel: string, label: string, hLo: number, hHi: number, fs?: number) => {
      for (const e of Array.from(base.querySelectorAll(sel)).filter(shown)) {
        const h = R(e).height;
        if (h < hLo - 0.6 || h > hHi + 0.6) out.push(`size scale: ${label} height ${Math.round(h * 10) / 10}px (css ${getComputedStyle(e).height}), scale ${hLo}..${hHi}px: ${name(e)} in ${e.closest("table")?.id ?? ""}`);
        if (fs !== undefined && off(fsz(e), fs)) out.push(`size scale: ${label} font ${fsz(e)}px, scale ${fs}px: ${name(e)}`);
      }
    };
    scale('h1', 'title', 0, 99, S.fsTitle);
    scale('.field input:not([type=checkbox]):not([type=radio]):not([type=hidden]), .field select, .sel-btn', 'field', S.field, S.field, S.fsBase);
    scale('.btn', 'button', S.btnSm, S.btn);
    scale('.table th', 'table head', S.th, S.th);
    scale('.table td', 'table cell', S.row, 999, S.fsTable); // a cell that wraps may grow, never shrink
    // any other text bigger than the base size (title, logo, the home price figure and the scan board's hero numbers excepted) is a stray size
    const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT); const stray = new Set<string>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement; if (!p || !(n.nodeValue ?? '').trim() || !shown(p) || p.closest('h1, .price, .brand, .sc-tile-n, .sc-last-code, .tk-n')) continue;
      if (fsz(p) > S.fsBase + 0.6) stray.add(`${name(p)} ${fsz(p)}px "${(n.nodeValue ?? "").trim().slice(0, 20)}" in ${p.parentElement ? name(p.parentElement) : ""}`);
    }
    for (const s of Array.from(stray).slice(0, 5)) out.push(`size scale: text bigger than ${S.fsBase}px: ${s}`);
    // 7 (opt-in) bars and buttons hug their content, never the container (owner rule 2026-11-06). On desktop a fixed or sticky element holding 1 to 3 buttons and no table is narrower than 520 px;
    // a button, or a bar / dock / actions strip, wider than 4x the width of what it holds (and wider than 160 / 300 px) is stretched.
    if (withBars) {
      const desktop = window.innerWidth > 700;
      const count = (e: Element) => e.querySelectorAll('button, .btn').length;
      for (const e of Array.from(base.querySelectorAll('*'))) {
        const cs = getComputedStyle(e), w = R(e).width;
        if (cs.display === 'none' || !w) continue;
        if (desktop && (cs.position === 'fixed' || cs.position === 'sticky') && !e.querySelector('table') && count(e) >= 1 && count(e) <= 3 && w >= 520) out.push(`pinned bar stretched: ${name(e)} ${Math.round(w)}px with ${count(e)} buttons`);
        if (e.matches('button, .btn')) {
          const rg = document.createRange(); rg.selectNodeContents(e);
          const cw = rg.getBoundingClientRect().width;
          if (w > 160 && w > 4 * cw) out.push(`button stretched: ${name(e)} ${Math.round(w)}px for ${Math.round(cw)}px of content`);
        }
        if (/(^|[\s_-])(formbar|bar|dock|actions|strip)\b/.test(e.getAttribute('class') ?? '') && !e.matches('.seg')) {
          const kids = Array.from(e.children).map(R).filter((r) => r.width > 0);
          if (!kids.length) continue;
          const extent = Math.max(...kids.map((r) => r.right)) - Math.min(...kids.map((r) => r.left));
          if (w > 300 && w > 4 * extent) out.push(`bar stretched: ${name(e)} ${Math.round(w)}px for ${Math.round(extent)}px of content`);
        }
      }
    }
    // 8 (opt-in, opts.scroll) ONE vertical scroll per screen (owner rule 2026-11-07): the work area (.ws / the page) is the only vertical scroller on content.
    // A content element that really scrolls vertically (or is capped with a max-height + overflow) inside the page, or inside another scroller, is a nested scroll.
    // Exempt, with reasons: the side nav (its own column), a modal sheet / dialog body (scrolls its own body when taller than the screen), popup lists (overlays; open one is the only scrollable thing).
    // Tables scroll horizontally only: a table wrapper that scrolls vertically is flagged too.
    if (withScroll) {
      const EXEMPT = 'aside, nav, .sheet, dialog, [role=dialog], .sel-pop, .usearch-pop, .notif, .pal-list';
      const sc = (e: Element, y = true) => { const cs = getComputedStyle(e); return /auto|scroll|overlay/.test(y ? cs.overflowY : cs.overflowX); };
      for (const e of Array.from(base.querySelectorAll('*'))) {
        if (e.closest(EXEMPT) || !shown(e) || e.matches('html, body') ) continue;
        const cs = getComputedStyle(e);
        const scrolls = sc(e) && e.scrollHeight > e.clientHeight + 1;
        const capped = sc(e) && cs.maxHeight !== 'none' && !e.matches('.ws');
        if (scrolls || capped) {
          const outer = e.parentElement?.closest('.ws, [class]') ?? null;
          let a: Element | null = e.parentElement; let inside = false;
          while (a && a !== document.body) { if (a.matches('.ws') || (sc(a) && a.scrollHeight > a.clientHeight + 1)) { inside = true; break; } a = a.parentElement; }
          void outer;
          if (inside || capped) out.push(`nested scroll: ${name(e)} ${scrolls ? 'scrolls' : 'is capped'} (scrollHeight ${e.scrollHeight}, clientHeight ${e.clientHeight}, max-height ${cs.maxHeight}) inside ${a ? name(a) : 'the page'}`);
        }
      }
    }
    // 7 sortable tables: every header with a title is a sort button (aria-sort + a real <button>) or declared non-sortable; none is a dead title
    for (const th of Array.from(base.querySelectorAll('table th')).filter(shown)) {
      const t = (th.textContent ?? '').trim(), st = (th as HTMLElement).dataset.sort;
      if (st === 'on') {
        const b = th.querySelector('button.th-sort'), a = th.getAttribute('aria-sort');
        if (!b) out.push(`sort header without a button: "${t.slice(0, 18)}"`);
        if (a !== 'ascending' && a !== 'descending' && a !== 'none') out.push(`sort header without aria-sort: "${t.slice(0, 18)}"`);
        const svg = th.querySelector('.sort-arrow'); const w = svg ? R(svg).width : 0;
        if (!svg || w < 11 || w > 14.5) out.push(`sort arrow size ${w}px: "${t.slice(0, 18)}"`);
        const bb = b ? R(b) : null, tb = R(th);
        if (bb && (bb.right > tb.right + 1 || bb.left < tb.left - 1)) out.push(`sort button wider than its header: "${t.slice(0, 18)}"`);
        const lbl = th.querySelector('.th-label'); if (lbl && R(lbl).height > fsz(lbl) * 2.2) out.push(`sort label wraps: "${t.slice(0, 18)}"`);
      } else if (t && st !== 'off') out.push(`dead table header (not sortable, not declared): "${t.slice(0, 18)}" in ${th.closest('table')?.id || name(th.closest('table') ?? th)}`);
    }
    return out;
  }, root, Boolean(opts.bars), Boolean(opts.scroll))) as string[];
}
