import { describe, expect, it } from "vitest";
import { messageInput, paymentChoices, quoteBody, secondChoices, splitProblem, type Quote, type QuoteForm } from "./sales-desk-quote";
import { buildDeskMessage } from "./sales-desk-whatsapp";

const form: QuoteForm = { operation: "sell", metal: "gold", payment: "cash", discountPercent: 0, manualSell: "", manualBuy: "", wrapping: "wrapped", lines: [{ itemId: "a", count: "2" }] };
// What the backend answered for one 10 g bar x 2 at 6,255 a gram + 75 workmanship (numbers only, no client arithmetic is tested here).
const quote: Quote = { totalPiastres: 14_447_200, beforeDiscountPiastres: 14_447_200, feeTotalPiastres: 150_000, units: 2, weightMg: 20_000, pricePerGram21: 625_500, goldPriceUsed: 625_500, manualPriceUsed: true,
  lines: [{ itemId: "a", itemName: "سبيكة 10 جرام", karat: "21", weightMg: 10_000, quantity: 2, feePerGram: 7_500, pricePiastres: 7_223_600 }] };
const parts = { date: "2026-11-05", branch: "الفرع", seller: "البائع", customer: "عميل", nationalId: "", phone: "01012345678", split: "" };

describe("the quote body", () => {
  it("is the form as the endpoint takes it, Latin digits, no price", () => {
    expect(quoteBody({ ...form, lines: [{ itemId: "a", count: "٢" }], manualSell: "٦٢٥٥.5" })).toEqual({ operation: "sell", metal: "gold", payment: "cash", manualSellPrice: "6255.5", lines: [{ itemId: "a", quantity: 2 }] });
  });
  it("carries the discount on a sell only, the buy price on a buy, the wrapping on silver only", () => {
    expect(quoteBody({ ...form, discountPercent: 10 })?.discountPercent).toBe(10);
    expect(quoteBody({ ...form, operation: "buy", discountPercent: 10, manualBuy: "6100", manualSell: "1" })).toMatchObject({ manualBuyPrice: "6100" });
    expect(quoteBody({ ...form, operation: "buy", discountPercent: 10 })?.discountPercent).toBeUndefined();
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

describe("payments", () => {
  it("a buy takes cash or bank transfer; a second method is never Visa, never the first, never on a buy", () => {
    expect(paymentChoices("buy")).toEqual(["cash", "bank_transfer"]);
    expect(secondChoices("sell", "cash")).toEqual(["instapay", "bank_transfer"]);
    expect(secondChoices("sell", "visa")).toEqual([]);
    expect(secondChoices("buy", "cash")).toEqual([]);
  });
  it("the split must be a positive amount not above the total", () => {
    expect(splitProblem("", 100)).toBe("required");
    expect(splitProblem("0", 100)).toBe("invalid");
    expect(splitProblem("1.01", 100)).toBe("tooBig");
    expect(splitProblem("1", 100)).toBe("");
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
  it("Visa prints both prices and the cash total; two payments print the split and the rest", () => {
    const visa = buildDeskMessage(messageInput({ ...form, payment: "visa" }, { ...quote, pricePerGram21: 638_000, totalPiastres: 14_736_000 }, { ...quote, totalPiastres: 14_447_200 }, parts));
    expect(visa).toContain("سعر جرام 21: 6,255\nسعر الجرام بعد 2%: 6,380");
    expect(visa).toContain("إجمالي السعر قبل 2%: 144,472\nإجمالي السعر بعد 2%: 147,360");
    const two = buildDeskMessage(messageInput({ ...form, payment: "cash" }, quote, null, { ...parts, payment2: "instapay", split: "1000" }));
    expect(two).toContain("كاش: 1,000 جنيه\nانستا باي: 143,472 جنيه");
  });
  it("a discount prints before and after; a buy says cashback", () => {
    expect(buildDeskMessage(messageInput({ ...form, discountPercent: 5 }, { ...quote, beforeDiscountPiastres: 14_500_000 }, null, parts))).toContain("خصم 5% على المصنعية");
    expect(buildDeskMessage(messageInput({ ...form, operation: "buy" }, quote, null, parts))).toContain("كاش باك: 75");
  });
});
