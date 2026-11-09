import { describe, expect, it } from "vitest";
import { bankMethodChoices, blankDeskBank, deskChoices, messageInput, payRows, quoteBody, quotePayment, restoreChoices, visaChosen, type DeskBank, type DraftChoices, type Quote, type QuoteForm } from "./sales-desk-quote";
import { buildDeskMessage } from "./sales-desk-whatsapp";

const form: QuoteForm = { operation: "sell", metal: "gold", payment: "cash", manualSell: "", manualBuy: "", wrapping: "wrapped", lines: [{ itemId: "a", count: "2" }] };
// What the backend answered for one 10 g bar x 2 at 6,255 a gram + 75 workmanship (numbers only, no client arithmetic is tested here).
const quote: Quote = { totalPiastres: 14_447_200, beforeDiscountPiastres: 14_447_200, feeTotalPiastres: 150_000, units: 2, weightMg: 20_000, pricePerGram21: 625_500, goldPriceUsed: 625_500, manualPriceUsed: true,
  lines: [{ itemId: "a", itemName: "سبيكة 10 جرام", karat: "21", weightMg: 10_000, quantity: 2, feePerGram: 7_500, pricePiastres: 7_223_600 }] };
const parts = { date: "2026-11-05", branch: "الفرع", channel: "قطاعي", seller: "البائع", customer: "عميل", nationalId: "", phone: "01012345678", rows: [] };
const bank = (method: DeskBank["method"], amount: string, bankAccountId = "acc"): DeskBank => ({ bankAccountId, amount, method });

describe("the quote body", () => {
  it("is the form as the endpoint takes it, Latin digits, no price", () => {
    expect(quoteBody({ ...form, lines: [{ itemId: "a", count: "٢" }], manualSell: "٦٢٥٥.5" })).toEqual({ operation: "sell", metal: "gold", payment: "cash", manualSellPrice: "6255.5", lines: [{ itemId: "a", quantity: 2 }] });
  });
  it("carries the discount, an amount or a percent, on a sell only, the buy price on a buy, the wrapping on silver only", () => {
    expect(quoteBody({ ...form, discount: { kind: "percent", value: 10 } })?.cashDiscount).toEqual({ kind: "percent", value: 10 });
    expect(quoteBody({ ...form, discount: { kind: "amount", value: 5000 } })?.cashDiscount).toEqual({ kind: "amount", value: 5000 });
    expect(quoteBody({ ...form, discount: { kind: "amount", value: 0 } })).not.toHaveProperty("cashDiscount");
    expect(quoteBody({ ...form, operation: "buy", discount: { kind: "percent", value: 10 }, manualBuy: "6100", manualSell: "1" })).toMatchObject({ manualBuyPrice: "6100" });
    expect(quoteBody({ ...form, operation: "buy", discount: { kind: "percent", value: 10 } })).not.toHaveProperty("cashDiscount");
    expect(quoteBody({ ...form, metal: "silver", wrapping: "unwrapped" })?.lines[0].wrapping).toBe("unwrapped");
    expect(quoteBody(form)?.lines[0].wrapping).toBeUndefined();
  });
  it("is null while a line has no item or a bad count, or a typed price is invalid", () => {
    for (const bad of [{ lines: [{ itemId: "", count: "1" }] }, { lines: [{ itemId: "a", count: "0" }] }, { lines: [{ itemId: "a", count: "1000" }] }, { manualSell: "0" }, { manualSell: "12.345" }, { manualSell: "abc" }]) {
      expect(quoteBody({ ...form, ...bad })).toBeNull();
    }
  });
  it("can be asked again in cash (the 'before Visa' total)", () => {
    expect(quoteBody({ ...form, payment: "visa" }, "cash")?.payment).toBe("cash");
  });
});

