import { describe, expect, it } from "vitest";
import { code6 } from "./code6";

describe("code6 (a document number as six digits)", () => {
  it("pads a number and leaves a missing one blank (never 00null)", () => {
    expect(code6(42)).toBe("000042");
    expect(code6("000042")).toBe("000042");
    expect(code6(null)).toBe("");
    expect(code6(undefined)).toBe("");
    expect(code6("")).toBe("");
  });
});
