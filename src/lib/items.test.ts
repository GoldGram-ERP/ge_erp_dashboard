import { describe, expect, it } from "vitest";
import { brandsOf, inBrand, itemOption, itemSearchText, itemSubText, stockMapOf, stockTone } from "./items";

const ring = { id: "i1", itemCode: 5, itemName: "Ring", nickname: "Khatem", karat: "21", categoryName: "Rings", brandId: "b1", brandName: "Gold Era" };
const chain = { id: "i2", itemCode: 7, itemName: "Chain", nickname: null, karat: "18", categoryName: "Chains", brandId: "b2", brandName: "Aya" };
const old = { id: "i3", itemCode: 9, itemName: "Old", nickname: null, karat: "24", categoryName: "Bars", brandId: null, brandName: null };

describe("the stock of the Sales desk", () => {
  const stock = stockMapOf({ items: [{ itemId: "i1", count: 3 }] });

  it("colours an item green when it has pieces and red when it has none", () => {
    expect(stockTone(stock, "i1")).toBe("good");
    expect(stockTone(stock, "i2")).toBe("bad");
  });

  it("colours nothing when the desk has no stock map (every other page, and the desk before it hears)", () => {
    expect(stockTone(undefined, "i1")).toBeUndefined();
    expect(stockMapOf(null)).toBeUndefined();
    expect(stockMapOf({})).toBeUndefined();
  });

  it("cannot pick an item without stock, and can pick every item when there is no stock map", () => {
    expect(itemOption(ring, { stock })[2]).toBe(false);
    expect(itemOption(chain, { stock })[2]).toBe(true);
    expect(itemOption(chain)[2]).toBe(false);
    expect(itemOption(chain)[3]?.tone).toBeUndefined();
    expect(itemOption(chain, { stock })[3]?.tone).toBe("bad");
  });
});

describe("a row of the picker", () => {
  it("is the name and the karat, with the code, the group and the brand under it", () => {
    const o = itemOption(ring);
    expect(o[0]).toBe("i1");
    expect(o[1]).toBe("Ring · 21");
    expect(o[3]?.sub).toBe("000005 · Rings · Gold Era");
    expect(itemSubText(old)).toBe("000009 · Bars");
  });

  it("is found by code, name, nickname, group or brand", () => {
    const text = itemSearchText(ring).toLowerCase();
    for (const q of ["5", "000005", "ring", "khatem", "rings", "gold era"]) expect(text).toContain(q);
    expect(itemSearchText(old)).not.toContain("null");
  });
});

describe("the brand filter", () => {
  const options = [ring, chain, old].map((it) => itemOption(it));

  it("offers each brand the items carry, once, by name", () => {
    expect(brandsOf([ring, chain, old, { ...ring, id: "i4" }])).toEqual([{ id: "b2", name: "Aya" }, { id: "b1", name: "Gold Era" }]);
    expect(brandsOf([old])).toEqual([]);
  });

  it("keeps the options of the chosen brand, and every option when none is chosen", () => {
    expect(inBrand(options, "").length).toBe(3);
    expect(inBrand(options, "b1").map((o) => o[0])).toEqual(["i1"]);
    expect(inBrand(options, "b2").map((o) => o[0])).toEqual(["i2"]);
  });

  it("keeps the picked option even when it is of another brand, so the box can still name it", () => {
    expect(inBrand(options, "b1", "i3").map((o) => o[0])).toEqual(["i1", "i3"]);
  });
});

describe("the desk picker on a buy, the few left, and the hand switch (owner, 2026-11-22)", () => {
  const stock = stockMapOf({ items: [{ itemId: "i1", count: 2 }, { itemId: "i2", count: 3 }, { itemId: "i3", count: 4 }] });
  const left = (n: number) => `${n} left`;

  it("a sale blocks an item without stock; a buy picks it and shows no colour", () => {
    expect(itemOption(chain, { stock: stockMapOf({ items: [{ itemId: "i1", count: 1 }] }), mode: "sell" })[2]).toBe(true);
    const buy = itemOption(chain, { stock: stockMapOf({ items: [{ itemId: "i1", count: 1 }] }), mode: "buy" });
    expect(buy[2]).toBe(false);
    expect(buy[3]?.tone).toBeUndefined();
  });

  it("names the pieces left only when they are 1 to 3", () => {
    expect(itemOption(ring, { stock, left })[3]?.sub).toContain("2 left");
    expect(itemOption(chain, { stock, left })[3]?.sub).toContain("3 left");
    expect(itemOption(old, { stock, left })[3]?.sub).not.toContain("left"); // 4 pieces: no number
    expect(itemOption({ ...ring, id: "none" }, { stock, left })[3]?.sub).not.toContain("left"); // none: red, no number
    expect(itemOption(ring)[3]?.sub).not.toContain("left"); // no stock map: nothing
  });

  it("an item with pieces but switched off by hand is red and cannot be picked on a sale, yet can on a buy", () => {
    const off = { ...ring, stockAvailable: false };
    expect(itemOption(off, { stock, mode: "sell" })[2]).toBe(true);
    expect(itemOption(off, { stock, mode: "sell" })[3]?.tone).toBe("bad");
    expect(itemOption(off, { stock, mode: "buy" })[2]).toBe(false);
    expect(itemOption(off, { stock, left })[3]?.sub).not.toContain("left");
    expect(itemOption({ ...ring, stockAvailable: true }, { stock })[3]?.tone).toBe("good");
  });
});