describe("the one payment list", () => {
  it("a bank row is paid by instapay, a bank transfer or Visa; on a buy by bank transfer only", () => {
    expect(bankMethodChoices("sell")).toEqual(["instapay", "bank_transfer", "visa"]);
    expect(bankMethodChoices("buy")).toEqual(["bank_transfer"]);
    expect(blankDeskBank("sell")).toEqual({ bankAccountId: "", amount: "", method: "instapay" });
    expect(blankDeskBank("buy").method).toBe("bank_transfer");
  });
  it("Visa on a sale is what the quote prices, and a buy is never Visa", () => {
    expect(visaChosen("sell", [bank("instapay", "1"), bank("visa", "2")])).toBe(true);
    expect(visaChosen("sell", [bank("instapay", "1")])).toBe(false);
    expect(visaChosen("buy", [bank("visa", "1")])).toBe(false);
    expect(quotePayment("sell", [bank("visa", "")])).toBe("visa");
    expect(quotePayment("sell", [])).toBe("cash");
  });
  it("is the cash row first, then each filled bank row, with the way each is paid and its amount in piastres", () => {
    expect(payRows("50.00", [bank("instapay", "30"), bank("bank_transfer", "20.50", "b2")])).toEqual([
      { method: "cash", amountPiastres: 5000 }, { method: "instapay", amountPiastres: 3000 }, { method: "bank_transfer", amountPiastres: 2050 },
    ]);
  });
  it("leaves out an empty cash box and the bank rows that are not filled (no account, or no amount), as the backend counts them", () => {
    expect(payRows("", [bank("instapay", "30"), bank("visa", "", "acc2"), bank("bank_transfer", "9", "")])).toEqual([{ method: "instapay", amountPiastres: 3000 }]);
    expect(payRows("", [])).toEqual([]);
  });
});

// The desk's choices travel with a draft: what is sent from the desk state and what the desk is rebuilt from.
const lines = [{ itemId: "a", quantity: 2 }];
describe("the choices a draft saves", () => {
  it("a default sell says gold, no typed price and no payment list", () => {
    expect(deskChoices(form, [], lines)).toEqual({ operation: "sell", metal: "gold", lines });
  });
  it("carries both typed prices as sent (Latin digits), and the wrapping on silver lines only; the discount is not here (it is the draft's cashDiscount)", () => {
    expect(deskChoices({ ...form, manualSell: "٦٢٥٥.5", manualBuy: "6100" }, [], lines)).toMatchObject({ manualSellPrice: "6255.5", manualBuyPrice: "6100" });
    expect(deskChoices({ ...form, discount: { kind: "percent", value: 10 } }, [], lines)).not.toHaveProperty("discountPercent");
    expect(deskChoices({ ...form, metal: "silver", wrapping: "unwrapped" }, [], lines).lines).toEqual([{ itemId: "a", quantity: 2, wrapping: "unwrapped" }]);
    expect(deskChoices(form, [], lines).lines[0]).not.toHaveProperty("wrapping");
  });
  it("sends the payment list as the methods of the rows", () => {
    const rows = payRows("45", [bank("instapay", "55")]);
    expect(deskChoices(form, rows, lines).paymentMethods).toEqual([{ method: "cash", amountPiastres: 4500 }, { method: "instapay", amountPiastres: 5500 }]);
  });
});

describe("the desk rebuilt from a draft", () => {
  const draft: DraftChoices = { operation: "sell", metal: "silver", discountPercent: 0, manualSellPrice: null, manualBuyPrice: "6100.50", payByVisa: false, totals: { discount: 0 }, cash: 450,
    bankPayments: [{ bankAccountId: "acc", amount: 550 }], paymentMethods: [{ method: "cash", amountPiastres: 450 }, { method: "instapay", amountPiastres: 550 }], lines: [{ wrapping: "unwrapped" }] };
  it("restores the metal, wrapping, typed prices, the cash and each bank row with its way", () => {
    expect(restoreChoices(draft)).toEqual({ operation: "sell", metal: "silver", wrapping: "unwrapped", cash: "4.50", banks: [{ bankAccountId: "acc", amount: "5.50", method: "instapay" }],
      kind: "amount", disc: "", manual: { sell: "", buy: "6100.50" } });
  });
  it("a percent discount is the percent; a typed discount stays typed as an amount", () => {
    expect(restoreChoices({ ...draft, discountPercent: 10, totals: { discount: 5000 } })).toMatchObject({ kind: "percent", disc: "10" });
    expect(restoreChoices({ ...draft, discountPercent: 0, totals: { discount: 5000 } })).toMatchObject({ kind: "amount", disc: "50.00" });
    expect(restoreChoices({ ...draft, totals: { discount: 0 } })).toMatchObject({ kind: "amount", disc: "" });
  });
  it("an older draft's methods were a plan beside the money: its bank rows are bank transfers, or Visa when it was priced by Visa", () => {
    const old = { ...draft, paymentMethods: [{ method: "cash" as const, amountPiastres: 500 }, { method: "instapay" as const, amountPiastres: 500 }] };   // two methods, one bank row: not the rows
    expect(restoreChoices(old).banks).toEqual([{ bankAccountId: "acc", amount: "5.50", method: "bank_transfer" }]);
    expect(restoreChoices({ ...old, payByVisa: true, cash: 0 }).banks[0].method).toBe("visa");
  });
  it("an older draft (no desk fields) is a gold sell with nothing planned, and a Visa draft with no money rows keeps its Visa row so the total stays", () => {
    expect(restoreChoices({ totals: { discount: 0 }, lines: [{ wrapping: null }] })).toEqual({ operation: "sell", metal: "gold", wrapping: "wrapped", cash: "", banks: [], kind: "amount", disc: "", manual: { sell: "", buy: "" } });
    expect(restoreChoices({ payByVisa: true, paymentMethods: null, totals: { discount: 0 } }).banks).toEqual([{ bankAccountId: "", amount: "", method: "visa" }]);
  });
});

