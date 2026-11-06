import { describe, expect, it } from "vitest";
import { isEmpty, kindOfType, naturalDir, nextDir, sortRows } from "./sort";

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).join("");
const pick = (vals: unknown[], kind: Parameters<typeof sortRows>[2], dir: "asc" | "desc", lang = "ar") =>
  ids(sortRows(vals.map((v, i) => ({ id: String.fromCharCode(97 + i), v })), (r) => r.v, kind, dir, lang));

describe("sort comparator", () => {
  it("numbers and decimal strings sort by value, not by text", () => {
    expect(pick(["10", "9", "100", "2.5"], "number", "asc")).toBe("dbac");
    expect(pick(["10", "9", "100", "2.5"], "number", "desc")).toBe("cabd");
  });
  it("money decimals stay exact beyond float precision", () => {
    expect(pick(["9007199254740993.01", "9007199254740993.02", "9007199254740993.00"], "number", "asc")).toBe("cab");
  });
  it("empties are last in both directions", () => {
    const v = [null, "5", "", "1", undefined, "—"];
    expect(pick(v, "number", "asc").slice(0, 2)).toBe("db");
    expect(pick(v, "number", "desc").slice(0, 2)).toBe("bd");
    expect(pick(v, "number", "asc").slice(2)).toBe("acef");
    expect(pick(v, "number", "desc").slice(2)).toBe("acef");
  });
  it("is stable: ties keep their order in both directions", () => {
    expect(pick([1, 1, 1], "number", "asc")).toBe("abc");
    expect(pick([1, 1, 1], "number", "desc")).toBe("abc");
  });
  it("dates sort by value", () => {
    expect(pick(["2026-03-01", "2025-12-31", "2026-03-01T10:00:00"], "date", "asc")).toBe("bac");
  });
  it("Arabic text uses the Arabic collation and digits inside text by value", () => {
    expect(pick(["جيم", "ألف", "باء"], "text", "asc")).toBe("bca");
    expect(pick(["صنف 10", "صنف 2"], "text", "asc")).toBe("ba");
  });
  it("text ignores case", () => { expect(pick(["b", "A", "c"], "text", "asc", "en")).toBe("bac"); });
  it("natural direction and the cycle", () => {
    expect(naturalDir("text")).toBe("asc");
    expect(naturalDir("number")).toBe("desc");
    expect(naturalDir("date")).toBe("desc");
    expect(nextDir("number", null)).toBe("desc");
    expect(nextDir("number", "desc")).toBe("asc");
    expect(nextDir("text", "asc")).toBe("desc");
    expect(nextDir("text", "desc")).toBe("asc");
  });
  it("kinds follow the column type", () => {
    expect(["money", "weight", "int"].map(kindOfType)).toEqual(["number", "number", "number"]);
    expect(["date", "datetime"].map(kindOfType)).toEqual(["date", "date"]);
    expect([undefined, "status", "text", "bool"].map(kindOfType)).toEqual(["text", "text", "text", "text"]);
    expect(isEmpty("—") && isEmpty(null) && !isEmpty(0)).toBe(true);
  });
});
