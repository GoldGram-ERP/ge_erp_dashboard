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

// Two people must never cut the same version (owner, 2026-11-08). Before anything is bumped: look at what GitHub already has.
// Refuse while this branch is behind origin/main, and refuse when the next tag exists locally or on GitHub; the message says what to do.
const out = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
run("git", ["fetch", "origin", "--tags", "--force", "--quiet"]);
const behind = Number(out("git", ["rev-list", "--count", "HEAD..origin/main"]));
if (behind > 0) {
  console.error(`Not releasing: this branch is ${behind} commit(s) behind origin/main (someone pushed). Run \`git rebase origin/main\`, then \`npm run release\` again so the version follows the latest one on GitHub.`);
  process.exit(1);
}
const [maj, min, pat] = JSON.parse(readFileSync("package.json", "utf8")).version.split(".").map(Number);
const next = `v${maj}.${min}.${pat + 1}`;
if (out("git", ["tag", "-l", next]) || out("git", ["ls-remote", "--tags", "origin", next])) {
  console.error(`Not releasing: tag ${next} already exists (local or on GitHub). Pull the latest, check package.json matches the newest GitHub release, then try again.`);
  process.exit(1);
}

// One build a day (owner, 2026-11-10): Hostinger gets a build only at the end of the day, once the work is mature. A second release on the same
// calendar day (Cairo) is refused unless it is a hotfix the owner asked for: `npm run release -- --hotfix "why"`.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
const releasedToday = out("git", ["tag", "-l", "v*", "--format=%(creatordate:format-local:%Y-%m-%d) %(refname:short)"]).split("\n").filter((l) => l.startsWith(today));
const hot = process.argv.indexOf("--hotfix");
if (releasedToday.length > 0 && (hot < 0 || !process.argv[hot + 1] || process.argv[hot + 1].startsWith("--"))) {
  console.error(`Not releasing: ${releasedToday.map((l) => l.split(" ")[1]).join(", ")} already went out today. One build a day: ship again tomorrow, or run \`npm run release -- --hotfix "reason"\` only when the owner asked for it.`);
  process.exit(1);
}

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
console.log(`Next: git push origin HEAD:main --follow-tags, then npm run release:publish (creates the GitHub release v${version} beside the tag).`);
