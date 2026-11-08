// Creates the GitHub Release for the current version, beside its tag (owner, 2026-11-08): the Releases page is where everyone sees the newest version.
// Run after `git push origin HEAD:main --follow-tags`. The notes are this version's "What's new" lines (English).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${version}`;
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

if (!out("git", ["ls-remote", "--tags", "origin", tag])) { console.error(`Tag ${tag} is not on GitHub yet: push first (git push origin HEAD:main --follow-tags).`); process.exit(1); }
const entry = JSON.parse(readFileSync("changelog/changelog.json", "utf8")).find((e) => e.version === version);
const notes = entry ? entry.changes.map((c) => `- ${c.kind}: ${c.en}`).join(String.fromCharCode(10)) : "No user-visible changes.";
run("gh", ["release", "create", tag, "--verify-tag", "--title", tag, "--notes", notes]);
