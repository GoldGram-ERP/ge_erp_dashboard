// Own local backend for the Sales desk work (issue #6): the che-168 backend build on port 8104, database ge_erp_sd.
//   node scripts/sales-desk-stack.mjs up | down
// It only starts WSL Postgres/Redis if they are down; `down` stops this backend alone, never the shared stack or WSL services.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const backend = path.resolve(root, "../../worktrees/sd-backend");
const pidFile = path.join(root, ".e2e-sd-backend.pid");
const keepFile = path.join(root, ".e2e-wsl.pid");
const PORT = 8104, WEB = process.env.SD_WEB_ORIGIN ?? "http://localhost:3104";
const sdEnv = {
  PORT: String(PORT), DASHBOARD_ORIGIN: WEB, API_PUBLIC_URL: `http://localhost:${PORT}`,
  BETTER_AUTH_SECRET: "e2e-local-secret-e2e-local-secret-0123456789",
  DATABASE_URL: "postgresql://ge:ge_e2e@localhost:5433/ge_erp_sd", REDIS_URL: "redis://localhost:6391",
  ALLOWED_EMAIL_DOMAIN: "example.com", SUPER_ADMIN_USERNAME: "superadmin", SUPER_ADMIN_EMAIL: "superadmin@example.com",
  SUPER_ADMIN_PASSWORD: "E2e-Local-Pass-1234", SUPER_ADMIN_NAME: "E2E Super admin", ALLOW_DATA_RESET: "true",
};
const wsl = (cmd) => spawnSync("wsl", ["-d", "Ubuntu", "-u", "root", "--", "bash", "-lc", cmd], { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const alive = async () => { try { return (await fetch(`http://localhost:${PORT}/health`)).status < 500; } catch { return false; } };

{
  if (process.argv[2] === "down") {
    if (existsSync(pidFile)) { spawnSync("taskkill", ["/PID", readFileSync(pidFile, "utf8"), "/T", "/F"]); rmSync(pidFile); }
    console.log("sales desk backend down (shared stack and WSL left running)");
  } else {
    // WSL stops its services when its last session ends: keep one session open (the shared stack's keeper if it exists)
    if (!existsSync(keepFile)) { const k = spawn("wsl", ["-d", "Ubuntu", "-u", "root", "--", "sleep", "infinity"], { detached: true, stdio: "ignore" }); writeFileSync(keepFile, String(k.pid)); k.unref(); }
    wsl("service postgresql start; service redis-server start");
    if (!(await alive())) {
      const child = spawn(process.execPath, ["dist/main.js"], { cwd: backend, env: { ...process.env, ...sdEnv }, detached: true, stdio: ["ignore", "ignore", "ignore"] });
      writeFileSync(pidFile, String(child.pid)); child.unref();
      for (let i = 0; i < 60 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 1000));
    }
    console.log((await alive()) ? `sales desk backend up on ${PORT} (database ge_erp_sd)` : "backend did not start");
  }
}
