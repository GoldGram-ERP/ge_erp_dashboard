// Builds messages/ar.json and messages/en.json: one namespace per file of the old dashboard's message folders, plus the new app's own (app-messages.mjs).
//   node scripts/gen-messages.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP } from "./app-messages.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../../ge_erp_dashboard_deprecated/src/messages");
mkdirSync(path.join(here, "../messages"), { recursive: true });
for (const [i, lang] of ["ar", "en"].entries()) {
  const out = {};
  for (const f of readdirSync(path.join(root, lang)).filter((x) => x.endsWith(".json"))) out[f.replace(".json", "")] = JSON.parse(readFileSync(path.join(root, lang, f), "utf8"));
  for (const [dotted, pair] of Object.entries(APP)) {
    const parts = dotted.split(".");
    let o = out;
    parts.slice(0, -1).forEach((p) => (o = o[p] ??= {}));
    o[parts.at(-1)] = pair[i];
  }
  writeFileSync(path.join(here, `../messages/${lang}.json`), JSON.stringify(out, null, 1) + "\n");
}
console.log("messages/ar.json + en.json written");
