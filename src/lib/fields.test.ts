import { describe, expect, it } from "vitest";
import type { FieldConfig, ViewConfig } from "./engine-types";
import { buildQuery, initialViewState, readFields, shiftMonth, filterOptions } from "./fields";

const tr = { L: (_ar: string, en: string) => en };
const price = (name: string): FieldConfig => ({ name, label: name, type: "money", required: true, validate: (v) => (typeof v === "number" && v > 0 ? null : "above zero") });

describe("readFields", () => {
  it("parses money to piastres and keeps validate(v, all) working", () => {
    const r = readFields({ sellPrice: "3,5" }, [price("sellPrice")], tr);
    expect(r.values.sellPrice).toBe(350);                  // the comma is a decimal mark
    const ok = readFields({ sellPrice: "3500.25", buyPrice: "0" }, [price("sellPrice"), price("buyPrice")], tr);
    expect(ok.values.sellPrice).toBe(350025);
    expect(ok.errors.sellPrice).toBeUndefined();
    expect(ok.errors.buyPrice).toBe("above zero");         // zero fails the field's own validate
  });
  it("required, number, weight, cross-field", () => {
    const fields: FieldConfig[] = [
      { name: "a", label: "a", type: "text", required: true },
      { name: "n", label: "n", type: "number", min: 1 },
      { name: "w", label: "w", type: "weight" },
      { name: "from", label: "f", type: "date" },
      { name: "until", label: "u", type: "date", validate: (v, all) => (v && all.from && v < all.from ? "before" : null) },
    ];
    const r = readFields({ a: " ", n: "0", w: "1.5", from: "2026-11-05", until: "2026-11-01" }, fields, tr);
    expect(r.errors.a).toBe("This field is required.");
    expect(r.errors.n).toBe("Minimum 1.");
    expect(r.values.w).toBe(1500);
    expect(r.errors.until).toBe("before");
  });
});

describe("buildQuery sends only what the config names", () => {
  const view = { id: "v", label: "v", columns: [], endpoint: "/x", query: { order: "newest" }, paging: { sizeParam: null }, search: { param: "search" }, chips: [{ id: "all", label: "all" }, { id: "del", label: "d", query: { deleted: "only" } }] } as ViewConfig;
  it("page only for fixed-size lists", () => {
    const q = buildQuery(view, initialViewState(view));
    expect(q).toEqual({ order: "newest", page: 1 });
  });
  it("search and chip", () => {
    const vs = { ...initialViewState(view), q: "ab", chip: "del" };
    expect(buildQuery(view, vs)).toEqual({ order: "newest", deleted: "only", search: "ab", page: 1 });
  });
  it("no paging key when paging is off (treasuries)", () => {
    const v2 = { ...view, paging: false as const };
    expect(buildQuery(v2, initialViewState(v2))).toEqual({ order: "newest" });
  });
});

describe("small helpers", () => {
  it("shiftMonth clamps the day", () => { expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28"); });
  it("search ignores alef variants", () => { expect(filterOptions([["1", "أحمد"], ["2", "علي"]], "احمد")).toHaveLength(1); });
});
