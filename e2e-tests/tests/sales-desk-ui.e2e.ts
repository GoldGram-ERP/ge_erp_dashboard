import { afterAll } from 'e2e';
import { execSync } from 'node:child_process';
import { test, expect, signInApi, apiAs, capture, M, stamp, LANGS, WEB, type Lang } from './lib.ts';

// Sales desk (issue #6) on its OWN local stack: dashboard 3104, backend 8104 (E2E_PORT=3104 E2E_API=http://localhost:8104), seeded by scripts/sales-desk-seed.mjs.
// agent1 (sales agent) saves, edits and sees the lock; agent2 never sees agent1's draft; deskadmin completes with the real pieces.
const PASS = 'Correct-Horse-9', ROOT = 'E2e-Local-Pass-1234';
const made: { id: string; by: string }[] = [];
const sql = (q: string) => execSync(`wsl -d Ubuntu -u postgres -- psql -p 5433 -d ge_erp_sd -tA -c "${q}"`).toString().trim();
const d = (l: Lang, k: string, v?: Record<string, string>) => { let s = M(l, 'gold-sales', `salesDesk.${k}`) as string; for (const [a, b] of Object.entries(v ?? {})) s = s.replace(`{${a}}`, b); return s; };

async function as(user: string, browser: any) {
  const s = await signInApi(user, user === 'superadmin' ? ROOT : PASS);
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
    await browser.locator('#sd #f-customerPhone').fill('٠١٠١٢٣٤٥٦٧٨');
    await browser.locator('#sd #f-customerName').fill(name);
    await browser.locator('#sd #f-nationalId').fill('٢٩٠٠١٠١٠١٢٣٤٥٦');
    await browser.locator('#sd #it0-btn').tap();
    await browser.locator('[role=option]:has-text("Desk chain 18")').first().tap();
    await browser.locator('#sd #iq0').fill('2');
    await browser.locator('#sd [data-addline]').tap();
    await browser.locator('#sd #it1-btn').tap();
    await browser.locator('[role=option]:has-text("Desk ring")').first().tap();
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
    expect(wa.toLowerCase()).not.toContain('agent1');
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
        const phone = window.innerWidth <= 520, root = document.querySelector('#sd')!;
        const max = (sel: string, f = (b: DOMRect) => b.height) => { let r = 0; root.querySelectorAll(sel).forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && b.height) r = Math.max(r, f(b)); }); return Math.round(r * 10) / 10; };
        const save = document.querySelector('#sd-save')?.getBoundingClientRect().height ?? 0;
        return {
          phone, fields: max('input:not([type=hidden]):not([type=checkbox]),select,.sel-btn'), save,
          buttons: Math.max(0, ...Array.from(root.querySelectorAll('button:not(.sel-btn):not(.seg button):not(#sd-save)')).map((e) => e.getBoundingClientRect().height)),
          seg: max('.seg button'), segBox: max('.seg'), icons: max('svg', (b) => Math.max(b.width, b.height)), badges: max('.badge,.card h3'),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          pinned: Array.from(root.querySelectorAll('*')).filter((e) => e.id !== 'sec-save' && !e.closest('#sec-save') && getComputedStyle(e).position === 'fixed').length,
        };
      });
      expect(m.overflow).toBe(0);
      expect(m.pinned).toBe(0);
      expect(m.fields).toBeLessThanOrEqual(m.phone ? 36 : 34);
      expect(m.buttons).toBeLessThanOrEqual(m.phone ? 36 : 34);
      expect(m.save).toBeLessThanOrEqual(m.phone ? 40 : 34);
      expect(m.seg).toBeLessThanOrEqual(30);
      expect(m.segBox).toBeLessThanOrEqual(32);
      expect(m.icons).toBeLessThanOrEqual(m.phone ? 18 : 20);
      expect(m.badges).toBeLessThanOrEqual(22);
    }
  });
}

afterAll(async () => {
  for (const m of made) await (await apiAs(m.by, PASS))('DELETE', `/sales-drafts/${m.id}`).catch(() => {});
});
