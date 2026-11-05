import { describe, expect, it } from "vitest";
import { code6 } from "./code6";

describe("code6 (a document number as six digits)", () => {
  it("pads a number and leaves a missing one blank (never 00null)", () => {
    expect(code6(42)).toBe("000042");
    expect(code6("000042")).toBe("000042");
    expect(code6(null)).toBe("");
    expect(code6(undefined)).toBe("");
    expect(code6("")).toBe("");
  });
});

// One source: no screen writes its own six-digit padding (a copy once printed "00null" for a missing number). Only src/lib/code6.ts pads.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const f = path.join(dir, n); return statSync(f).isDirectory() ? walk(f) : /\.(tsx?|mjs)$/.test(n) ? [f] : []; });
describe("six-digit numbers have one source", () => {
  it("nobody else pads to six digits (except the invoice print, whose number is always present)", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const hits = walk(root).filter((f) => !/code6\.(test\.)?ts$|sales-invoices-print\.ts$|__fixtures__/.test(f) && /padStart\(6/.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(hits).toEqual([]);
  });
});
