import { afterAll } from 'e2e';
import { test, expect, signInApi, apiAs, capture, M, stamp, LANGS, WEB, layoutAudit, type Lang } from './lib.ts';

// The Sales desk keeps its choices in the draft (backend 0.1.22): Sell or Buy, gold or silver, wrapping, the percent discount, typed prices and the payment methods with their split.
// A draft saved from the desk comes back EXACTLY as it was, with the totals of POST /sales-desk/quote; a Buy draft is saved but never completed.
// Seeded like sales-desk-quote-ui (agent1 with the cash discount permission, agent2 without, deskadmin an Admin; "Desk gold bar 21" 10 g, "Desk silver 999").
const PASS = 'Correct-Horse-9';
const made: { id: string; by: string }[] = [];
const d = (l: Lang, k: string) => M(l, 'gold-sales', `salesDesk.${k}`) as string;
const money = (piastres: number) => (piastres / 100).toFixed(2);

async function as(user: string, browser: any) {
  const s = await signInApi(user, PASS);
  await browser.setCookies([{ url: WEB, name: s.name, value: s.value, httpOnly: true, sameSite: 'Lax' }]);
}
const itemId = async (name: string) => (await (await apiAs('superadmin'))('GET', `/items?search=${encodeURIComponent(name)}`)).body.items.find((i: any) => i.itemName === name).id as string;
const total = async (browser: any) => ((await browser.locator('#sd-total').count()) ? (((await browser.locator('#sd-total').textContent()) as string) ?? '') : '').replace(/,/g, '').trim();
const pressed = async (browser: any, sel: string) => ((await browser.locator(sel).count()) ? await browser.locator(sel).getAttribute('aria-pressed') : null);
const value = (browser: any, sel: string) => browser.evaluate((s: string) => (document.querySelector(s) as HTMLInputElement | null)?.value ?? null, sel);
/** POST /sales-desk/quote for what a draft says (the same inputs), as the agent. */
async function quoteOf(draft: any, user = 'agent1') {
  const body = {
    operation: draft.operation, metal: draft.metal, payment: draft.paymentMethods?.[0]?.method ?? (draft.payByVisa ? 'visa' : 'cash'),
    ...(draft.discountPercent ? { discountPercent: draft.discountPercent } : {}),
    ...(draft.manualSellPrice && draft.operation === 'sell' ? { manualSellPrice: draft.manualSellPrice } : {}), ...(draft.manualBuyPrice && draft.operation === 'buy' ? { manualBuyPrice: draft.manualBuyPrice } : {}),
    lines: draft.lines.map((l: any) => ({ itemId: l.itemId, quantity: l.quantity, ...(l.wrapping ? { wrapping: l.wrapping } : {}) })),
  };
  const r = await (await apiAs(user, PASS))('POST', '/sales-desk/quote', body);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as { totalPiastres: number };
}

