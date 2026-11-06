import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLibraryFile, scanSource, type Rule } from "./ui-scan";

// Seeded recall: each defect class is injected into otherwise clean source text; the scanner must report exactly that rule.
const clean = `import { Button } from "@/components/ui";\nexport const Ok = () => <Button tone="primary">Save</Button>;\n`;
const seeds: [string, string, Rule][] = [
  ["raw table", `<table><tr><td>1</td></tr></table>`, "T1"],
  ["raw button", `<button onClick={go}>Save</button>`, "T1"],
  ["hard-coded colour", `<Badge className="x" data-c="#ff0000" />`, "C1"],
  ["inline px width", `<Input width="300px" />`, "C1"],
  ["inline style prop", `<div style={{ display: "flex" }} />`, "U1"],
];

describe("scanner recall (seeded defects)", () => {
  it("catches every seeded defect class with the right rule", () => {
    const caught = seeds.filter(([, snippet, rule]) => scanSource("src/things/x.tsx", clean + snippet + "\n")[rule] > scanSource("src/things/x.tsx", clean)[rule]);
    expect(caught.map((s) => s[0])).toEqual(seeds.map((s) => s[0])); // 5/5
  });

  it("catches a hard-coded size and colour in css, and a screen-specific class family", () => {
    const css = `.deskx-bar { width: 520px; color: #123456; }\n:root { --h: 32px; }\n`;
    expect(scanSource("src/things/x.css", css)).toEqual({ U1: 1, T1: 0, C1: 2 });
  });

  it("clean source gives zero hits (no false positive), including comments and tokens", () => {
    expect(scanSource("src/things/x.tsx", clean + "// 12px note #fff <button>\n")).toEqual({ U1: 0, T1: 0, C1: 0 });
    expect(scanSource("src/app/globals.css", ":root { --a: 12px; --b: #fff; }\n")).toEqual({ U1: 0, T1: 0, C1: 0 });
  });

  it("library files are exempt, and real screens that use only the library scan clean", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    expect(["src/components/ui/Button.tsx", "src/components/fields/Select.tsx", "src/components/engine/ui.tsx"].every(isLibraryFile)).toBe(true);
    expect(isLibraryFile("src/components/engine/Table.tsx")).toBe(false);
    const base = JSON.parse(readFileSync(path.join(import.meta.dirname, "ui-baseline.json"), "utf8"));
    const cleanScreens = readdirSync(path.join(root, "src/things")).filter((f) => f.endsWith(".tsx") && !base[`src/things/${f}`]);
    expect(cleanScreens.length).toBeGreaterThan(3);
    for (const f of cleanScreens) expect(scanSource(`src/things/${f}`, readFileSync(path.join(root, "src/things", f), "utf8")), f).toEqual({ U1: 0, T1: 0, C1: 0 });
  });
});
