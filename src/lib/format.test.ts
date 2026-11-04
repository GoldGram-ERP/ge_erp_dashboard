import { describe, expect, it } from "vitest";
import { latinNumber, milligramsText, piastresText, typedMilligrams, typedPiastres } from "./format";

describe("money is whole piastres", () => {
  it("types to piastres", () => {
    expect(typedPiastres("5125.50")).toBe(512550);
    expect(typedPiastres("5125.5")).toBe(512550);
    expect(typedPiastres("0.07")).toBe(7);
    expect(typedPiastres("١٢٣٫٤٥")).toBe(12345);        // Arabic-Indic digits and decimal mark
    expect(typedPiastres("19.99")).toBe(1999);           // a float would give 1998.9999
    expect(typedPiastres("1.234")).toBeUndefined();      // three decimals refused
    expect(typedPiastres("abc")).toBeUndefined();
    expect(typedPiastres("")).toBeUndefined();
  });
  it("shows with thousands marks and two decimals", () => {
    expect(piastresText(512550)).toBe("5,125.50");
    expect(piastresText(5)).toBe("0.05");
    expect(piastresText(-100050)).toBe("-1,000.50");
    expect(piastresText(null)).toBe("—");
  });
});

describe("gold weight is whole milligrams", () => {
  it("types to milligrams", () => {
    expect(typedMilligrams("12.345")).toBe(12345);
    expect(typedMilligrams("12.3")).toBe(12300);
    expect(typedMilligrams("0.001")).toBe(1);
    expect(typedMilligrams("12.3456")).toBeUndefined();
  });
  it("shows three decimals", () => {
    expect(milligramsText(12345)).toBe("12.345");
    expect(milligramsText(1234567)).toBe("1,234.567");
    expect(milligramsText(undefined)).toBe("—");
  });
  it("latinNumber maps digits", () => { expect(latinNumber("٠١٢٫٥")).toBe("012.5"); });
});

import { dateTimeText as dtt, timeText as tt } from "./format";
describe("12-hour time", () => {
  it("shows the Cairo clock with AM/PM, never 24 hours", () => {
    expect(tt("2026-11-02T11:51:00Z", "en")).toBe("1:51 PM");
    expect(tt("2026-11-03T10:09:00Z", "en")).toBe("12:09 PM");
    expect(tt("2026-11-03T22:05:00Z", "ar")).toBe("12:05 ص");
    expect(dtt("2026-11-02T11:51:00Z", "en")).toBe("2026-11-02 1:51 PM");
  });
});
