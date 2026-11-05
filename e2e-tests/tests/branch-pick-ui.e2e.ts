import { afterAll } from 'e2e';
import { test, expect, apiAs, signInApi, stamp, LANGS, M, PASSWORD, MAIN_BRANCH, API, WEB } from './lib.ts';

// Who picks the branch on a form (the owner, 2026-11-05): the Super admin has none of their own and names one,
// with the refusal under the branch box; an Admin starts on their own branch and may pick another.
const H = { 'content-type': 'application/json', origin: WEB };
let admin: { username: string; id: string } | undefined;
let superApi: Awaited<ReturnType<typeof apiAs>>;

// An Admin of Main branch, past the forced first password change, signing in with the test password.
async function adminOfMain() {
  superApi ??= await apiAs('superadmin');
  const username = `e2esw${stamp()}`.toLowerCase();
  const temp = `Temp-${PASSWORD}`;
  const made = await superApi('POST', '/users', { branchId: MAIN_BRANCH, username, email: `${username}@example.com`, userType: 'admin', password: temp });
  if (made.status !== 201) throw new Error(`admin not made ${made.status} ${JSON.stringify(made.body)}`);
  const s = await signInApi(username, temp);
  const changed = await fetch(`${API}/access/forced-password-change`, { method: 'POST', headers: { ...H, cookie: s.cookie, 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ newPassword: PASSWORD }) });
  if (changed.status >= 300) throw new Error(`password not changed ${changed.status} ${await changed.text()}`);
  return { username, id: made.body.id as string };
}

const branchBox = (browser: any) => browser.locator('#ws [data-k=branchId] [role=combobox]');

for (const lang of LANGS) {
  test(`branch pick (${lang}): the Super admin names the branch, an Admin starts on their own and may pick another`, { tags: ['e2e', 'branch'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    // Super admin, purchase invoice: an empty branch box, Save refused under it.
    await go('superadmin', '/buy/purchases?new=create', lang);
    await expect(branchBox(browser)).toBeVisible();
    await browser.locator('#ws #inv-save').tap();
    await expect(browser.locator('#ws [data-k=branchId] .err')).toContainText(M(lang, 'gold-accounts', 'purchaseInvoices.branchRequired'));
    await shot(`branch-${lang}-1-superadmin-purchase-names-branch`);

    // Super admin, sales invoice and stock count: the branch box is there to pick from.
    await go('superadmin', '/sales/invoices?new=create', lang);
    await expect(branchBox(browser)).toBeVisible();
    await shot(`branch-${lang}-2-superadmin-sale-branch-box`);

    // Admin of Main branch: purchase and sales invoice start on Main branch, and another branch can be picked.
    admin ??= await adminOfMain();
    for (const path of ['/buy/purchases?new=create', '/sales/invoices?new=create']) {
      await go(admin.username as never, path, lang);
      await expect(branchBox(browser)).toContainText('Main branch');
      await branchBox(browser).tap();
      await expect.poll(() => browser.evaluate(() => [...document.querySelectorAll('[role=option]')].filter((o) => !o.textContent?.includes('Main branch')).length)).toBeGreaterThan(0);
      await shot(`branch-${lang}-3-admin-${path.includes('buy') ? 'purchase' : 'sale'}-own-branch-and-others`);
    }
    await go(admin.username as never, '/expenses/expenses?new=createExpense', lang);
    await expect(branchBox(browser)).toContainText('Main branch');
    await shot(`branch-${lang}-4-admin-expense-own-branch`);
  });
}

afterAll(async () => { if (admin) await superApi('DELETE', `/users/${admin.id}`); });
