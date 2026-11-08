import { describe, expect, it } from "vitest";
import { bankPaid, bankRowErrors, formRowOfRefusal, linePriceOf, makingBase, paymentErrors, paymentKeyOf, readDiscount, sentBanks, totalsOf } from "./sales-invoices-math";
import { pricePerGram } from "./item-math";

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
});

describe("the totals bar", () => {
  it("several lines with a discount: gold, workmanship, gross, discount, workmanship left, paid, remaining", () => {
    const lines = [{ linePrice: 100050, goldValue: 90000 }, { linePrice: 25025, goldValue: 20020 }];
    const t = totalsOf({ lines, discount: 1000, cash: "500.00", banks: [{ bankAccountId: "a", amount: "100.05" }] });
    expect(t).toEqual({ gold: 110020, making: 15055, gross: 125075, discount: 1000, makingLeft: 14055, total: 124075, paid: 60005, left: 64070 });
  });
  it("zero workmanship: gross is the gold, nothing to discount", () => {
    expect(totalsOf({ lines: [{ linePrice: 180401, goldValue: 180401 }], discount: 0, cash: "1804.01", banks: [] }))
      .toEqual({ gold: 180401, making: 0, gross: 180401, discount: 0, makingLeft: 0, total: 180401, paid: 180401, left: 0 });
  });
  it("cash + 3 banks pay a sale to the piastre", () => {
    const banks = [{ bankAccountId: "a", amount: "10000.01" }, { bankAccountId: "b", amount: "20000.02" }, { bankAccountId: "c", amount: "6581.17" }];
    const t = totalsOf({ lines: [{ linePrice: 5658120, goldValue: 5412027 }], discount: 0, cash: "20000", banks });
    expect(t).toMatchObject({ gross: 5658120, making: 246093, paid: 5658120, left: 0 });
  });
  it("overpaid is a negative remaining", () => {
    expect(totalsOf({ lines: [{ linePrice: 1000, goldValue: 900 }], discount: 0, cash: "10.01", banks: [] }).left).toBe(-1);
  });
  it("an invoice from a reservation takes the reservation's split, discount and deposit", () => {
    const made = { totals: { grossTotal: 100000, goldTotal: 80000, discount: 5000, paid: 20000 } };
    expect(totalsOf({ lines: [], discount: 5000, made, cash: "", banks: [] }))
      .toEqual({ gold: 80000, making: 20000, gross: 100000, discount: 5000, makingLeft: 15000, total: 95000, paid: 20000, left: 75000 });
  });
});

describe("the payment block", () => {
  it("bank rows: half a row, a repeated account, too many decimals, and what is sent", () => {
    const rows = [{ bankAccountId: "a", amount: "10.5" }, { bankAccountId: "a", amount: "1" }, { bankAccountId: "", amount: "3" }, { bankAccountId: "b", amount: "" }, { bankAccountId: "c", amount: "1.999" }];
    expect(bankRowErrors(rows)).toEqual([{}, { account: "duplicateAccount" }, { account: "required" }, { amount: "required" }, { amount: "invalid" }]);
    expect(sentBanks(rows.slice(0, 2))).toEqual([{ bankAccountId: "a", amount: 1050 }, { bankAccountId: "a", amount: 100 }]);
    expect(sentBanks([{ bankAccountId: "", amount: "" }])).toEqual([]);
  });
  it("whole block: cash, rows, nothing typed and over the limit", () => {
    expect(paymentErrors("", [{ bankAccountId: "", amount: "" }], "any")).toEqual({ sum: "required" });
    expect(paymentErrors("", [{ bankAccountId: "", amount: "" }])).toEqual({});
    expect(paymentErrors("0", [], "any")).toEqual({ cash: "invalid" });
    expect(paymentErrors("1.5", [{ bankAccountId: "a", amount: "" }, { bankAccountId: "a", amount: "2" }], "any")).toEqual({ bank0Amount: "required", bank1Account: "duplicateAccount" });
    expect(paymentErrors("99999999999.99", [{ bankAccountId: "a", amount: "0.01" }], "any")).toEqual({ sum: "invalid" });
    expect(paymentErrors("12.50", [{ bankAccountId: "a", amount: "3" }, { bankAccountId: "b", amount: "4.25" }], "any")).toEqual({});
  });
  it("a refusal of the Nth sent row lands under that row of the form", () => {
    const rows = [{ bankAccountId: "", amount: "" }, { bankAccountId: "a", amount: "1" }, { bankAccountId: "b", amount: "" }, { bankAccountId: "c", amount: "2" }];
    expect(formRowOfRefusal(rows, 1)).toBe(3);
    expect(paymentKeyOf("bankPayments.1.amount", rows)).toBe("bank3Amount");
    expect(paymentKeyOf("bankPayments.0.bankAccountId", rows)).toBe("bank1Account");
    expect(paymentKeyOf("cashRefund", rows, "cashRefund")).toBe("cash");
    expect(paymentKeyOf("cash", rows, "cashRefund")).toBeUndefined();
    expect(paymentKeyOf("bankPayments", rows)).toBe("sum");
    expect(paymentKeyOf("note", rows)).toBeUndefined();
  });
});

describe("the line price", () => {
  it("worked example: 21K at 4,123.45 a gram, 4.375 g, workmanship 187.50 a gram, count 3", () => {
    const perGram = pricePerGram({ sellPrice: 412345, silverSellPrice: null }, "21")!;
    expect(linePriceOf(perGram, BigInt(4375), BigInt(18750), 3)).toEqual({
      pieceGold: BigInt(1804009), pieceMaking: BigInt(82031), piece: BigInt(1886040), gold: BigInt(5412027), making: BigInt(246093), line: BigInt(5658120),
    });
  });
  it("each piece is rounded before the count: 3 x a half piastre is 3 piastres, not 2", () => {
    expect(linePriceOf(BigInt(1), BigInt(500), BigInt(0), 3)).toMatchObject({ pieceGold: BigInt(1), gold: BigInt(3), line: BigInt(3) }); // 0.5 -> 1 each
  });
  it("18K is the 21K price x 18 / 21 half up", () => {
    const perGram = pricePerGram({ sellPrice: 412345, silverSellPrice: null }, "18")!;
    expect(perGram).toBe(BigInt(353439)); // 353438.57 -> 353439
    expect(linePriceOf(perGram, BigInt(1000), BigInt(0), 1).line).toBe(BigInt(353439));
  });
});
