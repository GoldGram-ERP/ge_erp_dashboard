import { describe, expect, it } from "vitest";
import { qrShape, qrSvgText } from "./qr";

describe("qr", () => {
  it("draws the same code for the same text and a different one for another text", () => {
    expect(qrShape("88").d).toBe(qrShape("88").d);
    expect(qrShape("88").d).not.toBe(qrShape("89").d);
  });
  it("is a square with a quiet zone and only straight path commands (nothing a markup parser could take for HTML)", () => {
    const s = qrShape("000123");
    expect(s.size).toBeGreaterThanOrEqual(25);   // version 1 is 21 modules, plus 2 of quiet zone on each side
    expect(s.d).toMatch(/^(?:M\d+ \d+h\d+v1h-\d+z)+$/);
    expect(qrSvgText("000123")).toContain("<svg");
    expect(qrSvgText("000123")).not.toMatch(/<script|onload/i);
  });
});
