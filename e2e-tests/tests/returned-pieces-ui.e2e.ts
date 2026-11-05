import { afterAll } from 'e2e';
import { test, expect, seed, capture, stamp, apiAs, M, LANGS, cairoDay, MAIN_BRANCH, type Lang } from './lib.ts';

// Returned pieces are BOUGHT from the customer (owner, 2026-11-05), through the real page as an Admin (who picks the Branch): the form takes the
// branch, the item and the count only (no category, karat, weight, code or price box); a read-only price preview shows the buy price per gram,
// the cashback per gram, one piece and the total (checked here against the rule, with BigInt, not copied from the screen); the payment (cash +
// bank rows) must equal the total; Save sends item, quantity and the payment (never a price); the saved page shows the purchase number and the
// pieces with code, Copy and Print label; the label holds code, category, karat and weight only; the purchase is deleted through the screen
// (a bought piece has no plain Delete). The print window: window.open is swapped for an iframe on the page (the engine does not follow new tabs).
let S: Awaited<ReturnType<typeof seed>>;
const cp = (lang: Lang, k: string) => M(lang, 'gold-accounts', `customerPieces.${k}`);
const PRINT_FRAME = () => {
  window.open = () => {
    document.getElementById('e2e-print')?.remove();
    const f = document.createElement('iframe');
    f.id = 'e2e-print';
    f.style.cssText = 'position:fixed;bottom:16px;inset-inline-end:16px;width:340px;height:150px;z-index:99999;border:2px solid #7a5710;background:#fff';
    document.body.appendChild(f);
    const w = f.contentWindow!;
    w.close = () => f.remove();
    return w;
  };
};
const labelHtml = (browser: any) => browser.evaluate(() => (document.querySelector('#e2e-print') as HTMLIFrameElement | null)?.contentDocument?.body?.innerHTML ?? '');
const code6 = (n: unknown) => String(n).padStart(6, '0');
/** Money text as the screen writes it (piastres -> "53,484.39"), by integer maths only. */
const money = (p: number) => `${Math.trunc(p / 100).toString().replace(/\B(?=(\d{3})+$)/g, ',')}.${String(p % 100).padStart(2, '0')}`;
const plain = (p: number) => `${Math.trunc(p / 100)}.${String(p % 100).padStart(2, '0')}`;
/** The rule: ((buy + cashback) per gram x weight in mg / 1000) half up to the piastre = one piece. */
const onePieceOf = (perGram: number, weightMg: number) => Number((BigInt(perGram) * BigInt(weightMg) * 2n + 1000n) / 2000n);
const WEIGHT_MG = 4375;                                  // 4.375 g
const texts = (browser: any, sel: string) => browser.evaluate((s: string) => [...document.querySelectorAll(s)].map((e) => (e.textContent ?? '').trim()), sel);

/** The owner's size rules, measured in the browser (apple-design 18): controls <=34 desktop / <=36 phone (the one primary action <=40 on phone),
 *  icons <=20 / <=18, badges <=22, card padding 12-16 (phone 10-14); no horizontal overflow; everything inside its card; nothing fixed or sticky
 *  by accident. Returns the maxima (printed as SIZES for the before/after table) and the list of broken rules. */
