import { describe, expect, it } from "vitest";
import { applyBulk, cellState, changesOf, filterRows, invalidCount, refusals, rowState, setEdit, shown, toRows, type Edits, type FeeItem, type FeeRow } from "./item-fees-rules";

const item = (n: number, over: Partial<FeeItem> = {}): FeeItem => ({
  id: `id-${n}`, itemCode: n, itemName: `Ring ${n}`, categoryId: n % 2 ? "cat-a" : "cat-b", categoryName: n % 2 ? "Rings" : "Bracelets", karat: n % 3 ? "21" : "18",
  weight: 5000, workmanshipValue: "12.50", cashbackValue: "1.00", isActive: true, deletedAt: null, ...over,
});
const rows = toRows([item(1), item(2), item(3), item(4)]);   // karat: 1 -> 21, 2 -> 21, 3 -> 18, 4 -> 21

describe("which items are listed", () => {
  it("only active, not deleted and complete ones", () => {
    const got = toRows([item(1), item(2, { isActive: false }), item(3, { deletedAt: "2026-11-01T00:00:00Z" }), item(4, { weight: null }), item(5, { workmanshipValue: null }), item(6, { cashbackValue: null })]);
    expect(got.map((r) => r.id)).toEqual(["id-1"]);
  });
  it("shows the fees with two decimals", () => {
    expect(toRows([item(1, { workmanshipValue: "12.5", cashbackValue: "0" })])[0]).toMatchObject({ workmanship: "12.50", cashback: "0.00" });
  });
});

describe("filters", () => {
  it("by category, by karat, by search, and all together", () => {
    expect(filterRows(rows, { q: "", categoryId: "cat-a", karat: "" }).map((r) => r.itemCode)).toEqual([1, 3]);
    expect(filterRows(rows, { q: "", categoryId: "", karat: "18" }).map((r) => r.itemCode)).toEqual([3]);
    expect(filterRows(rows, { q: "ring 2", categoryId: "", karat: "" }).map((r) => r.itemCode)).toEqual([2]);
    expect(filterRows(rows, { q: "", categoryId: "cat-a", karat: "21" }).map((r) => r.itemCode)).toEqual([1]);
    expect(filterRows(rows, { q: "zzz", categoryId: "", karat: "" })).toEqual([]);
  });
});

describe("the diff of what was typed against what is saved", () => {
  it("a different value is a change; the same value, typed differently, is not", () => {
    let e: Edits = {};
    e = setEdit(e, rows[0], "workmanship", "15");
    expect(cellState(rows[0], e, "workmanship")).toBe("changed");
    expect(cellState(rows[0], e, "cashback")).toBe("same");
    e = setEdit(e, rows[1], "workmanship", "12.5");   // same number as 12.50
    expect(cellState(rows[1], e, "workmanship")).toBe("same");
    expect(changesOf(rows, e).map((c) => c.id)).toEqual(["id-1"]);
  });
  it("typing the saved text again drops the entry", () => {
    let e = setEdit({}, rows[0], "cashback", "2.00");
    e = setEdit(e, rows[0], "cashback", "1.00");
    expect(e).toEqual({});
  });
  it("sends both values of a changed row, with two decimals", () => {
    const e = setEdit({}, rows[0], "cashback", "3.5");
    expect(changesOf(rows, e)).toEqual([{ id: "id-1", workmanshipValue: "12.50", cashbackValue: "3.50" }]);
  });
  it("accepts Arabic digits, as the item form does", () => {
    expect(changesOf(rows, setEdit({}, rows[0], "workmanship", "٢٠٫٢٥"))[0].workmanshipValue).toBe("20.25");
  });
  it("keeps exact decimals (no float drift)", () => {
    expect(changesOf(rows, setEdit({}, rows[0], "workmanship", "0.30"))[0].workmanshipValue).toBe("0.30");
    expect(changesOf(rows, setEdit({}, rows[0], "workmanship", "1234567890.99"))[0].workmanshipValue).toBe("1234567890.99");
  });
});

describe("validation, as the item form's workmanship field", () => {
  it.each(["", "-1", "-0.5", "abc", "1.234", "12345678901", "1,2,3", "1e3", " "])("%j is invalid and is never sent", (typed) => {
    const e = setEdit({}, rows[0], "workmanship", typed);
    expect(cellState(rows[0], e, "workmanship")).toBe("invalid");
    expect(rowState(rows[0], e)).toBe("invalid");
    expect(invalidCount(rows, e)).toBe(1);
    expect(changesOf(rows, e)).toEqual([]);
  });
  it.each(["0", "0.00", "12", "12.5", "0.01", "9999999999.99"])("%j is valid", (typed) => {
    expect(cellState(rows[0], setEdit({}, rows[0], "cashback", typed), "cashback")).not.toBe("invalid");
  });
  it("an invalid row is not sent while the other valid changes still are", () => {
    let e = setEdit({}, rows[0], "workmanship", "-3");
    e = setEdit(e, rows[1], "workmanship", "20");
    expect(changesOf(rows, e).map((c) => c.id)).toEqual(["id-2"]);
    expect(invalidCount(rows, e)).toBe(1);
  });
});

describe("bulk: set this value for the filtered rows", () => {
  it("changes only the filtered rows and only the chosen field", () => {
    const filtered = filterRows(rows, { q: "", categoryId: "cat-a", karat: "" });   // items 1 and 3
    const e = applyBulk({}, filtered, "workmanship", "30");
    expect(changesOf(rows, e)).toEqual([
      { id: "id-1", workmanshipValue: "30.00", cashbackValue: "1.00" },
      { id: "id-3", workmanshipValue: "30.00", cashbackValue: "1.00" },
    ]);
    expect(shown(rows[1], e, "workmanship")).toBe("12.50");
  });
  it("does not count a row that already has the value, and keeps earlier typing on other rows", () => {
    let e = setEdit({}, rows[1], "cashback", "9");
    e = applyBulk(e, rows, "workmanship", "12.50");
    expect(changesOf(rows, e).map((c) => c.id)).toEqual(["id-2"]);
  });
  it("a value that is not valid changes nothing", () => {
    const e = setEdit({}, rows[0], "cashback", "5");
    expect(applyBulk(e, rows, "workmanship", "-1")).toBe(e);
    expect(applyBulk(e, rows, "workmanship", "")).toBe(e);
  });
  it("overrides what was typed on a filtered row", () => {
    const e = applyBulk(setEdit({}, rows[0], "workmanship", "99"), [rows[0]], "workmanship", "7");
    expect(changesOf(rows, e)[0].workmanshipValue).toBe("7.00");
  });
});

describe("a refusal maps back to the rows sent", () => {
  const sent = changesOf(rows, applyBulk({}, rows, "workmanship", "40"));   // four changes, in table order
  const rs = rows as FeeRow[];
  it("reads the API's field paths", () => {
    const got = refusals({ fields: [{ field: "changes.2.workmanshipValue", message: "invalid" }, { field: "changes.3.id", message: "duplicateItem" }] }, sent, rs);
    expect(got).toEqual([
      { id: "id-3", itemName: "Ring 3", field: "workmanship", message: "invalid" },
      { id: "id-4", itemName: "Ring 4", field: null, message: "duplicateItem" },
    ]);
  });
  it("reads an object of paths too, and ignores what it cannot place", () => {
    expect(refusals({ fields: { "changes.0.cashbackValue": "negative", "other": "x", "changes.9.id": "y" } }, sent, rs)).toEqual([{ id: "id-1", itemName: "Ring 1", field: "cashback", message: "negative" }]);
    expect(refusals({}, sent, rs)).toEqual([]);
  });
});
