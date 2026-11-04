import { describe, expect, it } from "vitest";
import { itemProblem, lineWeightOf, readInvoice, totalsOf } from "./purchases-rules";

describe("purchase invoice rules", () => {
  it("sends the item and the count only, never a weight", () => {
    const r = readInvoice({ date: "2026-11-04", lines: [{ itemId: "a", quantity: "2" }, { itemId: "b", quantity: "١" }] });
    expect(r.payload).toEqual({ date: "2026-11-04", lines: [{ itemId: "a", quantity: 2 }, { itemId: "b", quantity: 1 }] });
  });
  it("refuses each bad field by its own key", () => {
    const r = readInvoice({ date: "2026-02-30", lines: [{ itemId: "", quantity: "0" }] });
    expect(r.errors).toEqual({ date: "invalid", "lines.0.itemId": "required", "lines.0.quantity": "invalid" });
  });
  it("the line weight is the item weight times the count, in whole milligrams", () => {
    expect(lineWeightOf(4375, "3")).toBe(13125);
    expect(lineWeightOf(4375, "٣")).toBe(13125);
    expect(lineWeightOf(1, "100000")).toBe(100000);
    expect(lineWeightOf(4375, "0")).toBeUndefined();
    expect(lineWeightOf(4375, "")).toBeUndefined();
    expect(lineWeightOf(null, "2")).toBeUndefined();
    expect(lineWeightOf(9_999_999_999_999, "100000")).toBeUndefined();
  });
  it("totals add the worked-out weights", () => {
    expect(totalsOf([{ quantity: "2", itemWeight: 1500 }, { quantity: "3", itemWeight: null }, { quantity: "1", itemWeight: 250 }])).toEqual({ quantity: 6, weight: 3250 });
  });
  it("an item is offered only when active and complete", () => {
    const ok = { isActive: true, weight: 4375, workmanshipValue: "187.50", cashbackValue: "10.00" };
    expect(itemProblem(ok)).toBeNull();
    expect(itemProblem({ ...ok, isActive: false })).toBe("inactive");
    expect(itemProblem({ ...ok, weight: null })).toBe("incomplete");
    expect(itemProblem({ ...ok, workmanshipValue: null })).toBe("incomplete");
    expect(itemProblem({ ...ok, cashbackValue: "" })).toBe("incomplete");
  });
});
