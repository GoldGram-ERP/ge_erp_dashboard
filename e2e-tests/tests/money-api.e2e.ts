import { test, expect } from 'e2e';
import { apiAs, stamp } from './lib.ts';

// Money API on the logic target (no browser). Own run-stamped records, deleted through the normal Delete path.
const P = { platforms: ['node'] };
const day = () => new Date().toISOString().slice(0, 10);
const bad = (r: { status: number }) => expect(r.status).toBe(400);

// A branch needs its own admin (one branch per admin), so each run makes a throwaway admin user.
async function newAdmin(api: any, tag: string) {
  const u = await api('POST', '/users', { username: `e2eb${tag.toLowerCase()}`, email: `e2eb${tag.toLowerCase()}@example.com`, password: 'E2e-Temp-Pass-9876', userType: 'admin', screens: [], canUseTreasuries: true });
  expect(u.status).toBe(201);
  return u.body.id as string;
}
async function ownBranch(api: any, tag: string) {
  const adminId = await newAdmin(api, tag);
  const b = await api('POST', '/branches', { branchName: `E2E Br ${tag}`, adminUserId: adminId });
  expect(b.status).toBe(201);
  const ts = (await api('GET', `/treasuries?branchId=${b.body.id}`)).body.items;
  const id = b.body.id as string;
  return { id, egp: ts.find((t: any) => t.kind === 'egp').id as string, gold: ts.find((t: any) => t.kind === 'gold').id as string, drop: async () => { await api('DELETE', `/branches/${id}`); await api('DELETE', `/users/${adminId}`); } };
}

test('branches, karats, settings, gold prices: validation and roles', { ...P, tags: ['api', 'money'] }, async () => {
  const api = await apiAs('superadmin'); const tag = stamp();
  bad(await api('POST', '/branches', { branchName: '', adminUserId: 'x' }));
  bad(await api('POST', '/branches', { branchName: 'x'.repeat(200), adminUserId: 'x' }));
  const adminId = await newAdmin(api, tag);
  const b = await api('POST', '/branches', { branchName: `E2E Br ${tag}`, adminUserId: adminId });
  expect(b.status).toBe(201);
  expect(b.body).toMatchObject({ branchName: `E2E Br ${tag}`, adminUserId: adminId, deletedAt: null });
  expect((await api('POST', '/branches', { branchName: `E2E Br ${tag}`, adminUserId: adminId })).status).toBe(409);
  expect((await api('PATCH', `/branches/${b.body.id}`, { branchName: `E2E Br ${tag} v2` })).status).toBe(200);
  expect((await api('GET', `/branches/${b.body.id}`)).body.branchName).toBe(`E2E Br ${tag} v2`);
  expect((await api('GET', `/treasuries?branchId=${b.body.id}`)).body.items.map((t: any) => t.kind).sort()).toEqual(['egp', 'gold']);
  expect((await api('DELETE', `/branches/${b.body.id}`)).status).toBeLessThan(300);
  await api('DELETE', `/users/${adminId}`);
  expect((await api('GET', '/karats')).body).toEqual([{ karat: '18' }, { karat: '21' }, { karat: '24' }, { karat: '999' }]);
  expect((await api('GET', '/settings')).body).toHaveProperty('shopNameEn');
  expect((await api('GET', '/settings/brand')).status).toBe(200);
  for (const x of [{ sellPrice: 0, buyPrice: 1, silverPrice: 1 }, { sellPrice: 1, buyPrice: 0, silverPrice: 1 }, { sellPrice: 1, buyPrice: 1, silverPrice: 0 }, { sellPrice: 1, buyPrice: 1 }]) bad(await api('POST', '/gold-prices', { date: day(), ...x }));
  const user = await apiAs('e2euser');
  for (const p of ['/branches', '/settings', '/gold-prices', '/users']) expect((await user('GET', p)).status).toBe(403);
  expect((await user('POST', '/branches', { branchName: 'nope' })).status).toBe(403);
  expect((await (await apiAs('e2eadmin'))('GET', '/karats')).status).toBe(200);
});

