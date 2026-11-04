// Stamps the production build flags into .env.production.local before `next build`, so they
// are baked into the client bundle on every build:
//   NEXT_PUBLIC_APP_VERSION  the dashboard version (package.json, or APP_VERSION) plus the
//                            commit it was built from, e.g. 0.3.0+9a7678a (or +9a7678a-dirty)
// The file is gitignored. A flag already in the environment is left for the environment to win.
//
// The version is the release number: 0.3.0 for the cash-discount release, and every feature
// after it adds one to the last part (0.3.1, 0.3.2), with `npm run version:bump` doing it.
// The commit suffix is not a release number; it says which code the running page came from,
// so two builds of the same release can still be told apart.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const release = process.env.APP_VERSION || JSON.parse(readFileSync("package.json", "utf8")).version;
const sha = git(["rev-parse", "--short", "HEAD"]);
const dirty = sha && git(["status", "--porcelain"]) !== "";

// The host builds an archive with no git history. scripts/pack-hostinger.mjs writes which commit
// it packed into build-info.json, so the build that lands there still names its commit.
let packed = null;
try {
  packed = JSON.parse(readFileSync("build-info.json", "utf8"));
} catch {
  // not a packed archive: a local build
}

const stamp = sha ? `${sha}${dirty ? "-dirty" : ""}` : packed ? `${packed.commit}${packed.dirty ? "-dirty" : ""}` : "";
const version = stamp ? `${release}+${stamp}` : release;

const wanted = {
  NEXT_PUBLIC_APP_VERSION: version,
};

let existing = "";
try {
  existing = readFileSync(".env.production.local", "utf8");
} catch {
  // no file yet
}
const keys = Object.keys(wanted);
const kept = existing
  .split(/\r?\n/)
  .filter((l) => l && !keys.some((k) => l.startsWith(k + "=")));
const stamped = keys.map((k) => `${k}=${wanted[k]}`);
writeFileSync(".env.production.local", [...kept, ...stamped, ""].join("\n"));
console.log(`dashboard ${version}`);