const measure = (browser: any, scope: string, opts: { position?: boolean } = {}) => browser.evaluate(({ sc, o }: { sc: string; o: { position?: boolean } }) => {
  const phone = innerWidth <= 500, root = document.querySelector(sc) as HTMLElement | null;
  if (!root) return { bad: [`no ${sc}: ${document.querySelector('#cp-save')?.closest('form,div')?.outerHTML.slice(0, 80)} ${[...document.querySelectorAll('form')].map((f) => f.id).join(',')}`], max: {} };
  const bad: string[] = [], max: Record<string, number> = {};
  const note = (k: string, v: number) => { max[k] = Math.max(max[k] ?? 0, Math.round(v * 10) / 10); };
  const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = (e: Element) => `${e.tagName.toLowerCase()}${(e as HTMLElement).id ? '#' + (e as HTMLElement).id : ''}${typeof (e as HTMLElement).className === 'string' && (e as HTMLElement).className ? '.' + (e as HTMLElement).className.split(' ')[0] : ''}`;
  for (const e of root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,button,[role=combobox],a.btn')) {
    if (!vis(e)) continue;
    const h = e.getBoundingClientRect().height, primary = e.classList.contains('primary');
    const lim = primary ? (phone ? 40 : 34) : (phone ? 36 : 34);
    note(primary ? 'primary' : e.matches('button,a.btn') ? 'button' : 'field', h);
    if (h > lim + 0.5) bad.push(`${name(e)} is ${h}px high (max ${lim})`);
  }
  for (const e of root.querySelectorAll('svg')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect(), lim = phone ? 18 : 20;
    note('icon', Math.max(r.width, r.height));
    if (Math.max(r.width, r.height) > lim + 0.5) bad.push(`svg in ${name(e.parentElement!)} is ${r.width}x${r.height} (max ${lim})`);
  }
  for (const e of root.querySelectorAll('.badge,.pill,.chip,.tag,.seg button')) {
    if (!vis(e)) continue;
    const h = e.getBoundingClientRect().height, lim = e.closest('.seg') ? 30 : 22;
    note('pill', h);
    if (h > lim + 0.5) bad.push(`${name(e)} is ${h}px high (max ${lim})`);
  }
  for (const c of [root, ...root.querySelectorAll('.card')].filter((x) => x.classList.contains('card') && vis(x))) {
    const cs = getComputedStyle(c), pads = [cs.paddingTop, cs.paddingBottom, cs.paddingLeft, cs.paddingRight].map(parseFloat);
    const [lo, hi] = phone ? [10, 14] : [12, 16];
    note('cardPad', Math.max(...pads));
    if (pads.some((x) => x < lo - 0.5 || x > hi + 0.5)) bad.push(`card padding ${pads.join('/')} (want ${lo}-${hi})`);
    const cr = c.getBoundingClientRect();
    for (const d of c.querySelectorAll('input,select,button,[role=combobox],.kv,.help,.err,li')) {
      if (!vis(d)) continue;
      const r = d.getBoundingClientRect();
      if (r.left < cr.left - 1 || r.right > cr.right + 1) bad.push(`${name(d)} sticks out of its card (${Math.round(r.left - cr.left)}, ${Math.round(cr.right - r.right)})`);
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(`horizontal overflow ${document.documentElement.scrollWidth} > ${innerWidth}`);
  if (o.position !== false) for (const e of [root, ...root.querySelectorAll('*')]) { const p = getComputedStyle(e).position; if ((p === 'fixed' || p === 'sticky') && !e.classList.contains('formbar')) bad.push(`${name(e)} is position:${p}`); }
  return { bad, max };
}, { sc: scope, o: opts });
const sizesOk = async (browser: any, scope: string, opts: { position?: boolean } = {}) => { await expect(browser.locator(scope).first()).toBeVisible(); const m = await measure(browser, scope, opts); console.log('SIZES', scope, JSON.stringify(m.max)); expect(m.bad).toEqual([]); };

const made = { purchases: [] as string[], item: undefined as any, bank: '' as string, accounts: [] as { id: string; label: string }[], price: '' as string };

async function setup() {
  S ??= await seed();
  if (made.item) return;
  const form = { itemName: `E2E Returned ${S.tag}`, isCoded: true, itemType: 'gold', categoryId: S.cat.id, karat: '21', weight: WEIGHT_MG, workmanshipMode: 'per_gram', workmanshipValue: '50.00', cashbackMode: 'per_gram', cashbackValue: '25.00' };
  made.item = (await S.api('POST', '/items', form)).body;
  const bn = `E2E Bank ${stamp()}`;
  made.bank = (await S.api('POST', '/banks', { bankName: bn })).body.id;
  for (let i = 0; i < 2; i++) {
    const name = `E2E Acc${i} ${stamp()}`;
    made.accounts.push({ id: (await S.api('POST', '/bank-accounts', { accountName: name, bankId: made.bank, commission: '0.00' })).body.id, label: `${name} · ${bn}` });
  }
  // a gold price with a buy price for today, when the database has none
  const probe = await S.api('GET', `/customer-pieces/buy-price?itemId=${made.item.id}&quantity=1`);
  if (probe.status === 409 && probe.body?.message === 'noGoldPriceToday') {
    made.price = (await S.api('POST', '/gold-prices', { date: cairoDay(), sellPrice: 430000, buyPrice: 405000, silverPrice: 5000 })).body.id;
  }
}
const pickItem = async (browser: any, screen: any) => {
  await browser.locator('#itemId-btn').tap();
  await screen.getByRole('option', `${code6(made.item.itemCode)} · ${made.item.itemName}`).tap();
};

for (const lang of LANGS) {
  test(`returned pieces bought (${lang}): item and count only, price preview, paid in full, save, pieces with Copy and Print label, delete the purchase`, { tags: ['e2e', 'purchases', 'returned-pieces'], requires: ['browser'] }, async ({ go, browser, screen, shot }) => {
    await setup();
    const admin = await apiAs('e2eadmin');
    const tag = stamp();
    const name = `E2E Mona ${tag}`;
    const phone = `010${Date.now().toString().slice(-8)}`;
    await browser.addInitScript(PRINT_FRAME);
    const seen = await capture(browser, /\/customer-pieces(\?|$)/, ['POST']);
    try {
      // 1. The form: branch, item, quantity; nothing about category, karat, weight, code or price to type
      await go('e2eadmin', '/sales/returns?view=returned-pieces&new=createReturnedPiece', lang);
      await expect(browser.locator('#cp-save')).toBeVisible();
      await expect(browser.locator('#branchId-btn')).toBeVisible();
      for (const gone of ['#categoryId-btn', '#cp-karat', '#cp-weight', '#f-code', '#f-pieceCode', '#f-price', '#f-tagPrice', '#f-weight']) await expect(browser.locator(gone)).toHaveCount(0);
      await sizesOk(browser, '#cp');
      await shot(`returned-${lang}-1-form`);

      // 2. Nothing chosen: the item says required, nothing is sent
      await browser.locator('#cp-save').tap();
      await expect(browser.locator('[data-k=itemId] .err')).toBeVisible();
      expect(seen.length).toBe(0);

      // 3. Branch (the Admin picks it), item, quantity 3: the preview follows the rule, to the piastre
      // a database with a single branch pre-selects it (tapping it again would clear it): pick only when it is not already chosen
      if (!((await texts(browser, '#branchId-btn'))[0] ?? '').includes('Main branch')) {
        await browser.locator('#branchId-btn').tap();
        await screen.getByRole('option', 'Main branch').tap();
      }
      await pickItem(browser, screen);
      await browser.locator('#f-quantity').fill('3');
      await expect(browser.locator('[data-preview=total]')).toBeVisible();
      const q = (await admin('GET', `/customer-pieces/buy-price?itemId=${made.item.id}&quantity=3`)).body;
      const one = onePieceOf(q.buyPricePerGram + q.cashbackPerGram, WEIGHT_MG);
      expect(q.cashbackPerGram).toBe(2500);
      expect(q.onePiece).toBe(one);
      expect(q.total).toBe(one * 3);
      const shown = async (k: string) => (await texts(browser, `[data-preview=${k}]`))[0];
      await expect.poll(() => shown('total')).toBe(money(q.total));
      expect(await shown('buyPerGram')).toBe(money(q.buyPricePerGram));
      expect(await shown('cashbackPerGram')).toBe(money(q.cashbackPerGram));
      expect(await shown('onePiece')).toBe(money(one));
      await expect(browser.locator('[data-left]')).toHaveText(money(q.total));
      await sizesOk(browser, '#cp');
      await shot(`returned-${lang}-2-preview`);

      // 4. Paying one piastre short is refused on the page (the sum box says what is due and what was typed), nothing is sent
      await browser.locator('#f-cash').fill(plain(q.total - 1));
      await expect(browser.locator('[data-left]')).toHaveText('0.01');
      await browser.locator('#cp-save').tap();
      await expect(browser.locator('#paySumErr .err')).toContainText(cp(lang, 'payMismatch').split('{total}')[0].trim());
      expect(seen.length).toBe(0);
      await shot(`returned-${lang}-3-short`);

      // 5. Cash in full + the optional customer fields: Save sends item, quantity and the payment, never a price, category, karat, weight or code
      await browser.locator('#f-cash').fill(plain(q.total));
      await expect(browser.locator('[data-left]')).toHaveText('0.00');
      await browser.locator('#f-customerName').fill(name);
      await browser.locator('#f-customerPhone').fill(phone);
      await browser.locator('#cp-save').tap();
      await expect.poll(() => seen.length).toBe(1);
      expect(seen[0].body).toEqual({ branchId: MAIN_BRANCH, itemId: made.item.id, quantity: 3, cash: q.total, bankPayments: [], customerName: name, customerPhone: phone });
      await expect(browser.locator('#cp-saved')).toBeVisible();
      const docNo = await browser.evaluate(() => document.querySelector('[data-doc-number]')?.textContent ?? '');
      const codes: string[] = await browser.evaluate(() => [...document.querySelectorAll('#cp-pieces [data-piece-code]')].map((e) => (e as HTMLElement).dataset.pieceCode!));
      expect(codes.length).toBe(3);
      await expect(browser.locator('[data-saved-total]')).toHaveText(money(q.total));
      const first = (await admin('GET', `/customer-pieces?code=${codes[0]}`)).body;
      const doc = (await admin('GET', `/customer-pieces/purchases/${first.purchaseId}`)).body;
      made.purchases.push(doc.id);
      expect(code6(doc.documentNumber)).toBe(docNo);
      expect(doc).toMatchObject({ quantity: 3, total: q.total, cash: q.total, bankPayments: [], itemId: made.item.id, branchId: MAIN_BRANCH });
      expect(doc.pieces.map((p: any) => p.code)).toEqual(codes);
      for (const c of codes) await expect(browser.locator(`[data-piece-code="${c}"] .copy-btn`)).toBeVisible();
      await sizesOk(browser, '#cp-saved');
      await shot(`returned-${lang}-4-saved`);

      // 6. Print label: code, category, karat and weight; never the name, phone or any money
      await browser.locator(`[data-print="${codes[0]}"]`).tap();
      await expect.poll(() => labelHtml(browser)).toContain('data-label-code');
      const html = await labelHtml(browser);
      expect(html).toContain(`>${codes[0]}<`);
      expect(html).toContain(S.cat.categoryName);
      expect(html).toContain('4.375');
      for (const leak of [name, 'Mona', phone, money(q.total), money(one), 'EGP', 'ج.م']) expect(html).not.toContain(leak);
      await shot(`returned-${lang}-5-label`);

      // 7. A second purchase paid by cash and a bank row: cash 100.00, the bank account takes the rest to the piastre
      await browser.evaluate(() => document.getElementById('e2e-print')?.remove());   // the stand-in print window covers the buttons on a phone
      await browser.locator('#cp-another').tap();
      await pickItem(browser, screen);
      await browser.locator('#f-quantity').fill('1');
      const one1 = (await admin('GET', `/customer-pieces/buy-price?itemId=${made.item.id}&quantity=1`)).body.total as number;
      await expect.poll(() => shown('total')).toBe(money(one1));
      await browser.locator('#f-cash').fill('100.00');
      await browser.locator('[data-k=bank0Account] [role=combobox]').tap();
      await screen.getByRole('option', made.accounts[0].label).tap();
      await browser.locator('#bm0').fill(plain(one1 - 10000));
      await expect(browser.locator('[data-left]')).toHaveText('0.00');
      await sizesOk(browser, '#cp');
      await shot(`returned-${lang}-6-cash-and-bank`);
      await browser.locator('#cp-save').tap();
      await expect.poll(() => seen.length).toBe(2);
      expect(seen[1].body).toEqual({ branchId: MAIN_BRANCH, itemId: made.item.id, quantity: 1, cash: 10000, bankPayments: [{ bankAccountId: made.accounts[0].id, amount: one1 - 10000 }] });
      await expect(browser.locator('#cp-saved')).toBeVisible();
      const code2 = await browser.evaluate(() => (document.querySelector('#cp-pieces [data-piece-code]') as HTMLElement).dataset.pieceCode!);
      const doc2 = (await admin('GET', `/customer-pieces/purchases/${(await admin('GET', `/customer-pieces?code=${code2}`)).body.purchaseId}`)).body;
      made.purchases.push(doc2.id);
      expect(doc2).toMatchObject({ quantity: 1, total: one1, cash: 10000, bankPayments: [{ bankAccountId: made.accounts[0].id, amount: one1 - 10000 }] });
      await shot(`returned-${lang}-7-saved-bank`);

      // 8. Clean up through the screen: find the piece, open it, a bought piece has no plain Delete, only Delete the purchase
      await go('e2eadmin', '/sales/returns?view=returned-pieces', lang);
      await browser.locator('#f-find').fill(codes[0]);
      await browser.locator('#run').tap();
      await browser.locator('#tbl tbody tr').first().tap();
      await expect(browser.locator('.sheet footer button.danger')).toHaveCount(1);
      await expect(browser.locator('.sheet footer button.danger')).toContainText(cp(lang, 'deletePurchase'));
      await sizesOk(browser, '.sheet', { position: false });
      await shot(`returned-${lang}-8-record`);
      await browser.locator('.sheet footer button.danger').tap();
      await expect(browser.locator('dialog[open]')).toContainText(cp(lang, 'deletePurchaseTitle'));
      await browser.locator('dialog[open] button.danger').tap();
      await expect(browser.locator('body')).toContainText(cp(lang, 'deletedToast').replace('{code}', codes[0]));
      expect((await admin('GET', `/customer-pieces/purchases/${doc.id}`)).status).toBe(404);
      expect((await admin('GET', `/customer-pieces?code=${codes[1]}`)).status).toBe(404);
      made.purchases = made.purchases.filter((id) => id !== doc.id);
      await shot(`returned-${lang}-9-deleted`);
    } finally {
      for (const id of made.purchases) await admin('DELETE', `/customer-pieces/purchases/${id}`);
      made.purchases = [];
    }
  });
}

afterAll(async () => {
  if (!S) return;
  if (made.item) { await S.api('DELETE', `/items/${made.item.id}`); if (made.item.itemNameId) await S.api('DELETE', `/item-names/${made.item.itemNameId}`); }
  for (const a of made.accounts) await S.api('DELETE', `/bank-accounts/${a.id}`);
  if (made.bank) await S.api('DELETE', `/banks/${made.bank}`);
  if (made.price) await S.api('DELETE', `/gold-prices/${made.price}`);
  await S.remove();
});