test('cash and gold movements: validation, balance, delete, roles', { ...P, tags: ['api', 'money'] }, async () => {
  const api = await apiAs('superadmin'); const tag = stamp(); const br = await ownBranch(api, tag);
  const base = { branchId: br.id, treasuryId: br.egp, date: day(), note: `E2E ${tag}` };
  const cash: string[] = []; const gold: string[] = [];
  try {
    bad(await api('POST', '/cash-movements', { ...base, movementType: 'x', amount: 100 }));
    bad(await api('POST', '/cash-movements', { ...base, movementType: 'deposit', amount: 0.5 }));
    bad(await api('POST', '/cash-movements', { ...base, movementType: 'deposit', amount: 'a' }));
    bad(await api('POST', '/cash-movements', { ...base, movementType: 'deposit', amount: 100, note: 'x'.repeat(251) }));
    bad(await api('POST', '/cash-movements', { ...base, movementType: 'deposit', amount: 100, date: '2026-13-40' }));
    bad(await api('POST', '/cash-movements', { ...base, movementType: 'deposit', amount: 100, branchId: 'nope' }));
    bad(await api('POST', '/cash-movements', { ...base, treasuryId: br.gold, movementType: 'deposit', amount: 100 }));
    const dep = await api('POST', '/cash-movements', { ...base, movementType: 'deposit', amount: 100_000 });
    expect(dep.status).toBe(201); cash.push(dep.body.id);
    expect(dep.body).toMatchObject({ movementType: 'deposit', amount: 100_000, branchId: br.id, note: `E2E ${tag}` });
    const wd = await api('POST', '/cash-movements', { ...base, movementType: 'withdraw', amount: 40_000 });
    expect(wd.status).toBe(201); cash.push(wd.body.id);
    expect((await api('GET', `/cash-movements/${wd.body.id}`)).body.amount).toBe(40_000);
    expect((await api('GET', `/cash-movements?branchId=${br.id}`)).body.total).toBe(2);
    const g = { branchId: br.id, treasuryId: br.gold, date: day(), karat: '21', weightMg: 5000, note: `E2E ${tag}` };
    bad(await api('POST', '/gold-movements', { ...g, karat: '22', movementType: 'deposit' }));
    bad(await api('POST', '/gold-movements', { ...g, weightMg: 0, movementType: 'deposit' }));
    bad(await api('POST', '/gold-movements', { ...g, weightMg: 1.5, movementType: 'deposit' }));
    bad(await api('POST', '/gold-movements', { ...g, note: '', movementType: 'deposit' }));
    bad(await api('POST', '/gold-movements', { ...g, treasuryId: br.egp, movementType: 'deposit' }));
    const w0 = await api('POST', '/gold-movements', { ...g, movementType: 'withdraw' });
    expect(w0.status).toBe(409); expect(w0.body.message).toBe('notEnoughGold');
    const gd = await api('POST', '/gold-movements', { ...g, movementType: 'deposit' });
    expect(gd.status).toBe(201); gold.push(gd.body.id);
    expect(gd.body).toMatchObject({ karat: '21', weightMg: 5000, movementType: 'deposit' });
    const w2 = await api('POST', '/gold-movements', { ...g, weightMg: 6000, movementType: 'withdraw' });
    expect(w2.status).toBe(409); expect(w2.body).toMatchObject({ message: 'notEnoughGold', karat: '21', availableMg: 5000 });
    const w3 = await api('POST', '/gold-movements', { ...g, weightMg: 2000, movementType: 'withdraw' });
    expect(w3.status).toBe(201); gold.push(w3.body.id);
    expect((await api('DELETE', `/gold-movements/${gd.body.id}`)).status).toBe(409);
    const user = await apiAs('e2euser');
    expect((await user('POST', '/cash-movements', { ...base, movementType: 'deposit', amount: 1 })).status).toBe(403);
    expect((await user('POST', '/gold-movements', { ...g, movementType: 'deposit' })).status).toBe(403);
    expect((await user('DELETE', `/cash-movements/${dep.body.id}`)).status).toBe(403);
  } finally {
    for (const id of gold.reverse()) await api('DELETE', `/gold-movements/${id}`);
    for (const id of cash.reverse()) await api('DELETE', `/cash-movements/${id}`);
    await br.drop();
  }
});

