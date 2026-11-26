import { afterAll } from 'e2e';
import { execSync, execFileSync } from 'node:child_process';
import { test, expect, signInApi, apiAs, capture, M, stamp, LANGS, WEB, layoutAudit, type Lang } from './lib.ts';

// Sales desk (issue #6) on its OWN local stack: dashboard 3104, backend 8104 (E2E_PORT=3104 E2E_API=http://localhost:8104), seeded by scripts/sales-desk-seed.mjs.
// agent1 (sales agent) saves, edits and sees the lock; agent2 never sees agent1's draft; deskadmin completes with the real pieces.
const PASS = 'Correct-Horse-9', ROOT = 'E2e-Local-Pass-1234';
const made: { id: string; by: string }[] = [];
// The test database: E2E_DB_URL (native Postgres) when set, else the old WSL one.
const sql = (q: string) => (process.env.E2E_DB_URL
  ? execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe', [process.env.E2E_DB_URL, '-tA', '-c', q], { windowsHide: true }).toString().trim()
  : execSync(`wsl -d Ubuntu -u postgres -- psql -p 5433 -d ge_erp_sd -tA -c "${q}"`, { windowsHide: true }).toString().trim());
const d = (l: Lang, k: string, v?: Record<string, string>) => { let s = M(l, 'gold-sales', `salesDesk.${k}`) as string; for (const [a, b] of Object.entries(v ?? {})) s = s.replace(`{${a}}`, b); return s; };

async function as(user: string, browser: any) {
  const s = await signInApi(user, user === 'superadmin' ? (process.env.E2E_PASSWORD ?? ROOT) : PASS);
  await browser.setCookies([{ url: WEB, name: s.name, value: s.value, httpOnly: true, sameSite: 'Lax' }]);
}
const ringId = async () => (await (await apiAs('superadmin', ROOT))('GET', '/items?search=Desk%20ring')).body.items.find((i: any) => i.itemName === 'Desk ring').id as string;
async function draftBy(user: string, name: string, qty = 1) {
  const api = await apiAs(user, PASS);
  const r = await api('POST', '/sales-drafts', { invoiceType: 'sale', customerName: name, customerPhone: '01099887766', lines: [{ itemId: await ringId(), quantity: qty }] });
  expect(r.status).toBe(201);
  made.push({ id: r.body.id, by: user });
  return r.body;
}

