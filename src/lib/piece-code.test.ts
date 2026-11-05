import { describe, expect, it } from "vitest";
import { comparePieceCodes, unitsBefore } from "./piece-code";

describe("piece codes on the Coding page", () => {
  it("sorts the codes of one coding ascending", () => {
    expect(["77", "76", "74", "75"].sort(comparePieceCodes)).toEqual(["74", "75", "76", "77"]);
    expect(["100", "99", "9", "101"].sort(comparePieceCodes)).toEqual(["9", "99", "100", "101"]);
    expect(["EX 10", "EX 5"].sort(comparePieceCodes)).toEqual(["EX 5", "EX 10"]);
  });

  it("counts the units of the lines before each line, not only the drawn rows", () => {
    expect(unitsBefore([4, 3])).toEqual([0, 4]);
    expect(unitsBefore([30, 2, 5])).toEqual([0, 30, 32]);
    expect(unitsBefore([])).toEqual([]);
    // next 74: line 1 gets 74..77, line 2 starts at 78
    const next = 74, offsets = unitsBefore([4, 3]);
    expect([next + offsets[0] + 3, next + offsets[1]]).toEqual([77, 78]);
  });
});