test('treasury transfers: send, accept, refuse, cancel, wrong-user refusals', { ...P, tags: ['api', 'money'] }, async () => {
  const api = await apiAs('superadmin'); const admin = await apiAs('e2eadmin'); const user = await apiAs('e2euser'); const tag = stamp();
  const br = await ownBranch(api, tag);
  const theirs = (await admin('GET', '/treasuries?handledByMe=true')).body.items.find((t: any) => t.kind === 'egp');
  expect(theirs).toBeTruthy();
  const dep = await api('POST', '/cash-movements', { branchId: br.id, treasuryId: br.egp, movementType: 'deposit', date: day(), amount: 50_000, note: `E2E ${tag}` });
  expect(dep.status).toBe(201);
  try {
    const send = (b: any) => api('POST', '/treasury-transfers', b);
    expect((await send({ fromTreasuryId: br.egp, toTreasuryId: br.egp, amountPiastres: 1 })).status).toBe(400);
    expect((await send({ fromTreasuryId: br.egp, toTreasuryId: theirs.id })).status).toBe(400);
    bad(await send({ fromTreasuryId: 'nope', toTreasuryId: theirs.id, amountPiastres: 1 }));
    bad(await send({ fromTreasuryId: br.egp, toTreasuryId: theirs.id, amountPiastres: -5 }));
    const gt = (await api('GET', `/treasuries/targets?fromTreasuryId=${br.gold}`)).body.items;
    expect(gt.every((t: any) => t.kind === 'gold')).toBe(true);
    expect((await send({ fromTreasuryId: br.egp, toTreasuryId: gt[0].id, amountPiastres: 1 })).status).toBe(409);
    const tooMuch = await send({ fromTreasuryId: br.egp, toTreasuryId: theirs.id, amountPiastres: 60_000 });
    expect(tooMuch.status).toBe(409); expect(tooMuch.body).toMatchObject({ message: 'notEnoughCash', availablePiastres: 50_000 });
    expect((await send({ fromTreasuryId: br.gold, toTreasuryId: gt[0].id, gold: [{ karat: '21', weightMg: 100 }] })).status).toBe(409);
    const t1 = await send({ fromTreasuryId: br.egp, toTreasuryId: theirs.id, amountPiastres: 10_000 });
    expect(t1.status).toBe(201); expect(t1.body.status).toBe('sent');
    const id1 = t1.body.id;
    expect((await api('POST', `/treasury-transfers/${id1}/accept`)).status).toBe(403);
    expect((await user('POST', `/treasury-transfers/${id1}/accept`)).status).toBe(403);
    expect((await user('GET', `/treasury-transfers/${id1}`)).status).toBe(403);
    expect((await user('POST', '/treasury-transfers', { fromTreasuryId: br.egp, toTreasuryId: theirs.id, amountPiastres: 1 })).status).toBe(403);
    expect((await user('DELETE', `/treasury-transfers/${id1}`)).status).toBe(403);
    bad(await admin('POST', `/treasury-transfers/${id1}/refuse`, { reason: '' }));
    bad(await admin('POST', `/treasury-transfers/${id1}/refuse`, { reason: 'x'.repeat(501) }));
    const refused = await admin('POST', `/treasury-transfers/${id1}/refuse`, { reason: 'E2E wrong amount' });
    expect(refused.status).toBe(201); expect(refused.body.status).toBe('refused');
    const again = await admin('POST', `/treasury-transfers/${id1}/accept`);
    expect(again.status).toBe(409); expect(again.body.message).toBe('transferNotPending');
    const t2 = await send({ fromTreasuryId: br.egp, toTreasuryId: theirs.id, amountPiastres: 5_000 });
    expect(t2.status).toBe(201);
    expect((await api('DELETE', `/treasury-transfers/${t2.body.id}`)).status).toBeLessThan(300);
    expect((await admin('POST', `/treasury-transfers/${t2.body.id}/accept`)).status).toBe(409);
    const t3 = await send({ fromTreasuryId: br.egp, toTreasuryId: theirs.id, amountPiastres: 3_000 });
    const acc = await admin('POST', `/treasury-transfers/${t3.body.id}/accept`);
    expect(acc.status).toBe(201); expect(acc.body.status).toBe('accepted');
    expect((await api('GET', '/treasury-transfers?box=sent&status=accepted')).body.items.some((x: any) => x.id === t3.body.id)).toBe(true);
    const back = await admin('POST', '/treasury-transfers', { fromTreasuryId: theirs.id, toTreasuryId: br.egp, amountPiastres: 3_000 });
    expect(back.status).toBe(201);
    expect((await api('POST', `/treasury-transfers/${back.body.id}/accept`)).status).toBe(201);
  } finally {
    await api('DELETE', `/cash-movements/${dep.body.id}`);
    await br.drop();
  }
});

