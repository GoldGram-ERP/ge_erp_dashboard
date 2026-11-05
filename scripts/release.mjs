// A new build gets a new version: 0.3.0, 0.3.1, 0.3.2, and on.
//
// Run this before packaging a deploy: it moves the last part up by one (0.0.1), commits the
// new number, and prints it. The bump happens here, on the machine that ships the build, not
// on the host, so the number that users see is a commit that exists.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { load, save, stampNext } from "./changelog.mjs";

// A .cmd needs a shell on Windows, and the shell must not be PowerShell's npm.ps1, which a
// machine may refuse to run under its execution policy.
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
// npm is npm.ps1 in a PowerShell terminal, which a machine may refuse to run under its
// execution policy; cmd + npm.cmd starts npm.cmd directly.
const runNpm = (args) =>
  process.platform === "win32"
    ? run("cmd", ["/c", "npm.cmd", ...args])
    : run("npm", args);

const skipLog = process.argv.includes("--skip-changelog");
if (!skipLog) stampNext(load(), "0.0.0", ""); // refuse before any bump when there are no lines
runNpm(["version", "patch", "--no-git-tag-version"]);
const { version } = JSON.parse(readFileSync("package.json", "utf8"));

// "What's new": the unreleased lines become this version (a release with none is refused, unless --skip-changelog).
const files = ["package.json", "package-lock.json"];
if (!skipLog) { save(stampNext(load(), version, new Date().toISOString().slice(0, 10))); files.push("changelog/changelog.json"); }
run("git", ["add", ...files]);
run("git", ["commit", "-q", "-m", `Version ${version}`]);
// The release commit is tagged v<version>: pack-hostinger.mjs only packs a commit that carries exactly this tag,
// so no build goes out without its bump (0.0.1 per build).
run("git", ["tag", "-a", `v${version}`, "-m", `Version ${version}`]);

console.log(version);
