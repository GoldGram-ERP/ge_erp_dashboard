import { describe, expect, it } from "vitest";
import { prefillFromLatest, stepAmount } from "./price-step";

describe("stepAmount (exact piastres, no float)", () => {
  it.each([
    ["4050.00", 500, "4055.00"], ["0.00", -500, "0.00"], ["", 500, "5.00"], ["", -500, "0.00"],
    ["4050.5", -500, "4045.50"], ["3", -500, "0.00"], ["0.10", 500, "5.10"],
    ["٤٠٥٠٫٥", 500, "4055.50"], ["99999999999.99", -500, "99999999994.99"], ["0.07", 500, "5.07"],
  ])("%s %i -> %s", (typed, d, want) => expect(stepAmount(typed, d)).toBe(want));
  it("keeps unreadable text and over-large text as typed", () => {
    expect(stepAmount("abc", 500)).toBe("abc");
    expect(stepAmount("123456789012", 500)).toBe("123456789012");
  });
  it("20 presses of +5 add exactly 100.00 (a float sum would drift)", () => {
    let v = "0.10"; for (let i = 0; i < 20; i++) v = stepAmount(v, 500);
    expect(v).toBe("100.10");
  });
});

describe("prefillFromLatest", () => {
  const names = ["sellPrice", "buyPrice", "silverSellPrice", "silverBuyPrice"];
  const latest = { sellPrice: 405000, buyPrice: 400050, silverSellPrice: 5, silverBuyPrice: 4 };
  it("fills every empty field from the last set", () => {
    expect(prefillFromLatest(latest, {}, names)).toEqual({ sellPrice: "4050.00", buyPrice: "4000.50", silverSellPrice: "0.05", silverBuyPrice: "0.04" });
  });
  it("does not overwrite what the person already typed", () => {
    expect(prefillFromLatest(latest, { sellPrice: "4100" }, names)).toEqual({ buyPrice: "4000.50", silverSellPrice: "0.05", silverBuyPrice: "0.04" });
  });
  it("no last set means nothing to fill", () => {
    expect(prefillFromLatest(null, {}, names)).toEqual({});
    expect(prefillFromLatest({ sellPrice: null }, {}, names)).toEqual({});
  });
});
