// Seeds one user per role on the local test database: e2eadmin (Admin), e2euser (User). The Super admin comes from the backend's own start-up.
//   node scripts/seed-users.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";

const backend = path.resolve(import.meta.dirname, "../../../worktrees/e2e-backend");
const env = { ...process.env, DATABASE_URL: "postgresql://ge:ge_e2e@localhost:5433/ge_erp_e2e", REDIS_URL: "redis://localhost:6391",
  BETTER_AUTH_SECRET: "e2e-local-secret-e2e-local-secret-0123456789", ALLOWED_EMAIL_DOMAIN: "example.com", API_PUBLIC_URL: "http://localhost:8100", DASHBOARD_ORIGIN: "http://localhost:3100", PORT: "8100" };
for (const [u, name] of [["e2eadmin", "E2E Admin"], ["e2euser", "E2E User"]]) {
  const r = spawnSync(process.execPath, ["dist/modules/access/create-user.cli.js", u, `${u}@example.com`, "E2e-Local-Pass-1234", name], { cwd: backend, env, encoding: "utf8" });
  console.log((r.stdout + r.stderr).trim().split("\n").slice(-2).join(" | "));
}
const sql = `UPDATE "user" SET user_type='admin' WHERE username='e2eadmin';`;
const p = spawnSync("wsl", ["-d", "Ubuntu", "-u", "postgres", "--", "psql", "-p", "5433", "-d", "ge_erp_e2e", "-c", sql], { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
console.log((p.stdout + p.stderr).trim());
