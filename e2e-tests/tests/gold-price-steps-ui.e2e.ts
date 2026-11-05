import { test, expect, apiAs, M, type Lang } from './lib.ts';

// Gold prices form: a new set starts with the last saved prices, -5 / +5 pound steps, derived 24K, saved set equals the edited values.
const g = (l: Lang, k: string) => M(l, 'system-codes', `goldPrices.${k}`);
const val = (br: any, id: string): Promise<string> => br.evaluate((i: string) => (document.getElementById(i) as HTMLInputElement)?.value ?? '', id);
const step = (l: Lang, name: string, plus: boolean) => (plus
  ? (l === 'en' ? `Add 5 pounds to ${g(l, name)}` : `زيادة 5 جنيهات في ${g(l, name)}`)
  : (l === 'en' ? `Subtract 5 pounds from ${g(l, name)}` : `إنقاص 5 جنيهات من ${g(l, name)}`));

for (const lang of ['en', 'ar'] as Lang[]) {
  test(`gold prices: prefilled from the last set, -5/+5 steps, saved equals edited (${lang})`, { tags: ['e2e', 'gold-prices'], requires: ['browser'] }, async ({ go, screen, browser, shot }) => {
    const api = await apiAs('superadmin');
    // The newest saved set is what the form must start with; seed one only when the (own, empty) database has none.
    let last = (await api('GET', '/gold-prices/today')).body;
    if (!last?.sellPrice) { expect((await api('POST', '/gold-prices', { date: '2026-01-02', sellPrice: 405000, buyPrice: 400050, silverPrice: 5 })).status).toBe(201); last = (await api('GET', '/gold-prices/today')).body; }
    const seed = { sellPrice: last.sellPrice as number, buyPrice: last.buyPrice as number, silverPrice: last.silverPrice as number };
    await go('superadmin', '/setup/gold-prices', lang);
    await screen.getByRole('button', g(lang, 'add')).tap();
    await expect.poll(() => val(browser, 'f-sellPrice')).toBe((seed.sellPrice / 100).toFixed(2));
    expect(await val(browser, 'f-buyPrice')).toBe((seed.buyPrice / 100).toFixed(2));
    expect(await val(browser, 'f-silverPrice')).toBe((seed.silverPrice / 100).toFixed(2));
    const k24 = (p: number) => Math.floor((p * 48 + 21) / 42);
    const text24 = () => val(browser, 'f-sellPrice24');
    await expect.poll(async () => (await text24()).replace(/,/g, '')).toBe((k24(seed.sellPrice) / 100).toFixed(2));
    await shot(`gold-steps-${lang}-1-prefilled`);

    const sell = browser.locator(`[aria-label="${step(lang, 'sellPrice', true)}"]`);
    await sell.tap(); await sell.tap();
    await browser.locator(`[aria-label="${step(lang, 'buyPrice', false)}"]`).tap();
    await browser.locator(`[aria-label="${step(lang, 'silverPrice', false)}"]`).tap(); // 1.00 - 5 never goes below 0 (lang en: 0.05 -> 0.00)
    const want = { sellPrice: seed.sellPrice + 1000, buyPrice: Math.max(0, seed.buyPrice - 500), silverPrice: Math.max(0, seed.silverPrice - 500) };
    await expect.poll(() => val(browser, 'f-sellPrice')).toBe((want.sellPrice / 100).toFixed(2));
    expect(await val(browser, 'f-buyPrice')).toBe((want.buyPrice / 100).toFixed(2));
    expect(await val(browser, 'f-silverPrice')).toBe((want.silverPrice / 100).toFixed(2));
    const expected24 = k24(want.sellPrice);
    await expect.poll(async () => (await text24()).replace(/,/g, '')).toBe((expected24 / 100).toFixed(2));
    // 44px on touch, 36px otherwise
    const h = await browser.evaluate(() => (document.querySelector('.step-btn') as HTMLElement).getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(36);
    await shot(`gold-steps-${lang}-2-stepped`);

    // +5 again (also lifts a 0.00 silver above zero, which the form requires), then save
    await browser.locator(`[aria-label="${step(lang, 'silverPrice', true)}"]`).tap();
    want.silverPrice += 500;
    expect(await val(browser, 'f-silverPrice')).toBe((want.silverPrice / 100).toFixed(2));
    await browser.locator('#save').tap();
    await expect.poll(async () => (await api('GET', '/gold-prices/today')).body?.sellPrice).toBe(want.sellPrice);
    const saved = (await api('GET', '/gold-prices/today')).body;
    expect(saved.buyPrice).toBe(want.buyPrice);
    expect(saved.silverPrice).toBe(want.silverPrice);
    await shot(`gold-steps-${lang}-3-saved`);
  });
}
