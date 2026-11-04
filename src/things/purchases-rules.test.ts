import { describe, expect, it } from "vitest";
import { autoRemainder, readCoding, readInvoice, remainingOf, totalsOf } from "./purchases-rules";

describe("purchase invoice rules", () => {
  it("reads a good invoice and leaves an empty weight out", () => {
    const r = readInvoice({ date: "2026-11-04", lines: [{ itemId: "a", quantity: "2", weight: "" }, { itemId: "b", quantity: "١", weight: "12.5" }] });
    expect(r.payload).toEqual({ date: "2026-11-04", lines: [{ itemId: "a", quantity: 2 }, { itemId: "b", quantity: 1, weight: 12500 }] });
  });
  it("refuses each bad field by its own key", () => {
    const r = readInvoice({ date: "2026-02-30", lines: [{ itemId: "", quantity: "0", weight: "-1" }] });
    expect(r.errors).toEqual({ date: "invalid", "lines.0.itemId": "required", "lines.0.quantity": "invalid", "lines.0.weight": "invalid" });
  });
  it("totals count typed weights and the lines without one", () => {
    expect(totalsOf([{ quantity: "2", weight: "1.5" }, { quantity: "3", weight: "" }])).toEqual({ quantity: 5, weight: 1500, weightMissing: 1 });
  });
});

describe("purchase coding rules", () => {
  it("the last open box takes what remains", () => {
    expect(remainingOf(10000, ["4", ""]).remaining).toBe(6000);
    expect(autoRemainder(10000, [{ weight: "4", typed: true }, { weight: "", typed: false }])).toEqual({ index: 1, text: "6.000" });
  });
  it("pieces must add up exactly to the line weight", () => {
    const line = (w2: string) => [{ lineId: "l", weight: 10000, pieces: [{ weight: "4", makingChargePerGram: "1" }, { weight: w2, makingChargePerGram: "1" }] }];
    expect(readCoding(line("6")).payload).toBeDefined();
    expect(readCoding(line("5.999")).off).toEqual([0]);
    expect(readCoding(line("")).errors["lines.0.pieces.1.weight"]).toBe("required");
  });
});
