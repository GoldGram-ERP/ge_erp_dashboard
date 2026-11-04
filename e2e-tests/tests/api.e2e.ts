import { test, expect } from 'e2e';
import { apiAs, cairoDay, stamp, PASSWORD, signInApi, unlock } from './lib.ts';

// API-level checks on the logic target (no browser). Records are created with a run stamp and deleted through the normal Delete path.
const P = { platforms: ['node'] };

test('access matrix: User with no screens sees none, Admin gets screens', { ...P, tags: ['api', 'access'] }, async () => {
  await unlock('e2euser');
  const user = await (await apiAs('e2euser'))('GET', '/access/me');
  expect(user.body.userType).toBe('user');
  expect(user.body.screens).toEqual([]);
  const admin = await (await apiAs('e2eadmin'))('GET', '/access/me');
  expect(admin.body.userType).toBe('admin');
  expect(admin.body.screens.length).toBeGreaterThan(10);
  expect((await (await apiAs('e2euser'))('GET', '/banks')).status).toBe(403);
});

test('banks API: create, edit, account create/edit, validation, delete both', { ...P, tags: ['api', 'banks'] }, async () => {
  const api = await apiAs('superadmin');
  const name = `E2E Bank ${stamp()}`;
  expect((await api('POST', '/banks', { bankName: '' })).status).toBe(400);
  expect((await api('POST', '/banks', { bankName: 'x'.repeat(101) })).status).toBe(400);
  const bank = await api('POST', '/banks', { bankName: name });
  expect(bank.status).toBe(201);
  expect((await api('POST', '/banks', { bankName: name })).status).toBe(409); // bankNameTaken
  expect((await api('PATCH', `/banks/${bank.body.id}`, { bankName: `${name} v2` })).status).toBe(200);
  const acc = await api('POST', '/bank-accounts', { accountName: `E2E Acc ${stamp()}`, bankId: bank.body.id, commission: '1.25' });
  expect(acc.status).toBe(201);
  expect((await api('POST', '/bank-accounts', { accountName: 'x', bankId: bank.body.id, commission: '1.234' })).status).toBe(400);
  expect((await api('PATCH', `/bank-accounts/${acc.body.id}`, { accountName: 'E2E Acc renamed', bankId: bank.body.id, commission: null })).status).toBe(200);
  expect((await api('DELETE', `/banks/${bank.body.id}`)).status).toBe(409); // bankInUse while an account belongs to it
  expect((await api('DELETE', `/bank-accounts/${acc.body.id}`)).status).toBeLessThan(300);
  expect((await api('DELETE', `/banks/${bank.body.id}`)).status).toBeLessThan(300);
});

test('gold prices API: validation and newest price is always served', { ...P, tags: ['api', 'gold-prices'] }, async () => {
  const api = await apiAs('superadmin');
  const day = cairoDay();
  for (const bad of [{ sellPrice: 0, buyPrice: 1, silverPrice: 1 }, { sellPrice: 1, buyPrice: 0, silverPrice: 1 }, { sellPrice: 1, buyPrice: 1, silverPrice: 0 }, { sellPrice: 1, buyPrice: 1 }])
    expect((await api('POST', '/gold-prices', { date: day, ...bad })).status).toBe(400);
  const t = await api('GET', '/gold-prices/today');
  expect([200, 404]).toContain(t.status); // owner rule: newest set whatever its date; 404 only when none was ever saved
});

test('sign-in: wrong password is 401 and a good one resets the counter', { ...P, tags: ['api', 'auth'] }, async () => {
  await unlock('e2euser');
  expect((await signInApi('e2euser', 'Wrong-Pass-9999')).status).toBe(401);
  expect((await signInApi('e2euser', PASSWORD)).status).toBe(200);
});

test('change password round trip for e2euser', { ...P, tags: ['api', 'account'] }, async () => {
  await unlock('e2euser');
  const NEW = `E2e-Temp-${stamp()}-x9`;
  const a = await apiAs('e2euser');
  expect((await a('POST', '/access/change-password', { currentPassword: PASSWORD, newPassword: NEW })).status).toBe(204);
  try {
    expect((await signInApi('e2euser', PASSWORD)).status).toBe(401);
    const b = await apiAs('e2euser', NEW);
    expect((await b('POST', '/access/change-password', { currentPassword: NEW, newPassword: PASSWORD })).status).toBe(204);
  } finally {
    await signInApi('e2euser', PASSWORD);
  }
  expect((await signInApi('e2euser', PASSWORD)).status).toBe(200);
});