for (const lang of LANGS) {
  test(`sales desk: agent saves, copies the WhatsApp text, edits, then sees it locked (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    const tag = stamp(), name = `Desk E2E ${tag}`;
    await as('agent1', browser);
    const seen = await capture(browser, /\/sales-drafts(\/|\?|$)/, ['POST', 'PUT']);
    await app.open(`/${lang}/sales/desk`);
    await shot(`desk-${lang}-1-list`);
    await app.open(`/${lang}/sales/desk?new=draft`);
    await browser.locator('#sd #sd-customer .disc-head').tap();   // the customer block is a collapsed Disclosure
    await browser.locator('#sd #f-customerPhone').fill('٠١٠١٢٣٤٥٦٧٨');
    await browser.locator('#sd #f-customerName').fill(name);
    await browser.locator('#sd #f-nationalId').fill('٢٩٠٠١٠١٠١٢٣٤٥٦');
    await browser.locator('#sd #itadd-btn').tap();   // the one add-a-piece field: picking an item adds a row with count 1
    await browser.locator('[role=option]:has-text("Desk gold bar 21")').first().tap();
    await browser.locator('#sd #iq0').fill('2');
    await browser.locator('#sd #itadd-btn').tap();
    await browser.locator('[role=option]:has-text("Desk ring")').first().tap();
    await expect(browser.locator('#sd [data-line]')).toHaveCount(2);
    await browser.locator('#sd #sec-payment > .disc-head').tap();   // "Save as draft" is a collapsed Disclosure
    await browser.locator('#sd #f-cash').fill('1000');
    await shot(`desk-${lang}-2-filled`);
    await browser.locator('#sd #sd-save').tap();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ method: 'POST', body: { customerPhone: '01012345678', nationalId: '29001010123456', cash: 100000 } });
    expect(seen[0].body.branchId).toBeUndefined();
    await expect(browser.locator('#sd [data-draft-number]')).toBeVisible();
    const num = await browser.locator('#sd [data-draft-number]').getAttribute('data-draft-number');
    const id = (await (await apiAs('agent1', PASS))('GET', `/sales-drafts?search=${num}`)).body.items.find((x: any) => x.customerName === name)?.id as string;
    made.push({ id, by: 'agent1' });
    await shot(`desk-${lang}-3-saved`);
    const wa = (await browser.evaluate(() => document.querySelector('#wa-text')!.textContent)) as string;
    expect(wa).toContain(name);
    expect(wa).toContain('01012345678');
    expect(wa).toContain('اسم البائع:');   // the seller is in the text now (sales-desk-reference.md section 6)
    await browser.evaluate(() => { (window as any).__copied = ''; navigator.clipboard.writeText = async (t: string) => { (window as any).__copied = t; }; return null; });
    await browser.locator('#sd #sec-wa button').first().tap();
    await expect.poll(() => browser.evaluate(() => (window as any).__copied)).toBe(wa);
    // edit and save again: a PUT with no branchId
    await browser.locator('#sd #iq0').fill('3');
    await browser.locator('#sd #sd-save').tap();
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1]).toMatchObject({ method: 'PUT' });
    expect(seen[1].body.branchId).toBeUndefined();
    expect(seen[1].body.lines[0].quantity).toBe(3);
    await shot(`desk-${lang}-4-edited`);
    // a reload reopens the same draft (the address names it), not an empty form
    await app.open((await browser.evaluate(() => location.pathname + location.search)) as string);
    await expect.poll(() => browser.locator(`#sd [data-draft-number="${num}"]`).count(), { timeout: 30000 }).toBe(1);
    await shot(`desk-${lang}-4b-reloaded`);
    // force the lock: created a day earlier
    sql(`UPDATE sales_draft SET created_at = created_at - interval '1 day' WHERE id='${id}'`);
    await app.open(`/${lang}/sales/desk?q=${encodeURIComponent(name)}`);
    await browser.locator(`text=${name}`).first().tap();
    await expect(browser.locator('#sd #sd-lock')).toBeVisible();
    expect(await browser.locator('#sd #sd-lock').getAttribute('data-lock')).toBe('locked');
    expect(await browser.locator('#sd #sd-save').count()).toBe(0);
    await expect(browser.locator('#sd #sd-delete')).toBeVisible();
    await shot(`desk-${lang}-5-locked`);
  });
}

test('sales desk: another agent cannot read, list or edit the draft (404)', { tags: ['e2e', 'desk'], requires: ['browser'] }, async () => {
  const dr = await draftBy('agent1', `Desk Private ${stamp()}`);
  const a2 = await apiAs('agent2', PASS);
  expect((await a2('GET', `/sales-drafts/${dr.id}`)).status).toBe(404);
  expect((await a2('PUT', `/sales-drafts/${dr.id}`, { customerName: 'x', customerPhone: '01099887766', lines: [{ itemId: await ringId(), quantity: 1 }] })).status).toBe(404);
  const list = (await a2('GET', `/sales-drafts?search=${dr.draftNumber}`)).body.items as any[];
  expect(list.some((x) => x.id === dr.id)).toBe(false);
});

