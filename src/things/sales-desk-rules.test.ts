import { describe, expect, it } from "vitest";
import { LINES_MAX, lockNote, plannedAgainst, readCustomer, readLines } from "./sales-desk-rules";

// The engine's own translator answers the key when a message is missing; the rules are the real ones.
const tr: any = { t: (_ns: string, key: string, v?: Record<string, unknown>) => (v ? `${key}|${JSON.stringify(v)}` : key) };
const ok = { customerName: " Mona ", customerPhone: "01012345678", nationalId: "" };

describe("customer fields", () => {
  it("the phone takes 8 to 15 digits, and Arabic-Indic or Persian digits become Latin", () => {
    expect(readCustomer(tr, { ...ok, customerPhone: "١٢٣٤٥٦٧٨" }).payload?.customerPhone).toBe("12345678");
    expect(readCustomer(tr, { ...ok, customerPhone: "۰۱۰۱۲۳۴۵۶۷۸" }).payload?.customerPhone).toBe("01012345678");
    expect(readCustomer(tr, { ...ok, customerPhone: "123456789012345" }).payload?.customerPhone).toBe("123456789012345");
    for (const bad of ["1234567", "1234567890123456", "0101 234 5678", "+201012345678", "010-1234-5678", "abc12345678"]) {
      expect(readCustomer(tr, { ...ok, customerPhone: bad }).errors, bad).toEqual({ customerPhone: "salesInvoices.phoneInvalid" });
    }
    expect(readCustomer(tr, { ...ok, customerPhone: "" }).errors).toEqual({ customerPhone: "fieldErrors.required" });
  });
  it("the national ID is optional, 14 digits, Arabic digits normalised; the name is trimmed and required", () => {
    expect(readCustomer(tr, ok)).toEqual({ errors: {}, payload: { customerName: "Mona", customerPhone: "01012345678" } });
    expect(readCustomer(tr, { ...ok, nationalId: "٢٩٠٠١٠١١٢٣٤٥٦٧" }).payload?.nationalId).toBe("29001011234567");
    for (const bad of ["2900101123456", "290010112345678", "2900101123456a"]) expect(readCustomer(tr, { ...ok, nationalId: bad }).errors, bad).toEqual({ nationalId: "salesInvoices.nationalIdInvalid" });
    expect(readCustomer(tr, { ...ok, customerName: "  " }).errors).toEqual({ customerName: "fieldErrors.required" });
    expect(readCustomer(tr, { ...ok, customerName: "x".repeat(101) }).errors).toEqual({ customerName: "fieldErrors.tooLong" });
  });
});

describe("item + count lines", () => {
  it("sends item and quantity as numbers, counts typed in Arabic digits included", () => {
    expect(readLines([{ itemId: "ring", count: "2" }, { itemId: "chain", count: "٣" }]).payload).toEqual([{ itemId: "ring", quantity: 2 }, { itemId: "chain", quantity: 3 }]);
  });
  it("refuses no lines, a missing item, a repeated item, and counts that are empty, zero, fractional, negative or above the maximum", () => {
    expect(LINES_MAX).toBe(100);
    expect(readLines([]).errors).toEqual({ lines: "required" });
    expect(readLines([{ itemId: "", count: "1" }]).errors).toEqual({ line0Item: "required" });
    expect(readLines([{ itemId: "a", count: "1" }, { itemId: "a", count: "1" }]).errors).toEqual({ line1Item: "duplicateItem" });
    for (const bad of ["0", "1.5", "-1", "101", "abc", "1e2"]) expect(readLines([{ itemId: "a", count: bad }]).errors, bad).toEqual({ line0Count: "invalid" });
    expect(readLines([{ itemId: "a", count: "" }]).errors).toEqual({ line0Count: "required" });
    expect(readLines([{ itemId: "a", count: "100" }]).payload).toEqual([{ itemId: "a", quantity: 100 }]);
    expect(readLines(Array.from({ length: 101 }, (_, i) => ({ itemId: `i${i}`, count: "1" }))).errors).toEqual({ lines: "invalid" });
  });
});

describe("planned payment against the total", () => {
  // 2 rings of 5 g at the day's price: 54,255.00 EGP = 5,425,500 piastres.
  it("10,000.00 cash + 44,255.00 in a bank leaves nothing; 10,000.00 alone leaves 44,255.00", () => {
    expect(plannedAgainst(5_425_500, "10000", [{ bankAccountId: "b1", amount: "44255.00" }])).toMatchObject({ errors: {}, planned: 5_425_500, left: 0, over: false });
    expect(plannedAgainst(5_425_500, "10000", [])).toMatchObject({ planned: 1_000_000, left: 4_425_500, over: false });
  });
  it("more than the total is flagged; the payment block's own refusals come through (bad cash, a bank amount without an account)", () => {
    expect(plannedAgainst(100, "1.01", [])).toMatchObject({ left: -1, over: true });
    expect(plannedAgainst(100, "0", []).errors).toEqual({ cash: "invalid" });
    expect(plannedAgainst(100, "", [{ bankAccountId: "", amount: "5" }]).errors).toEqual({ bank0Account: "required" });
  });
});

describe("lock note", () => {
  it("an open draft before midnight says it can be edited; after midnight it names the day it was made", () => {
    expect(lockNote({ status: "open", locked: false, createdDay: "2026-11-05" }, tr)).toEqual({ state: "editable", text: "salesDesk.lock.editable" });
    expect(lockNote({ status: "open", locked: true, createdDay: "2026-11-04" }, tr)).toEqual({ state: "locked", text: 'salesDesk.lock.reason|{"day":"2026-11-04"}' });
  });
  it("a completed or deleted draft says so, whatever `locked` is", () => {
    expect(lockNote({ status: "completed", locked: false, createdDay: "2026-11-05" }, tr).state).toBe("completed");
    expect(lockNote({ status: "deleted", locked: true, createdDay: "2026-11-04" }, tr).state).toBe("deleted");
  });
});