test('bank movements and bank transfers', { ...P, tags: ['api', 'money'] }, async () => {
  const api = await apiAs('superadmin'); const tag = stamp(); const br = await ownBranch(api, tag);
  const bank = await api('POST', '/banks', { bankName: `E2E Bank ${tag}` });
  const a1 = await api('POST', '/bank-accounts', { accountName: `E2E A1 ${tag}`, bankId: bank.body.id, commission: '1.25' });
  const a2 = await api('POST', '/bank-accounts', { accountName: `E2E A2 ${tag}`, bankId: bank.body.id });
  const bm: string[] = []; const bt: string[] = [];
  try {
    expect(a1.status).toBe(201); expect(a2.status).toBe(201);
    const m = { branchId: br.id, bankAccountId: a1.body.id, date: day(), note: `E2E ${tag}` };
    bad(await api('POST', '/bank-movements', { ...m, movementType: 'x', amount: 100 }));
    bad(await api('POST', '/bank-movements', { ...m, movementType: 'deposit', amount: 1.5 }));
    bad(await api('POST', '/bank-movements', { ...m, movementType: 'deposit', amount: 100, note: 'x'.repeat(251) }));
    bad(await api('POST', '/bank-movements', { ...m, movementType: 'deposit', amount: 100, bankAccountId: 'nope' }));
    const d = await api('POST', '/bank-movements', { ...m, movementType: 'deposit', amount: 20_000 });
    expect(d.status).toBe(201); bm.push(d.body.id);
    expect(d.body).toMatchObject({ amount: 20_000, movementType: 'deposit', bankAccountName: `E2E A1 ${tag}` });
    const w = await api('POST', '/bank-movements', { ...m, movementType: 'withdraw', amount: 5_000 });
    expect(w.status).toBe(201); bm.push(w.body.id);
    const t = { branchId: br.id, date: day(), fromAccountId: a1.body.id, toAccountId: a2.body.id, amount: 1_000, note: `E2E ${tag}` };
    bad(await api('POST', '/bank-transfers', { ...t, toAccountId: a1.body.id }));
    bad(await api('POST', '/bank-transfers', { ...t, amount: 0 }));
    bad(await api('POST', '/bank-transfers', { ...t, amount: 1.5 }));
    bad(await api('POST', '/bank-transfers', { ...t, note: 'x'.repeat(251) }));
    const tr = await api('POST', '/bank-transfers', t);
    expect(tr.status).toBe(201); bt.push(tr.body.id);
    expect(tr.body).toMatchObject({ amount: 1_000, fromAccountName: `E2E A1 ${tag}`, toAccountName: `E2E A2 ${tag}` });
    expect((await api('GET', `/bank-transfers?branchId=${br.id}`)).body.total).toBe(1);
    const user = await apiAs('e2euser');
    expect((await user('GET', '/bank-movements')).status).toBe(403);
    expect((await user('POST', '/bank-transfers', t)).status).toBe(403);
  } finally {
    for (const id of bt) await api('DELETE', `/bank-transfers/${id}`);
    for (const id of bm.reverse()) await api('DELETE', `/bank-movements/${id}`);
    for (const a of [a1, a2]) if (a.body?.id) await api('DELETE', `/bank-accounts/${a.body.id}`);
    if (bank.body?.id) await api('DELETE', `/banks/${bank.body.id}`);
    await br.drop();
  }
});

