import { describe, expect, it } from "vitest";
import { exampleOf, onePiece, pricePerGram, typedHundredths, valueText } from "./item-math";

const B = BigInt;

// 21K at 4,123.45 EGP/g, one piece of 4.375 g: gold 1,804,009.375 piastres -> 18,040.09.
const price = { sellPrice: 412345, silverPrice: 4550 };
const form = (mode: string, value: string) => ({ karat: "21", weight: "4.375", mode, value });

describe("item example: one piece today, exact piastres", () => {
  it("per gram: workmanship x weight, half up", () => {
    expect(exampleOf(price, form("per_gram", "187.50"))).toEqual({ ok: true, gold: B(1804009), charge: B(82031), total: B(1886040) });   // 820.31 -> 18,860.40
  });
  it("percent: of the gold, half up", () => {
    expect(exampleOf(price, form("percent", "4.5"))).toEqual({ ok: true, gold: B(1804009), charge: B(81180), total: B(1885189) });       // 811.80 -> 18,851.89
  });
  it("per piece: the value itself", () => {
    expect(exampleOf(price, form("per_piece", "800.00"))).toEqual({ ok: true, gold: B(1804009), charge: B(80000), total: B(1884009) });  // 18,840.09
  });
  it("rounds half up at exactly half a piastre, down below it", () => {
    expect(onePiece(B(1000), B(500), "per_piece", B(0)).gold).toBe(B(500));
    expect(onePiece(B(1), B(500), "per_piece", B(0)).gold).toBe(B(1));        // 0.5 -> 1
    expect(onePiece(B(1), B(499), "per_piece", B(0)).gold).toBe(B(0));        // 0.499 -> 0
    expect(onePiece(B(100), B(1000), "percent", B(50)).charge).toBe(B(1));    // 100 x 0.5% = 0.5 -> 1
  });
  it("price of a gram follows the karat: 21 as saved, 18 and 24 from it, 999 is silver", () => {
    expect(pricePerGram(price, "21")).toBe(B(412345));
    expect(pricePerGram(price, "18")).toBe(B(353439));    // 412345 x 18 / 21 = 353438.57 -> 353439
    expect(pricePerGram(price, "24")).toBe(B(471251));    // 471251.43 -> 471251
    expect(pricePerGram(price, "999")).toBe(B(4550));
    expect(pricePerGram({ sellPrice: 1, silverPrice: null }, "999")).toBeNull();
  });
  it("says why there is no number: no price yet, or the form is not filled", () => {
    expect(exampleOf(null, form("per_gram", "1"))).toEqual({ ok: false, why: "noPrice" });
    expect(exampleOf({ sellPrice: 1, silverPrice: null }, { ...form("per_gram", "1"), karat: "999" })).toEqual({ ok: false, why: "noPrice" });
    for (const bad of [{ weight: "" }, { weight: "1.2345" }, { value: "1.234" }, { value: "-1" }, { mode: "" }, { karat: "" }])
      expect(exampleOf(price, { ...form("per_gram", "1"), ...bad })).toEqual({ ok: false, why: "fill" });
  });
  it("accepts Arabic digits and the Arabic decimal mark", () => {
    expect(exampleOf(price, { karat: "21", weight: "٤٫٣٧٥", mode: "per_gram", value: "١٨٧٫٥" })).toMatchObject({ charge: B(82031) });
    expect(typedHundredths("٤٫٥")).toBe(B(450));
  });
  it("sends the value as a two-decimal string", () => {
    expect(valueText(B(450))).toBe("4.50");
    expect(valueText(B(80000))).toBe("800.00");
    expect(valueText(B(5))).toBe("0.05");
  });
});