/** Opens a new draft page as agent1 and adds one item (the gold bar, or the silver piece after the metal is switched). */
async function startDraft(app: any, browser: any, lang: Lang, user = 'agent1') {
  await as(user, browser);
  await app.open(`/${lang}/sales/desk?new=draft`);
  await expect.poll(() => browser.locator('#sd-total').count(), { timeout: 60000 }).toBe(1);
}
async function addItem(browser: any, name: string) {
  await expect.poll(async () => { await browser.locator('#itadd-btn').tap(); return browser.locator(`[role=option]:has-text("${name}")`).count(); }, { timeout: 30000 }).toBeGreaterThan(0);
  await browser.locator(`[role=option]:has-text("${name}")`).first().tap();
  await browser.locator('#sd [data-line="0"]').waitFor();
}
async function fillCustomer(browser: any, name: string) {
  await browser.locator('#sd #sd-customer .disc-head').tap();
  await browser.locator('#sd #f-customerPhone').fill('01012345678');
  await browser.locator('#sd #f-customerName').fill(name);
}
/** Saves and returns the saved draft as the API has it. */
async function saveDraft(browser: any, seen: any[], user = 'agent1') {
  const before = seen.length;
  await browser.locator('#sd #sd-save').tap();
  await expect.poll(() => seen.length).toBe(before + 1);
  await expect(browser.locator('#sd [data-draft-number]')).toBeVisible();
  const num = await browser.locator('#sd [data-draft-number]').getAttribute('data-draft-number');
  const found = (await (await apiAs(user, PASS))('GET', `/sales-drafts?search=${num}`)).body.items[0];
  made.push({ id: found.id, by: user });
  return found;
}
async function reopen(app: any, browser: any, lang: Lang, id: string) {
  await app.open(`/${lang}/sales/desk?new=draft&open=${id}`);
  await expect.poll(() => browser.locator('#sd [data-draft-number]').count(), { timeout: 60000 }).toBe(1);
}
/** The reopened draft shows the quote's total for the same inputs (and the draft's own total is the same number). */
async function totalsMatch(browser: any, draft: any) {
  const q = await quoteOf(draft);
  expect(draft.totals.total).toBe(q.totalPiastres);
  await expect.poll(() => total(browser), { timeout: 30000 }).toBe(money(q.totalPiastres));
}