for (const lang of LANGS) {
  test(`sales desk: the desk-only Admin opens it by number, scans the pieces and completes once (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    const dr = await draftBy('agent1', `Desk Complete ${stamp()}`, 2);
    const pieces = ((await (await apiAs('superadmin', ROOT))('GET', '/piece-choices?search=&page=1')).body.items as any[]).filter((p) => p.itemName === 'Desk ring' && !p.sold && !p.inTransfer).slice(0, 2);
    expect(pieces.length).toBe(2);
    const admin = await apiAs('deskadmin', PASS);
    // Price protection: "Customer sent the money" and the accountant's received money (exactly the total) come before Complete.
    await admin('POST', `/sales-drafts/${dr.id}/customer-sent`);
    await admin('PUT', `/sales-drafts/${dr.id}/received`, { payments: [{ method: 'cash', amountPiastres: dr.totals.total }] });
    // one piece for two is refused by the server with the mismatch
    const short = await admin('POST', `/sales-drafts/${dr.id}/complete`, { lines: [{ pieceCode: pieces[0].pieceCode }], cash: 100 });
    expect(short.status).toBe(409);
    expect(short.body.message).toBe('draftItemsMismatch');
    await as('deskadmin', browser);
    await app.open(`/${lang}/sales/desk?new=open`);
    await browser.locator('#sd-open').waitFor?.();
    await browser.locator('#f-draftNumber').fill(String(dr.draftNumber));
    await browser.locator('#sd-open').tap();
    await expect(browser.locator('#sd #sd-need')).toBeVisible();
    await expect(browser.locator('#sd #sd-need')).toContainText(d(lang, 'scanned', { scanned: '0', total: '2' }));
    await browser.locator('#sd #sd-code').fill('99999999');
    await browser.locator('#sd #sd-add').tap();
    await expect(browser.locator('#sd [data-k=pieceCode] [role=alert], #sd [data-k=pieceCode] .err')).toBeVisible();
    await shot(`desk-${lang}-6-wrong-piece`);
    for (const [i, p] of pieces.entries()) { await browser.locator('#sd #sd-code').fill(String(p.pieceCode)); await browser.locator('#sd #sd-add').tap(); await expect(browser.locator('#sd #sd-need')).toContainText(d(lang, 'scanned', { scanned: String(i + 1), total: '2' })); }
    await expect(browser.locator('#sd #sd-need')).toContainText(d(lang, 'scanned', { scanned: '2', total: '2' }));
    await browser.locator('#sd #f-cash').fill(`${Math.trunc(dr.totals.total / 100)}.${String(dr.totals.total % 100).padStart(2, '0')}`);
    await shot(`desk-${lang}-7-scanned`);
    await browser.locator('#sd #sd-complete').tap();
    await expect(browser.locator('#sd #sd-done')).toBeVisible();
    await shot(`desk-${lang}-8-completed`);
    const done = (await admin('GET', `/sales-drafts/${dr.id}`)).body;
    expect(done.status).toBe('completed');
    const again = await admin('POST', `/sales-drafts/${dr.id}/complete`, { lines: pieces.map((p) => ({ pieceCode: p.pieceCode })), cash: dr.totals.total });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('draftCompleted');
    await (await apiAs('superadmin', ROOT))('DELETE', `/sales-invoices/${done.salesInvoiceId}`); // gives the pieces back for the next run
  });
}

// Size and layout (apple-design section 18, e2ev rule 11): small, calm controls on desktop and phone, nothing wider than the screen.
// The phone is never above the desktop by more than 4 px: the caps below are the desktop cap + 4 for the phone, and the same visuals are used.
// the whole desk follows the app-wide small scale.
for (const lang of LANGS) {
  test(`sales desk: controls are small and nothing overflows, new and saved draft (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    await as('agent1', browser);
    const name = `Desk size ${stamp()}`;
    await draftBy('agent1', name);
    for (const path of [`/${lang}/sales/desk?new=draft`, `/${lang}/sales/desk?q=${encodeURIComponent(name)}`]) {
      await app.open(path);
      if (!path.includes('new=draft')) await browser.locator(`text=${name}`).first().tap();
      await expect(browser.locator('#sd #sd-save')).toBeVisible();
      await shot(`desk-${lang}-size-${path.includes('new=draft') ? 'new' : 'saved'}`);
      await expect.poll(() => browser.evaluate(() => !!document.querySelector('#sd #sd-save'))).toBe(true);
      const m = await browser.evaluate(() => {
        const phone = window.innerWidth <= 520;
        const all = (sel: string) => Array.from(document.querySelectorAll(`#sd ${sel}`)).filter((e) => !e.closest('#sd-mobilebar'));
        const max = (sel: string, f = (b: DOMRect) => b.height) => { let r = 0; all(sel).forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && b.height) r = Math.max(r, f(b)); }); return Math.round(r * 10) / 10; };
        const save = document.querySelector('#sd-save')?.getBoundingClientRect().height ?? 0;
        const fieldSel = 'input:not([type=hidden]):not([type=checkbox]),select,.sel-btn', btnSel = 'button:not(.sel-btn):not(.seg button):not(#sd-save)';
        return {
          phone, save, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          fields: max(fieldSel), buttons: max(btnSel), seg: max('.seg button'), icons: max('svg', (b) => Math.max(b.width, b.height)),
          pinned: Array.from(document.querySelectorAll('#sd *')).filter((e) => e.id !== 'sd-mobilebar' && !e.closest('#sd-mobilebar') && getComputedStyle(e).position === 'fixed').length,
        };
      });
      expect(m.overflow).toBe(0);
      expect(m.pinned).toBe(0);
      // the desk follows the app-wide small scale, like every screen (the .desk-ref exemption is gone)
      expect(m.fields).toBeLessThanOrEqual(m.phone ? 36 : 34);
      expect(m.buttons).toBeLessThanOrEqual(m.phone ? 36 : 34);
      expect(m.save).toBeLessThanOrEqual(36);
      expect(m.seg).toBeLessThanOrEqual(30);
      expect(m.icons).toBeLessThanOrEqual(m.phone ? 18 : 20);
    }
  });
}