describe("the WhatsApp text of a quote", () => {
  it("is the reference text built from the backend numbers", () => {
    const text = buildDeskMessage(messageInput(form, quote, null, parts));
    expect(text).toBe([
      "التاريخ: 2026-11-05", "الفرع: الفرع", "قناة البيع: قطاعي", "اسم البائع: البائع", "اسم العميل: عميل", "رقم البطاقة: ", "رقم العميل: 01012345678", "تفاصيل القطع: بيع",
      "سعر الجرام: 6,255", "سعر جرام 21 المعتمد: 6,255", "مصنعية: 75", "الأوزان:", "2 سبيكة 10 جرام", "إجمالي السعر: 144,472", "طريقة الدفع: كاش",
    ].join("\n"));
  });
  it("prints the stored channel name as it is, with no fallback to Retail", () => {
    const text = buildDeskMessage(messageInput(form, quote, null, { ...parts, channel: "الموقع" }));
    expect(text).toContain("قناة البيع: الموقع\n");
    expect(text).not.toContain("قطاعي");
    expect(buildDeskMessage(messageInput(form, quote, null, { ...parts, channel: "" }))).not.toContain("قطاعي");
  });
  it("names the way of the first row, and Visa prints both prices and the cash total", () => {
    expect(buildDeskMessage(messageInput(form, quote, null, { ...parts, rows: payRows("", [bank("instapay", "100")]) }))).toContain("طريقة الدفع: انستا باي");
    const visa = buildDeskMessage(messageInput({ ...form, payment: "visa" }, { ...quote, pricePerGram21: 638_000, totalPiastres: 14_736_000 }, { ...quote, totalPiastres: 14_447_200 }, { ...parts, rows: payRows("", [bank("visa", "100")]) }));
    expect(visa).toContain("سعر جرام 21: 6,255\nسعر الجرام بعد 2%: 6,380");
    expect(visa).toContain("إجمالي السعر قبل 2%: 144,472\nإجمالي السعر بعد 2%: 147,360");
  });
  it("two or more rows print each with its amount, in the order of the list", () => {
    const rows = payRows("1000", [bank("instapay", "1434.72")]);
    expect(buildDeskMessage(messageInput(form, quote, null, { ...parts, rows }))).toContain("كاش: 1,000 جنيه\nانستا باي: 1,434.72 جنيه");
    const three = payRows("1000", [bank("instapay", "500"), bank("bank_transfer", "500", "b2")]);
    expect(buildDeskMessage(messageInput(form, quote, null, { ...parts, rows: three }))).toContain("كاش: 1,000 جنيه\nانستا باي: 500 جنيه\nتحويل بنكي: 500 جنيه");
  });
  it("a percent discount prints the percent and the totals before and after; an amount discount prints the amount the same way; a buy says cashback", () => {
    expect(buildDeskMessage(messageInput({ ...form, discount: { kind: "percent", value: 5 } }, { ...quote, beforeDiscountPiastres: 14_500_000 }, null, parts))).toContain("خصم 5% على المصنعية");
    const amount = buildDeskMessage(messageInput({ ...form, discount: { kind: "amount", value: 100_000 } }, { ...quote, beforeDiscountPiastres: 14_547_200 }, null, parts));
    expect(amount).toContain("خصم 1,000 جنيه على المصنعية");
    expect(amount).toContain("إجمالى سعر قبل خصم: 145,472\nإجمالى سعر بعد خصم: 144,472");
    expect(buildDeskMessage(messageInput({ ...form, operation: "buy" }, quote, null, parts))).toContain("كاش باك: 75");
  });
});