type Case = {
  id: string; metal?: 'silver'; item: string;
  set: (b: any, lang: Lang) => Promise<void>;
  body: (b: any, totalPiastres: number) => void;
  restored: (b: any, lang: Lang, draft: any) => Promise<void>;
};
const CASES: Case[] = [
  { id: 'silver', metal: 'silver', item: 'Desk silver 999',
    set: async (b) => { await b.locator('[data-wrap="unwrapped"]').tap(); },
    body: (b) => { expect(b).toMatchObject({ operation: 'sell', metal: 'silver' }); expect(b.lines[0].wrapping).toBe('unwrapped'); },
    restored: async (b, _l, draft) => {
      expect(draft).toMatchObject({ operation: 'sell', metal: 'silver' });
      await expect.poll(() => pressed(b, '[data-metal="silver"]')).toBe('true');
      await expect.poll(() => pressed(b, '[data-wrap="unwrapped"]')).toBe('true');
      expect(await pressed(b, '[data-wrap="wrapped"]')).toBe('false');
    } },
  { id: 'buy', item: 'Desk gold bar 21',
    set: async (b) => { await b.locator('[data-op="buy"]').tap(); await b.locator('[data-pay="bank_transfer"]').tap(); },
    body: (b) => { expect(b).toMatchObject({ operation: 'buy', metal: 'gold' }); expect(b.paymentMethods[0].method).toBe('bank_transfer'); expect(b.discountPercent).toBeUndefined(); expect(b.cashDiscount).toBeUndefined(); },
    restored: async (b, lang, draft) => {
      expect(draft).toMatchObject({ operation: 'buy', metal: 'gold', status: 'open' });
      await expect.poll(() => pressed(b, '[data-op="buy"]')).toBe('true');
      expect(await pressed(b, '[data-pay="bank_transfer"]')).toBe('true');
      await expect(b.locator('#sd #sd-buynote')).toBeVisible();
      await expect(b.locator('#sd #sd-buynote')).toContainText(d(lang, 'buyQuoteNote'));
      await expect(b.locator('#sd #sd-save')).toBeVisible();
    } },
  { id: 'discount10', item: 'Desk gold bar 21',
    set: async (b) => { await b.locator('[data-disc="10"]').tap(); },
    body: (b) => { expect(b.discountPercent).toBe(10); expect(b.cashDiscount).toBeUndefined(); },
    restored: async (b, _l, draft) => {
      expect(draft.discountPercent).toBe(10);
      await expect.poll(() => pressed(b, '[data-disc="10"]')).toBe('true');
      expect(await pressed(b, '[data-disc="0"]')).toBe('false');
      expect(draft.totals.discount).toBeGreaterThan(0);
    } },
  { id: 'manual', item: 'Desk gold bar 21',
    set: async (b) => { await b.locator('#sd-typeprice').tap(); await b.locator('#f-manualsell').fill('6255.5'); },
    body: (b) => { expect(b.manualSellPrice).toBe('6255.5'); },
    restored: async (b, lang, draft) => {
      expect(draft.manualSellPrice).toBe('6255.50');
      await expect.poll(() => value(b, '#f-manualsell')).toBe('6255.50');
      await expect(b.locator('#sd-sellmode')).toContainText(d(lang, 'desk.manualUsed'));
    } },
  { id: 'twopay', item: 'Desk gold bar 21',
    set: async (b) => { await b.locator('[data-pay2="instapay"]').tap(); await b.locator('#f-splitAmount').fill('1000'); },
    body: (b, t) => { expect(b.paymentMethods).toEqual([{ method: 'cash', amountPiastres: 100000 }, { method: 'instapay', amountPiastres: t - 100000 }]); },
    restored: async (b, _l, draft) => {
      expect(draft.paymentMethods.map((p: any) => p.method)).toEqual(['cash', 'instapay']);
      await expect.poll(() => pressed(b, '[data-pay2="instapay"]')).toBe('true');
      expect(await pressed(b, '[data-pay="cash"]')).toBe('true');
      await expect.poll(() => value(b, '#f-splitAmount')).toBe('1000.00');
      await expect(b.locator('#sd-remaining')).toContainText(money(draft.paymentMethods[1].amountPiastres).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    } },
  { id: 'visa', item: 'Desk gold bar 21',
    set: async (b) => { await b.locator('[data-pay="visa"]').tap(); },
    body: (b, t) => { expect(b.paymentMethods).toEqual([{ method: 'visa', amountPiastres: t }]); },
    restored: async (b, _l, draft) => {
      expect(draft.payByVisa).toBe(true);
      await expect.poll(() => pressed(b, '[data-pay="visa"]')).toBe('true');
    } },
];

for (const lang of LANGS) {
  for (const c of CASES) {
    test(`sales desk draft: ${c.id} is saved with the desk's choices and reopens exactly, totals as the quote (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
      const name = `Desk choices ${c.id} ${stamp()}`;
      await startDraft(app, browser, lang);
      const seen = await capture(browser, /\/sales-drafts(\/|\?|$)/, ['POST', 'PUT']);
      if (c.metal) await browser.locator(`[data-metal="${c.metal}"]`).tap();
      await addItem(browser, c.item);
      await c.set(browser, lang);
      await fillCustomer(browser, name);
      await shot(`choices-${lang}-${c.id}-1-filled`);
      const saved = await saveDraft(browser, seen);
      c.body(seen[0].body, saved.totals.total);   // the amounts sent are the draft's own total, i.e. the quote the screen showed
      await reopen(app, browser, lang, saved.id);
      const draft = (await (await apiAs('agent1', PASS))('GET', `/sales-drafts/${saved.id}`)).body;
      await c.restored(browser, lang, draft);
      await totalsMatch(browser, draft);
      // a second save from the reopened page keeps every choice (the edit sends them again)
      const edits = await capture(browser, /\/sales-drafts\/[^/?]+$/, ['PUT']);
      await browser.locator('#sd #sd-save').tap();
      await expect.poll(() => edits.length).toBe(1);
      const again = (await (await apiAs('agent1', PASS))('GET', `/sales-drafts/${saved.id}`)).body;
      for (const k of ['operation', 'metal', 'discountPercent', 'manualSellPrice', 'manualBuyPrice', 'payByVisa']) expect(again[k], k).toEqual(draft[k]);
      expect(again.paymentMethods).toEqual(draft.paymentMethods);
      expect(again.lines.map((l: any) => l.wrapping)).toEqual(draft.lines.map((l: any) => l.wrapping));
      await browser.evaluate(() => { document.querySelector('#sd-buynote')?.scrollIntoView({ block: 'center' }); return null; });
      await shot(`choices-${lang}-${c.id}-2-reopened`);
      expect(await layoutAudit(browser, '#sd', { bars: true }), 'layoutAudit').toEqual([]);
    });
  }
}

for (const lang of LANGS) {
  test(`sales desk draft: a Buy draft shows a quiet note, the Admin has no Complete, the drafts list marks it Buy (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    const api = await apiAs('agent1', PASS);
    const lines = [{ itemId: await itemId('Desk gold bar 21'), quantity: 1 }];
    const base = { invoiceType: 'sale', customerPhone: '01099887766', lines };
    const buy = await api('POST', '/sales-drafts', { ...base, customerName: `Desk Buy ${stamp()}`, operation: 'buy' });
    const sell = await api('POST', '/sales-drafts', { ...base, customerName: `Desk Sell ${stamp()}` });
    expect([buy.status, sell.status]).toEqual([201, 201]);
    made.push({ id: buy.body.id, by: 'agent1' }, { id: sell.body.id, by: 'agent1' });
    // the Admin: Complete is there for a sell draft, never for a buy one
    await as('deskadmin', browser);
    await app.open(`/${lang}/sales/desk?new=draft&open=${sell.body.id}`);
    await expect(browser.locator('#sd #sd-complete')).toBeVisible();
    expect(await browser.locator('#sd #sd-buynote').count()).toBe(0);
    await app.open(`/${lang}/sales/desk?new=draft&open=${buy.body.id}`);
    await expect(browser.locator('#sd #sd-buynote')).toBeVisible();
    expect(await browser.locator('#sd #sd-complete').count()).toBe(0);
    await expect(browser.locator('#sd #sd-save')).toBeVisible();
    await browser.evaluate(() => { document.querySelector('#sd-buynote')?.scrollIntoView({ block: 'center' }); return null; });
    await shot(`choices-${lang}-buy-admin`);
    // the server says the same
    const refused = await (await apiAs('deskadmin', PASS))('POST', `/sales-drafts/${buy.body.id}/complete`, { lines: [{ pieceCode: '1' }], cash: 100 });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ message: 'invalidFields', fields: [{ field: 'operation' }] });
    // the list: a Buy badge on the buy draft, none on the sell one
    await as('agent1', browser);
    await app.open(`/${lang}/sales/desk`);
    await expect.poll(() => browser.locator(`tr:has-text("${buy.body.customerName}") [data-operation="buy"]`).count(), { timeout: 60000 }).toBe(1);
    expect(await browser.locator(`tr:has-text("${sell.body.customerName}") [data-operation="buy"]`).count()).toBe(0);
    await shot(`choices-${lang}-list`);
    expect(await layoutAudit(browser, 'main'), 'layoutAudit').toEqual([]);
  });

  test(`sales desk draft: an older draft (no desk fields) opens as a gold sell paid in cash (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    const api = await apiAs('agent1', PASS);
    const r = await api('POST', '/sales-drafts', { invoiceType: 'sale', customerName: `Desk old ${stamp()}`, customerPhone: '01099887766', lines: [{ itemId: await itemId('Desk gold bar 21'), quantity: 2 }] });
    expect(r.status).toBe(201);
    made.push({ id: r.body.id, by: 'agent1' });
    expect(r.body).toMatchObject({ operation: 'sell', metal: 'gold', discountPercent: 0, manualSellPrice: null, manualBuyPrice: null, paymentMethods: null });
    await as('agent1', browser);
    await reopen(app, browser, lang, r.body.id);
    await expect.poll(() => pressed(browser, '[data-op="sell"]')).toBe('true');
    expect(await pressed(browser, '[data-metal="gold"]')).toBe('true');
    expect(await pressed(browser, '[data-pay="cash"]')).toBe('true');
    expect(await pressed(browser, '[data-disc="0"]')).toBe('true');
    expect(await browser.locator('#sd #sd-buynote').count()).toBe(0);
    await expect(browser.locator('#sd #sd-save')).toBeVisible();
    await totalsMatch(browser, r.body);
    await shot(`choices-${lang}-old`);
  });

  test(`sales desk draft: refusals read in words, not codes (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    const banner = browser.locator('#banners [role=alert]');
    // a percent discount together with a typed cash discount
    await startDraft(app, browser, lang);
    await addItem(browser, 'Desk gold bar 21');
    await fillCustomer(browser, `Desk refuse ${stamp()}`);
    await browser.locator('[data-disc="5"]').tap();
    await browser.locator('#sd #sec-payment > .disc-head').tap();
    await browser.locator('#sd #cashDiscount').fill('10');
    await browser.locator('#sd #sd-save').tap();
    await expect(banner).toContainText(d(lang, 'refused.discountPercent'));
    await shot(`choices-${lang}-refused-both`);
    // Visa is the only payment: planned cash and a bank row together are refused
    await browser.locator('#sd #cashDiscount').fill('');
    await browser.locator('[data-disc="0"]').tap();
    await browser.locator('[data-pay="visa"]').tap();
    await browser.locator('#sd #f-cash').fill('100');
    await browser.locator('#sd [data-addbank]').tap();
    await browser.locator('#sd #ba0-btn').tap();
    await browser.locator('[role=option]:has-text("Desk account")').first().tap();
    await browser.locator('#sd #bm0').fill('50');
    await browser.locator('#sd #sd-save').tap();
    await expect(banner).toContainText(d(lang, 'refused.visaAlone'));
    // an agent without the discount permission cannot save a percent
    await startDraft(app, browser, lang, 'agent2');
    await addItem(browser, 'Desk gold bar 21');
    await fillCustomer(browser, `Desk refuse ${stamp()}`);
    await browser.locator('[data-disc="5"]').tap();
    await browser.locator('#sd #sd-save').tap();
    await expect(banner).toContainText(d(lang, 'refused.discountNotAllowed'));
    await shot(`choices-${lang}-refused-permission`);
  });
}