afterAll(async () => {
  for (const m of made) await (await apiAs(m.by, PASS))('DELETE', `/sales-drafts/${m.id}`).catch(() => {});
});

// Layout, not only presence (e2ev "Ship nothing broken"): no control scrolls, a row's labels and controls line up, and sizes stay on the apple-design scale.
for (const lang of LANGS) {
  test(`sales desk layout: no scrollbar on a control, count and price aligned, sizes on the scale (${lang})`, { tags: ['e2e', 'desk', 'layout'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    await as('superadmin', browser);
    await app.open(`/${lang}/sales/desk?new=draft`);
    await browser.locator('#sd #itadd-btn').tap();
    await browser.locator('[role=option]:has-text("Desk gold bar 21")').first().tap();
    await browser.locator('#sd [data-line="0"]').waitFor();
    await shot(`desk-${lang}-layout`);
    const r = await browser.evaluate(() => {
      const rect = (e: Element) => e.getBoundingClientRect();
      const segs = Array.from(document.querySelectorAll('#sd .seg')).map((e) => { const cs = getComputedStyle(e); return { scrollX: /auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1, scrollY: /auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1 }; });
      const row = document.querySelector('#sd [data-line="0"] .tk-in')!;
      const kids = Array.from(row.children).filter((e) => !e.classList.contains('tk-item') || window.innerWidth > 700).map((e) => rect(e));   // on a phone the item name takes its own line
      const rowTopDiff = Math.max(...kids.map((k) => Math.abs((k.top + k.height / 2) - (kids[0].top + kids[0].height / 2))));
      const outDesk = (sel: string) => Array.from(document.querySelectorAll(`#sd ${sel}`)).filter((e) => !e.closest('#sd-mobilebar'));
      const tall = (els: Element[], max: number) => els.filter((e) => rect(e).height > max).map((e) => `${e.tagName.toLowerCase()}.${(e.getAttribute('class') ?? '').replace(/ /g, '.')}#${e.id}:${Math.round(rect(e).height)}`);
      const fieldSel = '.field input:not([type=checkbox]):not([type=radio]), .sel-btn', btnSel = '.seg button, .btn:not(.primary)';
      return { segs, rowTopDiff, fields: tall(outDesk(fieldSel), 36), buttons: tall(outDesk(btnSel), 36),
        wide: Array.from(document.querySelectorAll('#sd .sel-btn')).filter((e) => rect(e).width > 700).map((e) => e.id), pageWide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    }) as { segs: { scrollX: boolean; scrollY: boolean }[]; rowTopDiff: number; fields: string[]; buttons: string[]; wide: string[]; pageWide: boolean };
    expect(r.segs.length).toBeGreaterThan(0);
    for (const s of r.segs) expect(s).toEqual({ scrollX: false, scrollY: false });
    expect(r.rowTopDiff, 'item, count and remove centred on one line').toBeLessThanOrEqual(1);
    expect(r.fields, 'fields/selects outside the desk columns above 36px').toEqual([]);
    expect(r.buttons, 'buttons/tabs outside the desk columns above 36px').toEqual([]);
    expect(r.wide, 'dropdowns wider than 700px (stretch slop)').toEqual([]);
    expect(r.pageWide).toBe(false);
    expect(await layoutAudit(browser, '#sd', { bars: true }), 'layoutAudit').toEqual([]);
  });
}

// Issue #25: the Complete card is for the Admin and the Super admin; a plain User never sees it (the backend refuses a User with 403 notAllowed too).
for (const lang of LANGS) {
  test(`sales desk: a plain User never sees the Complete invoice card, an Admin does (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser }) => {
    const dr = await draftBy('agent1', `Desk Gate ${stamp()}`);
    await as('agent1', browser);
    await app.open(`/${lang}/sales/desk?new=draft&open=${dr.id}`);
    await browser.locator('#sd').first().waitFor({ timeout: 25_000 });
    await browser.locator('#sd-lock, #f-customerName').first().waitFor({ timeout: 25_000 });
    expect(await browser.locator('#sd-complete').count()).toBe(0);
    expect(await browser.locator('#sec-complete').count()).toBe(0);
    await as('deskadmin', browser);
    await app.open(`/${lang}/sales/desk?new=draft&open=${dr.id}`);
    await browser.locator('#sd-complete').first().waitFor({ timeout: 25_000 });
    expect(await browser.locator('#sec-complete').count()).toBe(1);
  });
}

// Issue #26: the white pill of a segmented control stays on the pressed button (it stuck out of the second payment method control after the labels changed).
for (const lang of LANGS) {
  test(`sales desk: the pill of the second payment method stays inside the control after the first method changes (${lang})`, { tags: ['e2e', 'desk', 'layout'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    await as('agent1', browser);
    await app.open(`/${lang}/sales/desk?new=draft`);
    await browser.locator('[data-pay2="none"]').first().waitFor({ timeout: 25_000 });
    const pill = () => browser.evaluate(() => {
      const on = document.querySelector('[data-pay2][aria-pressed="true"]') as HTMLElement | null, seg = on?.closest('.seg') as HTMLElement | null, th = seg?.querySelector('.thumb') as HTMLElement | null;
      if (!on || !seg || !th) return { ok: false, why: 'missing' };
      const a = th.getBoundingClientRect(), b = on.getBoundingClientRect(), s = seg.getBoundingClientRect();
      return { ok: a.left >= s.left - 1 && a.right <= s.right + 1 && Math.abs(a.left - b.left) <= 2 && Math.abs(a.width - b.width) <= 2, why: JSON.stringify({ a: [a.left, a.right], b: [b.left, b.right], s: [s.left, s.right] }) };
    });
    expect(await pill()).toMatchObject({ ok: true });
    for (const first of ['cash', 'instapay', 'bank', 'visa']) {
      const btn = browser.locator(`[data-pay="${first}"]`);
      if (await btn.count()) { await btn.first().tap(); await new Promise((r) => setTimeout(r, 400)); expect(await pill(), `first method ${first}`).toMatchObject({ ok: true }); }
    }
    await shot(`desk-pill-${lang}`);
  });
}
