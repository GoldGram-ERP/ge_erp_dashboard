import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The single component library (owner rule, 2026-11-05): every control and component is inherited from src/components/ui, and a variant is a
// prop on a library component. Screens (src/things, src/app) never define a raw control, a one-off component or a style of their own.
// This test is a ratchet: today's counts per file are the baseline, a count may go DOWN (run `UPDATE_BASELINE=1 npx vitest run library-ratchet`
// to lower the baseline) but never UP, and a file with no baseline entry may not add any. The zero rules below have no baseline at all.

const root = path.resolve(import.meta.dirname, "../../..");
const baselineFile = path.join(import.meta.dirname, "library-baseline.json");
const screens = ["src/things", "src/app"];

const walk = (dir: string): string[] =>
  readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : /\.tsx$/.test(name) && !/\.test\./.test(name) ? [rel] : [];
  });

const files = screens.flatMap(walk).sort();
const read = (f: string) => readFileSync(path.join(root, f), "utf8");
const count = (t: string, re: RegExp) => (t.match(re) ?? []).length;

// Counted with a baseline (the work of moving them into the library is staged; the numbers only go down).
const ratchet: Record<string, RegExp> = {
  rawInput: /<input\b/g,
  rawButton: /<button\b/g,
  rawTable: /<(?:table|th|td)\b/g,
  inlineStyle: /style=\{\{/g,
  localComponent: /^(?:export )?(?:const|function) [A-Z][A-Za-z0-9]*\b(?: ?=|\()/gm,
};
// Never allowed in a screen: these exist only as library components.
const forbidden: Record<string, RegExp> = {
  "a raw checkbox or radio (use Checkbox / CheckInput from @/components/ui)": /<input\b[^>]*type="(?:checkbox|radio)"/g,
  'a raw switch (use SwitchInput from @/components/ui)': /role="switch"/g,
  "a raw <select> (use Select from @/components/ui)": /<select\b/g,
  "a raw <textarea> (use Textarea from @/components/ui)": /<textarea\b/g,
  "a native <dialog> (use Sheet / ConfirmDialog from @/components/ui)": /<dialog\b/g,
  "a native <details> (use Disclosure from @/components/ui)": /<details\b/g,
  "a raw file input (use FileInput from @/components/ui)": /type="file"/g,
  "a native date/time/color/range input (use DatePicker or add the component to the library)": /type="(?:date|time|datetime-local|month|week|color|range)"/g,
  "window.confirm / alert (use useConfirm / toast from @/components/ui)": /\bwindow\.(?:confirm|alert)\(|\balert\(/g,
};

// No exceptions: every raw control the library provides has been moved into it. Never add one here; add the component to src/components/ui instead.
const legacy: Record<string, string> = {};

const current = Object.fromEntries(files.map((f) => [f, Object.fromEntries(Object.entries(ratchet).map(([k, re]) => [k, count(read(f), re)]))]));

describe("one component library", () => {
  it("the library folder is the single entry point", () => {
    expect(existsSync(path.join(root, "src/components/ui/index.ts"))).toBe(true);
  });

  it("no screen holds a raw control the library already provides", () => {
    const hits = files.flatMap((f) => Object.entries(forbidden).flatMap(([why, re]) => (count(read(f), re) && legacy[f] !== why ? [`${f}: ${why}`] : [])));
    expect(hits).toEqual([]);
  });

  it("no screen adds a raw control, an inline style or a local component (counts only go down)", () => {
    if (process.env.UPDATE_BASELINE === "1") {
      const old: Record<string, Record<string, number>> = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : {};
      const next: Record<string, Record<string, number>> = {};
      for (const [f, m] of Object.entries(current)) {
        const kept = Object.fromEntries(Object.entries(m).map(([k, n]) => [k, Math.min(n, old[f]?.[k] ?? n)]).filter(([, n]) => (n as number) > 0));
        if (Object.keys(kept).length) next[f] = kept as Record<string, number>;
      }
      writeFileSync(baselineFile, JSON.stringify(next, null, 1) + "\n");
    }
    const base: Record<string, Record<string, number>> = JSON.parse(readFileSync(baselineFile, "utf8"));
    const over = Object.entries(current).flatMap(([f, m]) =>
      Object.entries(m).flatMap(([k, n]) => ((base[f]?.[k] ?? 0) < n ? [`${f}: ${k} ${n} (baseline ${base[f]?.[k] ?? 0}). Use a component from @/components/ui, or add the variant there.`] : [])),
    );
    expect(over).toEqual([]);
  });
});
