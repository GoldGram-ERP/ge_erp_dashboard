// The "What's new" changelog, kept as data in changelog/changelog.json (newest first). Nobody edits the file by hand or the TS:
//   node scripts/changelog.mjs add --kind new|better|fixed --en "..." --ar "..." [--route /menu/address]
//     adds a line to the unreleased block (version "next"), which sits first in the file;
//   node scripts/changelog.mjs check    validates the file (the release runs it);
//   release.mjs stamps "next" with the new version and today's date (stampNext), so a release without a line is refused.
// Write for the person who runs the shop: what they can now do, and where. The Arabic line is ALWAYS Egyptian colloquial (masri: "بقى بيعمل", "النهارده", "مش", "اللي", "دلوقتي"), never Modern Standard or Gulf/Saudi Arabic (owner, 2026-11-05). `route` is a menu address; no route = no button.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FILE = new URL("../changelog/changelog.json", import.meta.url);
const ARABIC = /[؀-ۿ]/;
export const KINDS = ["new", "better", "fixed"];

export const load = () => JSON.parse(readFileSync(FILE, "utf8"));
export const save = (data) => writeFileSync(FILE, JSON.stringify(data, null, 1) + "\n");

// Every problem of one line, as text; empty when it is fine.
export function problemsOfChange(c) {
  const p = [];
  if (!KINDS.includes(c.kind)) p.push(`kind must be ${KINDS.join("|")}`);
  if (typeof c.en !== "string" || c.en.trim().length < 10) p.push("en is too short");
  else if (ARABIC.test(c.en)) p.push("en has Arabic letters");
  if (typeof c.ar !== "string" || !ARABIC.test(c.ar)) p.push("ar has no Arabic letters");
  if (c.route !== undefined && !(typeof c.route === "string" && c.route.startsWith("/"))) p.push("route must start with /");
  return p;
}

export function addChange(data, change) {
  const p = problemsOfChange(change);
  if (p.length) throw new Error(p.join("; "));
  if (data[0]?.version !== "next") data.unshift({ version: "next", changes: [] });
  data[0].changes.push(change.route ? change : { kind: change.kind, en: change.en, ar: change.ar });
  return data;
}

// The release: "next" becomes the version just cut. Refuses when there is nothing to say.
export function stampNext(data, version, date) {
  if (data[0]?.version !== "next" || data[0].changes.length === 0)
    throw new Error('No changelog lines for this release: run `node scripts/changelog.mjs add ...` first (or `--skip-changelog` on the release when no one sees the change).');
  data[0] = { version, date, changes: data[0].changes };
  return data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = (n) => { const i = rest.indexOf(`--${n}`); return i < 0 ? undefined : rest[i + 1]; };
  if (cmd === "add") {
    const change = { kind: arg("kind"), en: arg("en"), ar: arg("ar"), ...(arg("route") ? { route: arg("route") } : {}) };
    save(addChange(load(), change));
    console.log("added to the next release");
  } else if (cmd === "check") {
    const bad = load().flatMap((r) => r.changes.flatMap((c) => problemsOfChange(c).map((x) => `${r.version}: ${x}`)));
    if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
    console.log("changelog ok");
  } else { console.error("usage: add --kind --en --ar [--route] | check"); process.exit(2); }
}
