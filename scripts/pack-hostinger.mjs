// Packs the dashboard source for the Hostinger Node.js build and stamps the commit inside it.
//
// The host builds an archive with no git history, so it cannot know which commit it is building.
// This writes build-info.json into the archive, and scripts/set-version.mjs reads it there, so the
// version a user sees on the site carries the real commit of the branch the build came from:
//
//   node scripts/pack-hostinger.mjs [out.zip]
//
// A dirty tree is refused: a build must name a commit, or the number after the plus means nothing.
// Pass --allow-dirty to pack anyway, and the stamp then ends in -dirty.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const allowDirty = args.includes("--allow-dirty");
const out = resolve(args.find((a) => !a.startsWith("--")) ?? join(root, "app.zip"));

const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const commit = git(["rev-parse", "--short", "HEAD"]);
const dirty = git(["status", "--porcelain"]) !== "";

if (dirty && !allowDirty) {
  console.error("The tree has uncommitted changes. Commit them, or pass --allow-dirty.");
  process.exit(1);
}

// Only source: the host installs and builds it. No node_modules, no .next, no .env*, no .git.
const files = [
  "src",
  "scripts",
  "public",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "tsconfig.json",
  "postcss.config.mjs",
  "next-env.d.ts",
  "eslint.config.mjs",
  "messages",
];

const stage = join(root, ".pack");
rmSync(stage, { recursive: true, force: true });
for (const file of files) {
  const from = join(root, file);
  if (existsSync(from)) cpSync(from, join(stage, file), { recursive: true });
}

const { version } = JSON.parse(execFileSync(process.execPath, ["-p", "JSON.stringify(require('./package.json'))"], { cwd: root, encoding: "utf8" }));
writeFileSync(
  join(stage, "build-info.json"),
  JSON.stringify({ version, branch, commit, dirty, packedAt: new Date().toISOString() }, null, 2) + "\n",
);

rmSync(out, { force: true });
if (process.platform === "win32") {
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${stage}','${out}')`,
  ], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", "-q", out, "."], { cwd: stage, stdio: "inherit" });
}

rmSync(stage, { recursive: true, force: true });
console.log(`${out}  ${version}+${commit}${dirty ? "-dirty" : ""}  (${branch}, ${Math.round(statSync(out).size / 1024)} KB)`);
