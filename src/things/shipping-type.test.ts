import { describe, expect, it } from "vitest";
import { totalsOf } from "./sales-invoices-math";
import { buildDeskMessage, type DeskMessageInput } from "./sales-desk-whatsapp";

const lines = [{ linePrice: 100_000, goldValue: 90_000 }];

describe("the totals of a shipping sale", () => {
  it("add the delivery after the discount, and ask it to be paid", () => {
    const t = totalsOf({ lines, discount: 1000, cash: "990", banks: [], delivery: 7500 });
    expect([t.gross, t.discount, t.delivery, t.total, t.paid, t.left]).toEqual([100_000, 1000, 7500, 106_500, 99_000, 7500]);
  });
  it("keep a free delivery visible, and every other sale unchanged", () => {
    expect(totalsOf({ lines, discount: 0, cash: "", banks: [], delivery: 0 }).delivery).toBe(0);
    expect(totalsOf({ lines, discount: 0, cash: "", banks: [] })).not.toHaveProperty("delivery");
  });
  it("collect what remains of a reservation plus the delivery", () => {
    const made = { totals: { grossTotal: 100_000, goldTotal: 90_000, paid: 100_000 } };
    expect(totalsOf({ lines: [], discount: 0, made, cash: "75", banks: [], delivery: 7500 }).left).toBe(0);
  });
});

describe("the WhatsApp message of a shipping sale", () => {
  const input: DeskMessageInput = {
    date: "2026-11-26", branch: "Main", channel: "c", seller: "s", customer: "Mona", nationalId: "29001011234567", phone: "01012345678", operation: "sell", metal: "gold", payment1: "كاش",
    discount: 0, visa: false, visaPercent: 2, basePrice21: 100, finalPrice21: 100, lines: [], totals: { before: 100_000, final: 100_000 },
  };
  it("gives the delivery and the total with it", () => {
    const text = buildDeskMessage({ ...input, delivery: { name: "القاهرة", amount: 7500 } });
    expect(text).toContain("إجمالي السعر: 1,000\nالتوصيل (القاهرة): 75\nالإجمالي شامل التوصيل: 1,075\nطريقة الدفع: كاش");
  });
  it("says nothing of delivery otherwise", () => {
    expect(buildDeskMessage(input)).not.toContain("التوصيل");
  });
});