test('expense types, expenses and refunds', { ...P, tags: ['api', 'money'] }, async () => {
  const api = await apiAs('superadmin'); const tag = stamp(); const br = await ownBranch(api, tag);
  const bank = await api('POST', '/banks', { bankName: `E2E Bank ${tag}` });
  const acc = await api('POST', '/bank-accounts', { accountName: `E2E A ${tag}`, bankId: bank.body.id });
  const ex: string[] = []; const rf: string[] = [];
  bad(await api('POST', '/expense-types', { expenseTypeName: '' }));
  bad(await api('POST', '/expense-types', { expenseTypeName: 'x'.repeat(300) }));
  const et = await api('POST', '/expense-types', { expenseTypeName: `E2E Type ${tag}` });
  expect(et.status).toBe(201); expect(et.body).toMatchObject({ expenseTypeName: `E2E Type ${tag}`, deletedAt: null });
  expect((await api('POST', '/expense-types', { expenseTypeName: `E2E Type ${tag}` })).status).toBe(409);
  expect((await api('PATCH', `/expense-types/${et.body.id}`, { expenseTypeName: `E2E Type ${tag} v2` })).status).toBe(200);
  expect((await api('GET', `/expense-types/${et.body.id}`)).body.expenseTypeName).toBe(`E2E Type ${tag} v2`);
  try {
    const e = { date: day(), branchId: br.id, expenseTypeId: et.body.id, note: `E2E ${tag}`, cash: 2_500 };
    bad(await api('POST', '/expenses', { ...e, cash: 1.5 }));
    bad(await api('POST', '/expenses', { ...e, cash: -1 }));
    bad(await api('POST', '/expenses', { ...e, note: 'x'.repeat(251) }));
    bad(await api('POST', '/expenses', { ...e, expenseTypeId: 'nope' }));
    bad(await api('POST', '/expenses', { ...e, date: 'nope' }));
    const none = await api('POST', '/expenses', { ...e, cash: 0 });
    expect([400, 409]).toContain(none.status);
    const cash = await api('POST', '/expenses', e);
    expect(cash.status).toBe(201); ex.push(cash.body.id);
    expect(cash.body).toMatchObject({ cash: 2_500, total: 2_500, expenseTypeName: `E2E Type ${tag} v2` });
    const mixed = await api('POST', '/expenses', { ...e, bankAccountId: acc.body.id, bankAmount: 700 });
    expect(mixed.status).toBe(201); ex.push(mixed.body.id);
    expect(mixed.body).toMatchObject({ cash: 2_500, bankAmount: 700, total: 3_200 });
    expect((await api('GET', `/expenses?branchId=${br.id}`)).body.total).toBe(2);
    bad(await api('POST', '/expense-refunds', { ...e, cash: 1.5 }));
    const r = await api('POST', '/expense-refunds', { ...e, cash: 500 });
    expect(r.status).toBe(201); rf.push(r.body.id);
    expect(r.body).toMatchObject({ cash: 500, total: 500 });
    expect((await api('DELETE', `/expense-types/${et.body.id}`)).status).toBe(409);
    const user = await apiAs('e2euser');
    expect((await user('GET', '/expenses')).status).toBe(403);
    expect((await user('POST', '/expenses', e)).status).toBe(403);
    expect((await user('POST', '/expense-types', { expenseTypeName: 'nope' })).status).toBe(403);
    expect((await user('POST', '/expense-refunds', e)).status).toBe(403);
  } finally {
    for (const id of rf) await api('DELETE', `/expense-refunds/${id}`);
    for (const id of ex) await api('DELETE', `/expenses/${id}`);
    await api('DELETE', `/expense-types/${et.body.id}`);
    await api('DELETE', `/bank-accounts/${acc.body.id}`); await api('DELETE', `/banks/${bank.body.id}`);
    await br.drop();
  }
});

