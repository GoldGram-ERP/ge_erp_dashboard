import { test, expect } from 'e2e';
import { API, WEB, W, M, apiAs, signInApi, stamp, capture, test as uiTest, expect as uiExpect, type Lang } from './lib.ts';

// Rule G1 idempotency: one key per Save; a repeat with the same key makes one record and gets the first answer back.
const H = { 'content-type': 'application/json', origin: WEB };

test('backend: the same key twice makes one bank and replays the first answer', { platforms: ['node'], tags: ['api', 'idempotency'] }, async () => {
  const s = await signInApi('superadmin');
  const name = `E2E Idem ${stamp()}`, key = crypto.randomUUID();
  const post = (k: string) => fetch(`${API}/banks`, { method: 'POST', headers: { ...H, cookie: s.cookie, 'idempotency-key': k }, body: JSON.stringify({ bankName: name }) });
  const api = await apiAs('superadmin');
  // two at once: one runs, the other is told saveInProgress (409) or already gets the first answer
  const [a, b] = await Promise.all([post(key), post(key)]);
  const bodies = [await a.json(), await b.json()];
  const statuses = [a.status, b.status];
  for (const [i, st] of statuses.entries()) {
    if (st === 409) expect(bodies[i].message).toBe('saveInProgress'); else expect(st).toBe(201);
  }
  expect(statuses).toContain(201);
  // a later repeat: the first result, no second record
  const c = await post(key);
  expect(c.status).toBe(201);
  const first = bodies[statuses.indexOf(201)];
  expect((await c.json()).id).toBe(first.id);
  const found = (await api('GET', `/banks?search=${encodeURIComponent(name)}`)).body.items;
  expect(found).toHaveLength(1);
  // a different key with the same content is a different Save: the backend refuses the duplicate name
  expect((await post(crypto.randomUUID())).status).toBe(409);
  expect((await api('DELETE', `/banks/${first.id}`)).status).toBeLessThan(300);
});

for (const lang of ['en', 'ar'] as Lang[]) {
  uiTest(`UI: a double click on Save and on Delete sends one request (${lang})`, { tags: ['e2e', 'idempotency'], requires: ['browser'] }, async ({ go, screen, browser, shot }) => {
    const name = `E2E Idem ${stamp()}`;
    const api = await apiAs('superadmin');
    await go('superadmin', '/money/banks', lang);
    const calls = await capture(browser, /\/banks(\?|$|\/)/);
    await screen.getByRole('button', M(lang, 'bank-accounts', 'banks.add')).tap();
    await browser.locator('#f-bankName').fill(name);
    await browser.evaluate(() => { const b = document.querySelector('#save') as HTMLButtonElement; b.click(); b.click(); });   // a real double click, before React redraws
    await uiExpect.poll(() => calls.filter((c) => c.method === 'POST').length).toBe(1);
    await shot(`idempotency-${lang}-1-saved`);
    let bank: any; await uiExpect.poll(async () => { bank = (await api('GET', `/banks?search=${encodeURIComponent(name)}`)).body.items?.[0]; return !!bank; }).toBe(true);
    expect((await api('GET', `/banks?search=${encodeURIComponent(name)}`)).body.items).toHaveLength(1);
    await screen.getByText(name, { exact: true }).tap();
    await browser.locator('[data-remove]').tap();
    await screen.getByRole('button', W.del[lang]).last().tap();
    await browser.evaluate(() => { const b = document.querySelector('[data-remove]') as HTMLButtonElement | null; b?.click(); b?.click(); });
    await uiExpect.poll(() => calls.filter((c) => c.method === 'DELETE').length).toBe(1);
    await shot(`idempotency-${lang}-2-deleted`);
  });
}
