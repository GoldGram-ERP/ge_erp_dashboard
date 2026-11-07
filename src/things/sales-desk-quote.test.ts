import { describe, expect, it } from "vitest";
import { deskChoices, messageInput, paymentChoices, quoteBody, restoreChoices, secondChoices, splitProblem, type DraftChoices, type Quote, type QuoteForm } from "./sales-desk-quote";
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
    expect(splitProblem("0.99", 100)).toBe("");
    expect(splitProblem("1", 100), "nothing would be left for the second method").toBe("tooBig");
  });
});

// The desk's choices travel with a draft (backend 0.1.22): what is sent from the desk state and what the desk is rebuilt from.
const lines = [{ itemId: "a", quantity: 2 }];
describe("the choices a draft saves", () => {
  it("a default sell says gold, no percent, no typed price and the one method for the whole total", () => {
    expect(deskChoices(form, 1000, { split: "" }, lines)).toEqual({ operation: "sell", metal: "gold", paymentMethods: [{ method: "cash", amountPiastres: 1000 }], lines });
  });
  it("carries the percent on a sell only, both typed prices as sent (Latin digits), and the wrapping on silver lines only", () => {
    expect(deskChoices({ ...form, discountPercent: 10, manualSell: "٦٢٥٥.5", manualBuy: "6100" }, 1000, { split: "" }, lines)).toMatchObject({ discountPercent: 10, manualSellPrice: "6255.5", manualBuyPrice: "6100" });
    expect(deskChoices({ ...form, operation: "buy", discountPercent: 10 }, 1000, { split: "" }, lines)).not.toHaveProperty("discountPercent");
    expect(deskChoices({ ...form, metal: "silver", wrapping: "unwrapped" }, 1000, { split: "" }, lines).lines).toEqual([{ itemId: "a", quantity: 2, wrapping: "unwrapped" }]);
    expect(deskChoices(form, 1000, { split: "" }, lines).lines[0]).not.toHaveProperty("wrapping");
  });
  it("two methods: the first takes the split, the second the rest; Visa is alone", () => {
    expect(deskChoices(form, 1000, { payment2: "instapay", split: "4.5" }, lines).paymentMethods).toEqual([{ method: "cash", amountPiastres: 450 }, { method: "instapay", amountPiastres: 550 }]);
    expect(deskChoices({ ...form, payment: "visa" }, 1000, { split: "" }, lines).paymentMethods).toEqual([{ method: "visa", amountPiastres: 1000 }]);
  });
});

describe("the desk rebuilt from a draft", () => {
  const draft: DraftChoices = { operation: "buy", metal: "silver", discountPercent: 0, manualSellPrice: null, manualBuyPrice: "6100.50", payByVisa: false, totals: { discount: 0 },
    paymentMethods: [{ method: "cash", amountPiastres: 450 }, { method: "bank_transfer", amountPiastres: 550 }], lines: [{ wrapping: "unwrapped" }] };
  it("restores Buy/Silver, wrapping, typed prices and the split exactly", () => {
    expect(restoreChoices(draft)).toEqual({ operation: "buy", metal: "silver", wrapping: "unwrapped", payment: "cash", payment2: "bank_transfer", split: "4.50", pct: 0, manual: { sell: "", buy: "6100.50" }, typedDiscount: "" });
  });
  it("a percent discount is the percent, never a typed amount; a typed discount stays typed", () => {
    expect(restoreChoices({ ...draft, operation: "sell", discountPercent: 10, totals: { discount: 5000 } })).toMatchObject({ pct: 10, typedDiscount: "" });
    expect(restoreChoices({ ...draft, operation: "sell", discountPercent: 0, totals: { discount: 5000 } })).toMatchObject({ pct: 0, typedDiscount: "50.00" });
  });
  it("an older draft (no desk fields) is a gold sell paid in cash, or by Visa when it was", () => {
    expect(restoreChoices({ totals: { discount: 0 }, lines: [{ wrapping: null }] })).toEqual({ operation: "sell", metal: "gold", wrapping: "wrapped", payment: "cash", payment2: "", split: "", pct: 0, manual: { sell: "", buy: "" }, typedDiscount: "" });
    expect(restoreChoices({ payByVisa: true, paymentMethods: null, totals: { discount: 0 } }).payment).toBe("visa");
  });
  it("one method restores with no second", () => {
    expect(restoreChoices({ ...draft, paymentMethods: [{ method: "instapay", amountPiastres: 1000 }] })).toMatchObject({ payment: "instapay", payment2: "", split: "" });
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
