import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOVERNORATES, governorateName } from "./governorates";

// The backend repository beside this one, under either folder name; the comparison is skipped when it is not there.
const backend = ["backend", "ge_erp_backend"].map((name) => join(__dirname, "../../..", name, "src/modules/gold-sales/delivery-charges/domain/delivery-charge.ts")).find((path) => existsSync(path));

describe("the governorates", () => {
  it("are 27, each once, with a name in both languages", () => {
    expect(GOVERNORATES).toHaveLength(27);
    expect(new Set(GOVERNORATES.map(([code]) => code)).size).toBe(27);
    for (const [code, ar, en] of GOVERNORATES) { expect(ar, code).toMatch(/[؀-ۿ]/); expect(en, code).toMatch(/^[A-Z]/); }
  });
  it("are named in the page's language", () => {
    expect(governorateName("cairo", true)).toBe("القاهرة");
    expect(governorateName("cairo", false)).toBe("Cairo");
    expect(governorateName("paris", false)).toBe("paris");
  });
  it.skipIf(!backend)("are the backend's codes", () => {
    const list = /GOVERNORATES = \[([\s\S]*?)\] as const/.exec(readFileSync(backend!, "utf8"))![1];
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual(GOVERNORATES.map(([code]) => code));
  });
});
