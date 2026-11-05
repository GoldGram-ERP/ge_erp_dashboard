// Dry build of the deploy archive: unzips it to a temp folder and runs the same install + build the host runs (npm ci, npm run build).
//   node scripts/pack-check.mjs [app-<version>.zip]     (defaults to the zip for the package version)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const zip = resolve(process.argv[2] ?? join(root, `app-${version}.zip`));
if (!existsSync(zip)) { console.error(`No ${zip}. Run: npm run pack:hostinger`); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), "pack-check-"));
if (process.platform === "win32") execFileSync("powershell", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zip}','${dir}')`], { stdio: "inherit" });
else execFileSync("unzip", ["-q", zip, "-d", dir], { stdio: "inherit" });

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args) => execFileSync(npm, args, { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
run(["ci"]);
run(["run", "build"]);
console.log(`pack-check ok: ${zip} builds from a clean unzip (${dir})`);
