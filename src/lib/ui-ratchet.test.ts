import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLibraryFile, scanSource, type Counts } from "./ui-scan";

// Ratchet for U1 / T1 / C1 over ALL of src (screens, engine, shell, css), complementing library-ratchet.test.ts (screens only). Per-file counts in
// ui-baseline.json may only go down: `UPDATE_BASELINE=1 npx vitest run ui-ratchet` lowers them, never raises them. A new file with hits fails.
const root = path.resolve(import.meta.dirname, "../..");
const baselineFile = path.join(import.meta.dirname, "ui-baseline.json");

const walk = (dir: string): string[] =>
  readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : /\.(?:tsx|css)$/.test(name) ? [rel] : [];
  });

export const scanTree = (): Record<string, Counts> =>
  Object.fromEntries(
    walk("src")
      .filter((f) => !isLibraryFile(f))
      .map((f) => [f, scanSource(f, readFileSync(path.join(root, f), "utf8"))] as const)
      .filter(([, c]) => c.U1 + c.T1 + c.C1 > 0),
  );

describe("UI ratchet (U1 bespoke, T1 raw tags, C1 hard-coded size/colour)", () => {
  it("no file's count rises and no new file brings hits", () => {
    const current = scanTree();
    if (process.env.UPDATE_BASELINE === "1") {
      const old: Record<string, Counts> = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : {};
      const next = Object.fromEntries(
        Object.entries(current).map(([f, c]) => [f, Object.fromEntries((["U1", "T1", "C1"] as const).map((r) => [r, Math.min(c[r], old[f]?.[r] ?? c[r])]))]),
      );
      writeFileSync(baselineFile, JSON.stringify(next, null, 1) + "\n");
    }
    const base: Record<string, Counts> = JSON.parse(readFileSync(baselineFile, "utf8"));
    const over = Object.entries(current).flatMap(([f, c]) =>
      (["U1", "T1", "C1"] as const).flatMap((r) => (c[r] > (base[f]?.[r] ?? 0) ? [`${f}: ${r} ${c[r]} (baseline ${base[f]?.[r] ?? 0}). Use the library component in @/components/ui or a token.`] : [])),
    );
    expect(over).toEqual([]);
  });
});
