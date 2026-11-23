import { describe, expect, it } from "vitest";
import { printLines, toggled } from "./sales-print-rules";

describe("the pieces of a custom print", () => {
  const all = [1, 2, 3];
  it("asks for the whole invoice when every piece is chosen", () => {
    expect(printLines(all, new Set([1, 2, 3]))).toBeUndefined();
  });
  it("asks for the chosen line numbers, in invoice order", () => {
    expect(printLines(all, new Set([3, 1]))).toEqual([1, 3]);
  });
  it("has nothing to print when no piece is chosen", () => {
    expect(printLines(all, new Set())).toBeNull();
  });
  it("ticks and unticks one piece without touching the set it was given", () => {
    const start = new Set([1]);
    expect([...toggled(start, 2)].sort()).toEqual([1, 2]);
    expect([...toggled(start, 1)]).toEqual([]);
    expect([...start]).toEqual([1]);
  });
});