test('users: create, edit, delete, unlock, permission matrix, roles', { ...P, tags: ['api', 'money'] }, async () => {
  const api = await apiAs('superadmin'); const admin = await apiAs('e2eadmin'); const tag = stamp().toLowerCase();
  const u = { username: `e2e${tag}`, email: `e2e${tag}@example.com`, password: 'E2e-Temp-Pass-9876', userType: 'user', firstName: 'E2E', familyName: 'Temp', screens: ['system-codes/karats'], canUseTreasuries: false };
  let id = '';
  try {
    bad(await api('POST', '/users', { ...u, username: 'a' }));
    bad(await api('POST', '/users', { ...u, userType: 'boss' }));
    bad(await api('POST', '/users', { ...u, password: 'short' }));
    bad(await api('POST', '/users', { ...u, email: 'not-an-email' }));
    const c = await api('POST', '/users', u);
    expect(c.status).toBe(201); id = c.body.id;
    expect(c.body).toMatchObject({ username: u.username, userType: 'user', screens: ['system-codes/karats'], canUseTreasuries: false, locked: false, deletedAt: null });
    expect((await api('POST', '/users', { ...u, email: `o${u.email}` })).status).toBe(409);
    const me = await (await apiAs(u.username, u.password))('GET', '/access/me');
    expect(me.body.screens).toEqual(['system-codes/karats']);
    const e = await api('PATCH', `/users/${id}`, { ...u, screens: ['system-codes/karats', 'system-codes/gold-prices'], canUseTreasuries: true, firstName: 'Edited' });
    expect(e.status).toBe(200);
    expect(e.body).toMatchObject({ firstName: 'Edited', canUseTreasuries: true });
    expect(e.body.screens.sort()).toEqual(['system-codes/gold-prices', 'system-codes/karats']);
    bad(await api('PATCH', `/users/${id}`, { ...u, screens: ['no/such-screen'] }));
    for (let i = 0; i < 6; i++) await apiAs(u.username, 'Wrong-Pass-0000');
    expect((await api('GET', `/users/${id}`)).body.locked).toBe(true);
    expect((await api('POST', `/users/${id}/unlock`)).status).toBeLessThan(300);
    expect((await api('GET', `/users/${id}`)).body.locked).toBe(false);
    const user = await apiAs('e2euser');
    for (const [m, p] of [['GET', '/users'], ['POST', '/users'], ['PATCH', `/users/${id}`], ['DELETE', `/users/${id}`], ['POST', `/users/${id}/unlock`]] as const) expect((await user(m, p, m === 'GET' ? undefined : u)).status).toBe(403);
    expect((await admin('GET', '/users')).status).toBe(200);
    const mk = await admin('POST', '/users', { ...u, username: `e2es${tag}`, email: `s${u.email}`, userType: 'super_admin' });
    expect(mk.status).toBeGreaterThanOrEqual(400);
    if (mk.status < 300) await api('DELETE', `/users/${mk.body.id}`);
    expect((await api('DELETE', `/users/${id}`)).status).toBeLessThan(300);
    expect((await (await apiAs(u.username, u.password))('GET', '/access/me')).status).toBe(401);
    id = '';
  } finally { if (id) await api('DELETE', `/users/${id}`); }
});
