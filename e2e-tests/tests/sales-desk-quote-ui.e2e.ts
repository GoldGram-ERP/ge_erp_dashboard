import { test, expect, signInApi, LANGS, WEB } from './lib.ts';

// The desk's price is the backend quote (docs/specs/sales-desk-reference.md): the total appears and moves with the discount, Visa and a typed price,
// the WhatsApp text carries the quoted numbers, and the endpoint's errors show. Seeded by scripts/desk-d2b-seed.mjs: gold sell 5,125.50, "Desk gold bar 21" 10 g, workmanship 50.
// '' while the page is (re)loading, so a poll can ride out a dev-server recompile
const total = async (browser: any) => ((await browser.locator('#sd-total').count()) ? (((await browser.locator('#sd-total').textContent()) as string) ?? '') : '').replace(/,/g, '').trim();

for (const lang of LANGS) {
  test(`sales desk quote: total follows discount, Visa and typed price; WhatsApp text matches; errors show (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    const s = await signInApi('agent1', 'Correct-Horse-9');
    await browser.setCookies([{ url: WEB, name: s.name, value: s.value, httpOnly: true, sameSite: 'Lax' }]);
    await app.open(`/${lang}/sales/desk?new=draft`);
    await expect.poll(() => browser.locator('#sd-total').count(), { timeout: 60000 }).toBe(1);
    await expect.poll(() => total(browser), { timeout: 30000 }).toBe('—');
    await expect.poll(async () => { await browser.locator('#it0-btn').tap(); return browser.locator('[role=option]:has-text("Desk gold bar 21")').count(); }, { timeout: 30000 }).toBeGreaterThan(0);
    await browser.locator('[role=option]:has-text("Desk gold bar 21")').first().tap();
    // 10 g x 5,125.50 + 10 g x 50 = 51,755.00 (the backend's number, rounded the reference way)
    await expect.poll(() => total(browser), { timeout: 15000 }).toBe('51755.00');
    await shot(`quote-${lang}-1-total`);
    // a typed price wins
    await browser.locator('#f-manualsell').fill('6255');
    await expect.poll(() => total(browser), { timeout: 15000 }).toBe('63050.00');
    // the discount is taken off the workmanship only: 5% of 500 = 25
    await browser.locator('#sd-disc-on').tap();
    await expect.poll(() => total(browser), { timeout: 15000 }).toBe('63025.00');
    await shot(`quote-${lang}-2-discount`);
    // Visa adds 2%
    await browser.locator('#payment-btn').tap();
    await browser.locator('[role=option]').last().tap();
    await expect.poll(() => total(browser), { timeout: 15000 }).not.toBe('63025.00');
    await shot(`quote-${lang}-3-visa`);
    // the WhatsApp text is the quoted numbers in the reference's words
    const wa = (await browser.evaluate(() => document.querySelector('#wa-text')!.textContent)) as string;
    expect(wa).toContain('تفاصيل القطع: بيع');
    expect(wa).toContain('سعر جرام 21: 6,255');
    expect(wa).toContain('خصم 5% على المصنعية');
    expect(wa).toContain('Desk gold bar 21');
    // a quote that cannot be made shows its message, not a number
    await browser.locator('#f-manualsell').fill('abc');
    await expect(browser.locator('#sd-manualmsg')).toBeVisible();
    await expect.poll(() => total(browser)).toBe('—');
    await shot(`quote-${lang}-4-error`);
  });
}
