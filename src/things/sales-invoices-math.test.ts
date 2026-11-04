import { describe, expect, it } from "vitest";
import { bankPaid, bankRowErrors, makingBase, readDiscount, sentBanks, totalsOf } from "./sales-invoices-math";

describe("sales invoice sums are exact piastres", () => {
  it("percent discount rounds half up on whole piastres", () => {
    expect(readDiscount("percent", "15", 12345)).toMatchObject({ value: 1852, tooBig: false, sent: { kind: "percent", value: 15 } }); // 1851.75 -> 1852
    expect(readDiscount("percent", "10", 5)).toMatchObject({ value: 1 });                                                           // 0.5 -> 1
    expect(readDiscount("percent", "10", 4).value).toBe(0);                                                                         // 0.4 -> 0
    expect(readDiscount("percent", "101", 100).invalid).toBe(true);
    expect(readDiscount("percent", "١٠", 1000).value).toBe(100);                                                                    // Arabic digits
  });
  it("amount discount is typed money, never above the making charges", () => {
    expect(readDiscount("amount", "12.34", 1234)).toMatchObject({ value: 1234, tooBig: false });
    expect(readDiscount("amount", "12.35", 1234).tooBig).toBe(true);
    for (const bad of ["0", "-1", "1.234", "abc", "1e3"]) expect(readDiscount("amount", bad, 99999).invalid).toBe(true);
    expect(readDiscount("amount", "   ", 100)).toEqual({ invalid: false, value: 0, tooBig: false, sent: undefined });
  });
  it("0.1 + 0.2 style sums stay whole", () => {
    expect(bankPaid([{ bankAccountId: "a", amount: "0.10" }, { bankAccountId: "b", amount: "0.20" }])).toBe(30);
    expect(makingBase([{ makingCharge: 10 }, { makingCharge: 20 }])).toBe(30);
  });
  it("totals: gross - discount, paid = cash + banks, left = total - paid", () => {
    const t = totalsOf({ lines: [{ linePrice: 100050 }, { linePrice: 25025 }], discount: 1000, cash: "500.00", banks: [{ bankAccountId: "a", amount: "100.05" }] });
    expect(t).toEqual({ gross: 125075, discount: 1000, total: 124075, paid: 50000 + 10005, left: 124075 - 60005 });
  });
  it("a reservation's deposit counts as paid and its total is the gross", () => {
    const t = totalsOf({ lines: [], discount: 0, made: { totals: { total: 90000, paid: 20000 } }, cash: "", banks: [] });
    expect(t).toMatchObject({ gross: 90000, total: 90000, paid: 20000, left: 70000 });
  });
  it("bank rows: half a row, a repeated account, too many decimals, and what is sent", () => {
    const rows = [{ bankAccountId: "a", amount: "10.5" }, { bankAccountId: "a", amount: "1" }, { bankAccountId: "", amount: "3" }, { bankAccountId: "b", amount: "" }, { bankAccountId: "c", amount: "1.999" }];
    expect(bankRowErrors(rows)).toEqual([{}, { account: "duplicateAccount" }, { account: "required" }, { amount: "required" }, { amount: "invalid" }]);
    expect(sentBanks(rows.slice(0, 2))).toEqual([{ bankAccountId: "a", amount: 1050 }, { bankAccountId: "a", amount: 100 }]);
  });
});
