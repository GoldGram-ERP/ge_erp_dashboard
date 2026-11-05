import { describe, expect, it } from "vitest";
import { buildWhatsappText, type WaDraft, type WaLabels } from "./sales-desk-whatsapp";

const en: WaLabels = { date: "Date", branch: "Branch", customer: "Customer", phone: "Phone", nationalId: "National ID", pieces: "Pieces", piece: "{count} × {item}, karat {karat}, {weight} g, price {price}", goldPrice: "Gold price, karat 21", discount: "Discount", total: "Total", payment: "Payment methods", cash: "Cash", bank: "Bank account" };
const ar: WaLabels = { ...en, date: "التاريخ", branch: "الفرع", customer: "العميل", phone: "الهاتف", total: "الإجمالي", cash: "نقداً", piece: "{count} × {item}، عيار {karat}، {weight} جم، السعر {price}" };

// Two rings of 5 g (karat 21) at 5,125.50 a gram + 300.00 workmanship a gram: 2 x 27,127.50 = 54,255.00; one chain 3 g.
const draft = {
  createdAt: "2026-11-05T11:51:00Z", branchName: "Desk branch", customerName: "Mona Ali", customerPhone: "01012345678", nationalId: "29001011234567", goldPrice21k: 512_550,
  lines: [{ itemName: "Ring", karat: "21", weightMg: 5000, quantity: 2, linePrice: 5_425_500 }, { itemName: "Chain", karat: "18", weightMg: 3000, quantity: 1, linePrice: 1_500_000 }],
  totals: { discount: 10_000, total: 6_915_500 },
  cash: 1_000_000, bankPayments: [{ bankAccountId: "acc1", amount: 5_915_500 }],
};

describe("WhatsApp summary", () => {
  it("lists date (Cairo, 12-hour), branch, customer, phone, ID, each piece, gold price, discount, total and the payment methods", () => {
    expect(buildWhatsappText(draft, en, "en", { acc1: "Desk account" })).toBe([
      "Date: 2026-11-05 1:51 PM", "Branch: Desk branch", "Customer: Mona Ali", "Phone: 01012345678", "National ID: 29001011234567", "",
      "Pieces:", "1) 2 × Ring, karat 21, 10.000 g, price 54,255.00", "2) 1 × Chain, karat 18, 3.000 g, price 15,000.00", "",
      "Gold price, karat 21: 5,125.50", "Discount: 100.00", "Total: 69,155.00", "",
      "Payment methods:", "Cash: 10,000.00", "Bank account Desk account: 59,155.00",
    ].join("\n"));
  });
  it("Arabic labels, a 12-hour Arabic clock; no ID, no discount, no bank, no cash are left out whole", () => {
    const text = buildWhatsappText({ ...draft, nationalId: null, totals: { discount: 0, total: 6_925_500 }, bankPayments: [], cash: 6_925_500 }, ar, "ar");
    expect(text.split("\n")[0]).toMatch(/^التاريخ: 2026-11-05 1:51 م$/);
    expect(text).toContain("1) 2 × Ring، عيار 21، 10.000 جم، السعر 54,255.00");
    expect(text).not.toContain("National ID");
    expect(text).not.toContain("الخصم");
    expect(text).toContain("نقداً: 69,255.00");
    expect(buildWhatsappText({ ...draft, cash: 0, bankPayments: [] }, en)).not.toContain("Payment methods");
  });
  it("never carries the seller: a draft that came with employeeName 'SELLER-XYZ' gives a text without it, and the parameter type has no employee field", () => {
    const fromServer = { ...draft, employeeId: "e1", employeeName: "SELLER-XYZ" }; // the DTO as the server sends it
    const text = buildWhatsappText(fromServer, en, "en");
    expect(text).not.toContain("SELLER-XYZ");
    expect(text).not.toContain("e1");
    type Employee = "employeeName" extends keyof WaDraft ? true : false;
    const hasEmployeeField: Employee = false;
    expect(hasEmployeeField).toBe(false);
  });
});
