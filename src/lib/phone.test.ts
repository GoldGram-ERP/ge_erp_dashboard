import { describe, expect, it } from "vitest";
import { isNationalId, isPhone, NATIONAL_ID_LENGTH, PHONE_LENGTH, phoneDigits } from "./phone";

// The same cases as the API's rule (backend #222, src/platform/validation/phone.ts).
describe("the phone rule", () => {
  it("takes 11 digits starting 010, 011, 012 or 015, in Latin or Arabic digits", () => {
    for (const good of ["01012345678", "01112345678", "01212345678", "01512345678", " 01012345678 ", "٠١٠١٢٣٤٥٦٧٨", "۰۱۵۱۲۳۴۵۶۷۸"]) expect(isPhone(good), good).toBe(true);
    expect(phoneDigits("٠١٢٣٤٥٦٧٨٩٠")).toBe("01234567890");
    expect(PHONE_LENGTH).toBe(11);
  });
  it("refuses what the old 8-15 digit rule took, a landline, another prefix and any separator", () => {
    for (const bad of ["", "12345678", "123456789012345", "0223456789", "01312345678", "01412345678", "01612345678", "01912345678", "0101234567", "010123456789", "11012345678", "010-1234567", "010 1234 567", "+201012345678", "0101234567a"]) {
      expect(isPhone(bad), bad).toBe(false);
    }
  });
});

describe("the National ID rule", () => {
  it("is exactly 14 digits, Arabic digits read as Latin", () => {
    expect(isNationalId("29001011234567")).toBe(true);
    expect(isNationalId("٢٩٠٠١٠١١٢٣٤٥٦٧")).toBe(true);
    for (const bad of ["", "2900101123456", "290010112345678", "2900101123456a"]) expect(isNationalId(bad), bad).toBe(false);
    expect(NATIONAL_ID_LENGTH).toBe(14);
  });
});
