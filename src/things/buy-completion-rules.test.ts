import { describe, expect, it } from "vitest";
import { oldPieceProblem, pieceRows, saleOf, splitAmounts } from "./buy-completion-rules";

const line = (lineNumber: number, quantity: number, linePrice: number) => ({ lineNumber, itemName: `Item ${lineNumber}`, karat: "21", quantity, linePrice, cashDiscount: 0 });

describe("completing a Buy draft with pieces we sold", () => {
  it("gives one row per piece of each line", () => {
    expect(pieceRows([line(1, 2, 10), line(2, 1, 5)]).map((r) => `${r.key} ${r.number}/${r.of}`)).toEqual(["1-1 1/2", "1-2 2/2", "2-1 1/1"]);
  });

  it("splits the price as the backend does, the two adding up to the total", () => {
    const lines = [line(1, 3, 1000), line(2, 1, 500)];
    expect(splitAmounts(lines, [{ lineNumber: 1 }, { lineNumber: 1 }])).toEqual({ returned: 666, bought: 834, newQuantities: [1, 1] });
    expect(splitAmounts([line(1, 3, 1001)], [{ lineNumber: 1 }, { lineNumber: 1 }, { lineNumber: 1 }])).toEqual({ returned: 1001, bought: 0, newQuantities: [0] });
    expect(splitAmounts(lines, [])).toEqual({ returned: 0, bought: 1500, newQuantities: [3, 1] });
  });

  const found = { kind: "piece", sold: true, itemName: "Item 1", karat: "21", branchName: "Main", sales: [{ kind: "return", documentNumber: 9 }, { kind: "sale", deleted: true, documentNumber: 8 }, { kind: "sale", documentNumber: 7 }] };

  it("takes only a sold piece of the draft's branch, of the row's item and karat", () => {
    const row = { itemName: "Item 1", karat: "21" };
    expect(oldPieceProblem(found, row, "Main")).toBeNull();
    expect(oldPieceProblem(null, row, "Main")).toBe("notFound");
    expect(oldPieceProblem({ kind: "customerPiece" }, row, "Main")).toBe("notFound");
    expect(oldPieceProblem({ ...found, sold: false }, row, "Main")).toBe("notSold");
    expect(oldPieceProblem(found, row, "Nasr City")).toBe("otherBranch");
    expect(oldPieceProblem({ ...found, karat: "18" }, row, "Main")).toBe("mismatch");
    expect(oldPieceProblem({ ...found, itemName: "Other" }, row, "Main")).toBe("mismatch");
  });

  it("names the sale the piece is on", () => {
    expect(saleOf(found)?.documentNumber).toBe(7);
    expect(saleOf(null)).toBeNull();
  });
});
