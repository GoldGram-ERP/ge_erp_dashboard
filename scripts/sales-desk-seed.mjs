// Seeds the Sales desk backend (port 8104, database ge_erp_sd) through its real API. Safe to run again.
//   node scripts/sales-desk-seed.mjs        (the stack must be up: node scripts/sales-desk-stack.mjs up)
// Users (password PASSWORD below, except superadmin): superadmin, deskfull (Admin, every screen, makes the stock),
// agent1 + agent2 (User, branch set, ONLY the desk screen), deskadmin (Admin, ONLY the desk screen).
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const API = "http://localhost:8104", ORIGIN = "http://localhost:3104";
const PASSWORD = "Correct-Horse-9", DESK = "gold-sales/sales-desk", SELL = 512_550, UNIT = 1_000_000;
const root = { username: "superadmin", email: "superadmin@example.com", password: "E2e-Local-Pass-1234" };

const sql = (q) => {
  const r = spawnSync("wsl", ["-d", "Ubuntu", "-u", "postgres", "--", "psql", "-p", "5433", "-d", "ge_erp_sd", "-tA", "-c", q], { windowsHide: true, encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
const call = async (method, path, cookie, body) => {
  const res = await fetch(API + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: ORIGIN, ...(method === "GET" ? {} : { "Idempotency-Key": randomUUID() }), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = text; try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, cookies: res.headers.getSetCookie() };
};
const must = (r, what) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const signIn = async (email, password) => {
  const r = await call("POST", "/access/sign-in", null, { email, password });
  return r.status === 200 ? r.cookies.map((c) => c.split(";")[0]).join("; ") : null;
};

const rootCookie = await signIn(root.email, root.password);
if (!rootCookie) throw new Error("superadmin sign-in failed: is the stack up?");
const list = async (path, cookie) => (await call("GET", path, cookie)).body.items ?? [];

// users: the admin first (a branch needs its Admin), then the branch, then the rest
const makeUser = async (username, firstName, extra) => {
  if (await signIn(`${username}@example.com`, PASSWORD)) return;
  const made = must(await call("POST", "/users", rootCookie, { username, email: `${username}@example.com`, firstName, familyName: "Seed", password: PASSWORD, ...extra }), `user ${username}`);
  sql(`UPDATE "user" SET must_change_password=false WHERE id='${made.id}'`);
};
let branchId = sql(`SELECT id FROM branch WHERE branch_name='Desk branch' AND deleted_at IS NULL LIMIT 1`);
if (!branchId) {
  // the backend's own command line makes the first Admin (a user needs a branch, a branch needs an Admin), as scripts/seed-users.mjs does
  const cli = spawnSync(process.execPath, ["dist/modules/access/create-user.cli.js", "deskfull", "deskfull@example.com", PASSWORD, "Desk full"], { windowsHide: true, cwd: new URL("../../../worktrees/sd-backend", import.meta.url), encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://ge:ge_e2e@localhost:5433/ge_erp_sd", REDIS_URL: "redis://localhost:6391", BETTER_AUTH_SECRET: "e2e-local-secret-e2e-local-secret-0123456789", ALLOWED_EMAIL_DOMAIN: "example.com", API_PUBLIC_URL: API, DASHBOARD_ORIGIN: ORIGIN, PORT: "8104", SUPER_ADMIN_USERNAME: root.username, SUPER_ADMIN_EMAIL: root.email, SUPER_ADMIN_PASSWORD: root.password } });
  if (cli.status !== 0) throw new Error(cli.stderr);
  sql(`UPDATE "user" SET user_type='admin', must_change_password=false WHERE username='deskfull'`);
  const adminId = sql(`SELECT id FROM "user" WHERE username='deskfull'`);
  branchId = must(await call("POST", "/branches", rootCookie, { branchName: "Desk branch", adminUserId: adminId }), "branch").id;
  sql(`UPDATE "user" SET branch_id='${branchId}' WHERE id='${adminId}'`); // shortcut: the Users form would do this
}
await makeUser("agent1", "Agent One", { userType: "user", branchId, screens: [DESK], canGiveCashDiscount: true });
await makeUser("agent2", "Agent Two", { userType: "user", branchId, screens: [DESK] });
await makeUser("deskadmin", "Desk Admin", { userType: "admin", branchId, screens: [DESK] });

const admin = await signIn("deskfull@example.com", PASSWORD);
// gold price for today (the latest saved set is the one in force)
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
if (!sql(`SELECT 1 FROM gold_price_set WHERE date='${today}' LIMIT 1`)) must(await call("POST", "/gold-prices", admin, { date: today, sellPrice: SELL, buyPrice: SELL, silverPrice: 5000 }), "gold price");

let category = (await list("/categories?search=Desk%20category", admin)).find((c) => c.categoryName === "Desk category")?.id;
category ??= must(await call("POST", "/categories", admin, { categoryName: "Desk category" }), "category").id;
const item = async (name, karat, mg) => {
  let id = (await list(`/items?search=${encodeURIComponent(name)}`, admin)).find((i) => i.itemName === name)?.id;
  id ??= must(await call("POST", "/items", admin, { itemName: name, isCoded: true, itemType: "gold", categoryId: category, karat, weight: mg, workmanshipMode: "per_gram", workmanshipValue: "300.00", cashbackMode: "per_gram", cashbackValue: "10.00" }), name).id;
  return id;
};
const ring = await item("Desk ring", "21", 5000), chain = await item("Desk chain 18", "18", 3000);
const half = await item("Desk half item", "21", 2000), off = await item("Desk inactive item", "21", 2000);
sql(`UPDATE item SET workmanship_mode=NULL, workmanship_value=NULL WHERE id='${half}'`); // incomplete
sql(`UPDATE item SET is_active=false WHERE id='${off}'`); // inactive

let bankId = (await list("/banks?search=Desk%20bank", admin)).find((b) => b.bankName === "Desk bank")?.id;
bankId ??= must(await call("POST", "/banks", admin, { bankName: "Desk bank" }), "bank").id;
let accountId = (await list("/bank-accounts?search=Desk%20account", admin)).find((b) => b.accountName === "Desk account")?.id;
accountId ??= must(await call("POST", "/bank-accounts", admin, { accountName: "Desk account", bankId }), "bank account").id;

// three coded pieces of the ring for the Admin to scan (only when none is unsold)
const unsold = sql(`SELECT piece_code FROM piece WHERE item_id='${ring}' AND sales_invoice_id IS NULL ORDER BY piece_code`).split("\n").filter(Boolean);
let codes = unsold;
if (codes.length < 3) {
  const purchase = must(await call("POST", "/purchase-invoices", admin, { date: today, lines: [{ itemId: ring, quantity: 3 }] }), "purchase");
  const coding = must(await call("GET", `/purchase-coding/invoices/${purchase.id}`, admin), "coding");
  const coded = must(await call("POST", `/purchase-coding/invoices/${purchase.id}`, admin, { lines: [{ lineId: coding.lines[0].lineId, pieces: Array.from({ length: 3 }, () => ({ tagPrice: UNIT, salePrice: 1 })) }] }), "code pieces");
  codes = coded.lines[0].pieces.map((p) => p.pieceCode);
}
console.log(JSON.stringify({ api: API, branchId, ring, chain, half, off, bankAccountId: accountId, pieceCodes: codes, users: { agent1: "agent1@example.com", agent2: "agent2@example.com", deskadmin: "deskadmin@example.com", deskfull: "deskfull@example.com", password: PASSWORD, superadmin: root.email + " / " + root.password } }, null, 1));
