import { describe, expect, it } from "vitest";
import { filterItems, isFiltering, noFilter, weightBounds, clampCount, compareCandidates, differenceOf, entriesOf, netOf, rowOf, times, toggleId, totalsOf, winner, type BoardBrand, type BoardItem } from "./price-board-rules";

const item = (id: string, karat: string, weightMg: number, extra: Partial<BoardItem> = {}): BoardItem => ({
  id, itemCode: 1, itemName: id, nickname: null, karat, weightMg, workmanshipPerGram: 0, cashbackPerGram: 0,
  goldValue: 100, workmanship: 10, cashback: 4, total: 110, stockCount: 1, stockAvailable: true, sellable: true, ...extra,
});
const brands: BoardBrand[] = [
  { id: "b1", name: "Gold Era", items: [item("a", "21", 4000), item("a2", "21", 8000)] },
  { id: "b2", name: "BTC", items: [item("b", "21", 4000), item("c", "24", 4000), item("d", "21", 8000)] },
  { id: "b3", name: "SAM", items: [item("e", "21", 4000), item("f", "21", 4001)] },
];
const all = entriesOf(brands);
const first = (id: string) => all.find((e) => e.id === id);

describe("the second item of the comparison", () => {
  it("is of another brand, with the same karat and the same weight", () => {
    expect(compareCandidates(all, first("a")).map((e) => e.id)).toEqual(["b", "e"]);
    expect(compareCandidates(all, first("a2")).map((e) => e.id)).toEqual(["d"]);
  });
  it("never offers an item of the first one's own brand, nor another karat or weight", () => {
    const ids = compareCandidates(all, first("b")).map((e) => e.id);
    expect(ids).toEqual(["a", "e"]);
    expect(ids).not.toContain("c");
    expect(ids).not.toContain("f");
  });
  it("offers nothing before the first item is chosen, nor when nothing matches", () => {
    expect(compareCandidates(all, undefined)).toEqual([]);
    expect(compareCandidates(all, first("c"))).toEqual([]);
  });
});

describe("the numbers of the table", () => {
  it("net is the total less the cashback, null without a price", () => {
    expect(netOf({ total: 110, cashback: 4 })).toBe(106);
    expect(netOf({ total: null, cashback: null })).toBeNull();
  });
  it("the difference is the second less the first", () => {
    expect(differenceOf(100, 90)).toBe(-10);
    expect(differenceOf(null, 90)).toBeNull();
  });
  it("the winner of a row is the lower price or the higher cashback, none on a tie", () => {
    expect(winner(100, 90, "lower")).toBe("b");
    expect(winner(100, 90, "higher")).toBe("a");
    expect(winner(5, 5, "lower")).toBeNull();
    expect(winner(null, 5, "lower")).toBeNull();
  });
});

describe("the pieces of one item", () => {
  it("multiplies a price by the count, and no price stays no price", () => {
    expect(times(110, 1)).toBe(110);
    expect(times(110, 3)).toBe(330);
    expect(times(null, 3)).toBeNull();
  });
  it("keeps the count between 1 and 99", () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-4)).toBe(1);
    expect(clampCount(5.9)).toBe(5);
    expect(clampCount(100)).toBe(99);
    expect(clampCount(Number.NaN)).toBe(1);
  });
});

describe("the selected cards", () => {
  it("selects a card at the end of the selection and frees it on the second click", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
  it("prices a row: one piece's price, and workmanship, cashback and total for n pieces", () => {
    expect(rowOf({ total: 1_659_00, workmanship: 43, cashback: 28 }, 3)).toEqual({ price: 1_659_00, workmanship: 129, cashback: 84, total: 4_977_00 });
    expect(rowOf({ total: null, workmanship: null, cashback: null }, 3)).toEqual({ price: null, workmanship: null, cashback: null, total: null });
  });
  it("adds the rows for the foot, and flags a row without a price", () => {
    const rows = [rowOf({ total: 100, workmanship: 10, cashback: 4 }, 2), rowOf({ total: 50, workmanship: 5, cashback: 1 }, 1)];
    expect(totalsOf(rows)).toEqual({ workmanship: 25, cashback: 9, total: 250, goldValue: 225, incomplete: false });
    expect(totalsOf([...rows, rowOf({ total: null, workmanship: null, cashback: null }, 1)]).incomplete).toBe(true);
    expect(totalsOf([])).toEqual({ workmanship: 0, cashback: 0, total: 0, goldValue: 0, incomplete: false });
  });
});

describe("a brand card's search and weight range", () => {
  const w = (name: string, mg: number, nickname: string | null = null) => ({ itemName: name, nickname, weightMg: mg });
  const items = [w("سبيكة ربع جرام", 250), w("Bar 7", 7_999), w("Bar 8", 8_000), w("Bar 10.5", 10_500, "Half bar"), w("Bar 12", 12_000), w("Bar 12.001", 12_001)];
  const names = (f: Partial<typeof noFilter>) => filterItems(items, { ...noFilter, ...f }).map((i) => i.itemName);

  it("keeps both ends and everything between, fractions included: 8 to 12", () => {
    expect(names({ from: "8", to: "12" })).toEqual(["Bar 8", "Bar 10.5", "Bar 12"]);
  });
  it("counts fractions of a gram: 0.25 to 0.5", () => {
    expect(names({ from: "0.25", to: "0.5" })).toEqual(["سبيكة ربع جرام"]);
    expect(names({ from: "0.251", to: "0.5" })).toEqual([]);
  });
  it("works with only a from or only a to", () => {
    expect(names({ from: "12" })).toEqual(["Bar 12", "Bar 12.001"]);
    expect(names({ to: "0.25" })).toEqual(["سبيكة ربع جرام"]);
  });
  it("reads Arabic digits and the Arabic decimal mark", () => {
    expect(names({ from: "٨", to: "١٠٫٥" })).toEqual(["Bar 8", "Bar 10.5"]);
  });
  it("shows nothing and flags the range when from is more than to", () => {
    expect(weightBounds({ from: "12", to: "8" }).invalid).toBe(true);
    expect(names({ from: "12", to: "8" })).toEqual([]);
  });
  it("ignores a bound that is empty or not a weight", () => {
    expect(names({ from: "abc", to: "" }).length).toBe(items.length);
    expect(weightBounds({ from: " ", to: "x" })).toEqual({ from: undefined, to: undefined, invalid: false });
  });
  it("searches the name and the nickname, in any letter case, and combines with the weight", () => {
    expect(names({ q: "bar 1" })).toEqual(["Bar 10.5", "Bar 12", "Bar 12.001"]);
    expect(names({ q: "HALF" })).toEqual(["Bar 10.5"]);
    expect(names({ q: "ربع" })).toEqual(["سبيكة ربع جرام"]);
    expect(names({ q: "bar", from: "8", to: "10.5" })).toEqual(["Bar 8", "Bar 10.5"]);
  });
  it("knows when a card is being filtered", () => {
    expect(isFiltering(noFilter)).toBe(false);
    expect(isFiltering({ ...noFilter, from: "1" })).toBe(true);
    expect(isFiltering({ ...noFilter, q: "  " })).toBe(false);
  });
});
