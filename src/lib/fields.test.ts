import { describe, expect, it } from "vitest";
import type { FieldConfig, ViewConfig } from "./engine-types";
import { sortKeyOf } from "./sort-keys";
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

describe("server sort flag (serverSort) on a paged list", () => {
  const base = { id: "v", label: "v", columns: [{ key: "date", label: "d", type: "date" }, { key: "note", label: "n" }], endpoint: "/x", paging: { sizeParam: null } } as ViewConfig;
  const on = { ...base, serverSort: { on: true, columns: { date: "date" } } } as ViewConfig;
  const off = { ...base, serverSort: { on: false, columns: { date: "date" } } } as ViewConfig;
  const sorted = { ...initialViewState(base), sort: { key: "date", dir: "desc" as const }, page: 1 };
  it("OFF or absent: no sort param is sent, even on many pages", () => {
    expect(buildQuery(base, sorted, { manyPages: true })).toEqual({ page: 1 });
    expect(buildQuery(off, sorted, { manyPages: true })).toEqual({ page: 1 });
  });
  it("ON + many pages: sort (the backend id) and dir are sent", () => {
    expect(buildQuery(on, sorted, { manyPages: true })).toEqual({ page: 1, sort: "date", dir: "desc" });
    expect(buildQuery(on, { ...sorted, sort: { key: "date", dir: "asc" }, page: 3 }, { manyPages: true })).toEqual({ page: 3, sort: "date", dir: "asc" });
  });
  it("ON + one page (or not yet known): nothing is sent, the browser sorts", () => {
    expect(buildQuery(on, sorted, { manyPages: false })).toEqual({ page: 1 });
    expect(buildQuery(on, sorted)).toEqual({ page: 1 });
  });
  it("ON: a column with no backend id is never sent", () => {
    expect(buildQuery(on, { ...sorted, sort: { key: "note", dir: "asc" } }, { manyPages: true })).toEqual({ page: 1 });
  });
  it("sortKeyOf: headers of a multi-page list are sortable only when ON and mapped", () => {
    const [date, note] = base.columns;
    expect(sortKeyOf(base, date, false)).toBeNull();
    expect(sortKeyOf(off, date, false)).toBeNull();
    expect(sortKeyOf(on, date, false)).toBe("date");
    expect(sortKeyOf(on, note, false)).toBeNull();
    expect(sortKeyOf(base, date, true)).toBe("date");      // one page: the browser sorts, flag or not
    expect(sortKeyOf(on, note, true)).toBe("note");
  });
});

describe("small helpers", () => {
  it("shiftMonth clamps the day", () => { expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28"); });
  it("search ignores alef variants", () => { expect(filterOptions([["1", "أحمد"], ["2", "علي"]], "احمد")).toHaveLength(1); });
});
