// Own local backend for the Sales desk d2b e2e: worktrees/d2b-backend build on port 8110, database ge_erp_d2b on the NATIVE Windows Postgres (5441).
//   node scripts/desk-d2b-stack.mjs up | down
// Redis is the shared 6391 (never flushed). `down` stops this backend alone. The DB password is read from the main backend's .env, never stored here.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, openSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const backend = path.resolve(root, "../../worktrees/d2b-backend");
const pidFile = path.join(root, ".desk-d2b-backend.pid");
const PORT = 8110, WEB = "http://localhost:3110";
const dbPassword = /DATABASE_URL=postgresql:\/\/[^:]*:([^@]*)@/.exec(readFileSync(path.resolve(root, "../ge_erp_backend/.env"), "utf8"))[1];
export const DATABASE_URL = `postgresql://ge_erp:${dbPassword}@127.0.0.1:5441/ge_erp_d2b`;
const env = {
  ...process.env,
  PORT: String(PORT), DASHBOARD_ORIGIN: WEB, API_PUBLIC_URL: `http://localhost:${PORT}`,
  BETTER_AUTH_SECRET: "e2e-local-secret-e2e-local-secret-0123456789",
  DATABASE_URL, REDIS_URL: "redis://localhost:6391",
  ALLOWED_EMAIL_DOMAIN: "example.com", SUPER_ADMIN_USERNAME: "superadmin", SUPER_ADMIN_EMAIL: "superadmin@example.com",
  SUPER_ADMIN_PASSWORD: "E2e-Local-Pass-1234", SUPER_ADMIN_NAME: "E2E Super admin", ALLOW_DATA_RESET: "true",
};
const alive = async () => { try { return (await fetch(`http://localhost:${PORT}/health`)).status < 500; } catch { return false; } };

if (process.argv[2] === "down") {
  if (existsSync(pidFile)) { spawnSync("taskkill", ["/PID", readFileSync(pidFile, "utf8"), "/T", "/F"], { windowsHide: true }); rmSync(pidFile); }
  console.log("desk d2b backend down");
} else {
  if (!(await alive())) {
    const log = openSync(path.join(root, ".desk-d2b-backend.log"), "a");
    const child = spawn(process.execPath, ["dist/main.js"], { cwd: backend, env, detached: true, windowsHide: true, stdio: ["ignore", log, log] });
    writeFileSync(pidFile, String(child.pid)); child.unref();
    for (let i = 0; i < 60 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log((await alive()) ? `desk d2b backend up on ${PORT} (database ge_erp_d2b)` : "backend did not start");
}
