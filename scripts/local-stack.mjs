// Local test stack for the e2e suite: WSL Postgres (5433) + Redis (6391) and the backend from source's dist on 8100.
//   node scripts/local-stack.mjs up | down
// Nothing here touches the backend's own .env or any real server.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const backend = path.resolve(root, "../ge_erp_backend");
const pidFile = path.join(root, ".e2e-backend.pid");
const PORT = 8100, WEB = process.env.WEB_ORIGIN ?? "http://localhost:3100";
const env = {
  ...process.env,
  PORT: String(PORT), DASHBOARD_ORIGIN: WEB, API_PUBLIC_URL: `http://localhost:${PORT}`,
  BETTER_AUTH_SECRET: "e2e-local-secret-e2e-local-secret-0123456789",
  DATABASE_URL: "postgresql://ge:ge_e2e@localhost:5433/ge_erp_e2e", REDIS_URL: "redis://localhost:6391",
  ALLOWED_EMAIL_DOMAIN: "example.com", SUPER_ADMIN_USERNAME: "superadmin", SUPER_ADMIN_EMAIL: "superadmin@example.com",
  SUPER_ADMIN_PASSWORD: "E2e-Local-Pass-1234", SUPER_ADMIN_NAME: "E2E Super admin", ALLOW_DATA_RESET: "true",
};
const wsl = (cmd) => spawnSync("wsl", ["-d", "Ubuntu", "-u", "root", "--", "bash", "-lc", cmd], { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const keepFile = path.join(root, ".e2e-wsl.pid");
const alive = async () => { try { return (await fetch(`http://localhost:${PORT}/health`)).status < 500; } catch { return false; } };

if (process.argv[2] === "down") {
  if (existsSync(pidFile)) { spawnSync("taskkill", ["/PID", readFileSync(pidFile, "utf8"), "/T", "/F"]); rmSync(pidFile); }
  if (existsSync(keepFile)) { spawnSync("taskkill", ["/PID", readFileSync(keepFile, "utf8"), "/T", "/F"]); rmSync(keepFile); }
  wsl("service redis-server stop; service postgresql stop");
  console.log("stack down (run `wsl --shutdown` when no other session uses WSL)");
} else {
  // WSL stops its services when its last session ends: keep one session open while the stack is up
  if (!existsSync(keepFile)) { const k = spawn("wsl", ["-d", "Ubuntu", "-u", "root", "--", "sleep", "infinity"], { detached: true, stdio: "ignore" }); writeFileSync(keepFile, String(k.pid)); k.unref(); }
  console.log(wsl("service postgresql start; service redis-server start").stdout);
  if (!(await alive())) {
    const child = spawn(process.execPath, ["dist-e2e/main.js"], { cwd: backend, env, detached: true, stdio: ["ignore", "ignore", "ignore"] });
    writeFileSync(pidFile, String(child.pid)); child.unref();
    for (let i = 0; i < 60 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log((await alive()) ? `backend up on ${PORT}` : "backend did not start");
}
