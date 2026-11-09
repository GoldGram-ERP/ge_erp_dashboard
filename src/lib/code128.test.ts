import { describe, expect, it } from "vitest";
import { PATTERNS, START_B, START_C, STOP, code128Shape, code128Symbols } from "./code128";

describe("the Code 128 table", () => {
  it("has 107 symbols: every one is 11 modules (three bars and three spaces), and the stop is 13", () => {
    expect(PATTERNS.length).toBe(107);
    PATTERNS.slice(0, 106).forEach((p, i) => {
      expect(p.length, `symbol ${i}`).toBe(6);
      expect([...p].reduce((a, w) => a + Number(w), 0), `symbol ${i}`).toBe(11);
    });
    expect(PATTERNS[STOP]).toBe("2331112");
    expect([...PATTERNS[STOP]].reduce((a, w) => a + Number(w), 0)).toBe(13);
  });

  it("uses each pattern once, and only widths of 1 to 4", () => {
    expect(new Set(PATTERNS).size).toBe(107);
    for (const p of PATTERNS) for (const w of p) expect("1234").toContain(w);
  });

  it("starts the three sets with their known patterns", () => {
    expect(PATTERNS[103]).toBe("211412");
    expect(PATTERNS[START_B]).toBe("211214");
    expect(PATTERNS[START_C]).toBe("211232");
  });
});

describe("the symbols of a code", () => {
  it("uses Code Set C for an even run of digits, two digits to a symbol", () => {
    // start C 105; 00 11 90; checksum = (105 + 0*1 + 11*2 + 90*3) % 103 = 397 % 103 = 88
    expect(code128Symbols("001190")).toEqual([START_C, 0, 11, 90, 88, STOP]);
  });

  it("uses Code Set B for anything else, one character to a symbol (space is 0)", () => {
    // start B 104; "A" is 33; checksum = (104 + 33) % 103 = 34
    expect(code128Symbols("A")).toEqual([START_B, 33, 34, STOP]);
    // an odd run of digits is set B too: "4" is 20; checksum = (104 + 20) % 103 = 21
    expect(code128Symbols("4")).toEqual([START_B, 20, 21, STOP]);
    expect(code128Symbols("GE-004")?.[0]).toBe(START_B);
  });

  it("holds nothing it cannot: empty, or outside printable ASCII", () => {
    expect(code128Symbols("")).toBeNull();
    expect(code128Symbols("جولد")).toBeNull();
    expect(code128Symbols("a\u0007b")).toBeNull();
    expect(code128Shape("")).toBeNull();
  });
});

describe("the bars", () => {
  it("are the symbols' modules and a quiet zone of ten each side: a six-digit code is 88 modules", () => {
    // start 11 + 3 symbols 33 + checksum 11 + stop 13 = 68, and 20 of quiet zone
    expect(code128Shape("001190")?.size).toBe(88);
    // set B for one digit: start 11 + 1 symbol 11 + checksum 11 + stop 13 = 46, and 20
    expect(code128Shape("4")?.size).toBe(66);
  });

  it("begin and end with a bar inside the quiet zone, and draw only bars", () => {
    const shape = code128Shape("001190")!;
    expect(shape.d.startsWith("M10 0h")).toBe(true);        // the start symbol's first bar is 2 wide, at module 10
    expect(shape.d).not.toContain("NaN");
    expect(shape.d.endsWith("z")).toBe(true);
    const lastBar = [...shape.d.matchAll(/M(\d+) 0h(\d+)v1h-\d+z/g)].pop()!;
    expect(Number(lastBar[1]) + Number(lastBar[2])).toBe(shape.size - 10);   // the stop's last bar ends where the right quiet zone starts
  });
});