test('sales desk draft api: the new refusals', { tags: ['e2e', 'desk', 'api'], requires: ['browser'] }, async () => {
  const api = await apiAs('agent1', PASS);
  const lines = [{ itemId: await itemId('Desk gold bar 21'), quantity: 1 }];
  const base = { invoiceType: 'sale', customerName: `Desk api ${stamp()}`, customerPhone: '01099887766', lines };
  const fields = (r: any) => (r.body.fields ?? []).map((f: any) => f.field);
  const both = await api('POST', '/sales-drafts', { ...base, discountPercent: 5, cashDiscount: { kind: 'amount', value: 1000 } });
  expect([both.status, fields(both)]).toEqual([400, ['discountPercent']]);
  const over = await api('POST', '/sales-drafts', { ...base, paymentMethods: [{ method: 'cash', amountPiastres: 99999999 }] });
  expect([over.status, fields(over)]).toEqual([400, ['paymentMethods']]);
  const visa2 = await api('POST', '/sales-drafts', { ...base, paymentMethods: [{ method: 'visa', amountPiastres: 100 }, { method: 'cash', amountPiastres: 100 }] });
  expect([visa2.status, fields(visa2)]).toEqual([400, ['paymentMethods']]);
  const buyVisa = await api('POST', '/sales-drafts', { ...base, operation: 'buy', paymentMethods: [{ method: 'visa', amountPiastres: 100 }] });
  expect(buyVisa.status).toBe(400);
  const nope = await (await apiAs('agent2', PASS))('POST', '/sales-drafts', { ...base, discountPercent: 5 });
  expect([nope.status, nope.body.message]).toEqual([403, 'notAllowed']);
});

afterAll(async () => {
  for (const m of made) await (await apiAs(m.by, PASS))('DELETE', `/sales-drafts/${m.id}`).catch(() => {});
});
