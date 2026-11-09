import { describe, expect, it } from "vitest";
import { customerLabelHtml, narrow, previewLines, readFind, readPiece, readQuantity, remainingToPay } from "./customer-pieces-rules";

const tr = { t: (_ns: string, key: string, v?: Record<string, unknown>) => (key === "purchaseCoding.karatShort" ? `${v?.karat}K` : key === "purchaseCoding.gram" ? "g" : key) };
const base = { itemId: "i1", quantity: "3", description: " ring ", customerName: " Mona ", customerPhone: "٠١٠١٢٣٤٥٦٧٨", cash: "", banks: [] };
const TOTAL = 5348439;   // 21K buy 4,050.00/g + cashback 25.00/g, 4.375 g, three pieces: 3 x 17,828.13 (one piece = 17,828.125 half up)

describe("returned piece form (bought from the customer)", () => {
  it("the branch is required and sent for a Super admin or Admin; a plain User sends none", () => {
    const form = { ...base, cash: "53484.39" };
    expect(readPiece(form, true, TOTAL).errors).toEqual({ branchId: "required" });
    expect(readPiece({ ...form, branchId: "b1" }, true, TOTAL).payload?.branchId).toBe("b1");
    expect(readPiece(form, false, TOTAL).payload).not.toHaveProperty("branchId");
  });
  it("sends item, quantity, the payment in piastres and the optional texts trimmed; never a category, karat, weight, code or price", () => {
    const r = readPiece({ ...base, cash: "10000", banks: [{ bankAccountId: "a1", amount: "43484.39" }] }, false, TOTAL);
    expect(r.payload).toEqual({ itemId: "i1", quantity: 3, cash: 1000000, bankPayments: [{ bankAccountId: "a1", amount: 4348439 }], description: "ring", customerName: "Mona", customerPhone: "01012345678" });
    for (const k of ["categoryId", "karat", "weight", "code", "price", "total"]) expect(r.payload).not.toHaveProperty(k);
  });
  it("bank only and cash only both pay the total; the optional texts may be empty", () => {
    const bare = { ...base, description: "", customerName: "", customerPhone: "" };
    expect(readPiece({ ...bare, cash: "53484.39" }, false, TOTAL).payload).toEqual({ itemId: "i1", quantity: 3, cash: 5348439, bankPayments: [] });
    expect(readPiece({ ...bare, banks: [{ bankAccountId: "a1", amount: "53484.39" }] }, false, TOTAL).payload).toEqual({ itemId: "i1", quantity: 3, bankPayments: [{ bankAccountId: "a1", amount: 5348439 }] });
  });
  it("the payment must equal the total: short, over, nothing, and no price yet are each refused", () => {
    expect(readPiece({ ...base, cash: "53484.38" }, false, TOTAL).errors).toEqual({ sum: "mismatch" });
    expect(readPiece({ ...base, cash: "53484.40" }, false, TOTAL).errors).toEqual({ sum: "mismatch" });
    expect(readPiece(base, false, TOTAL).errors).toEqual({ sum: "required" });
    expect(readPiece({ ...base, cash: "53484.39" }, false, null).errors).toEqual({ sum: "noPrice" });
  });
  it("refuses each bad field by its own key", () => {
    expect(readPiece({ ...base, itemId: "", quantity: "0", customerName: "x".repeat(101), customerPhone: "1234567", cash: "1" }, false, TOTAL).errors)
      .toEqual({ itemId: "required", quantity: "quantityInvalid", customerName: "tooLong", customerPhone: "phoneInvalid", sum: "mismatch" });
    expect(readPiece({ ...base, quantity: "101", cash: "1" }, false, TOTAL).errors.quantity).toBe("quantityInvalid");
    expect(readPiece({ ...base, quantity: "2.5", cash: "1" }, false, TOTAL).errors.quantity).toBe("quantityInvalid");
    expect(readPiece({ ...base, quantity: "١٠٠", cash: "53484.39" }, false, TOTAL).payload?.quantity).toBe(100);
    expect(readPiece({ ...base, banks: [{ bankAccountId: "", amount: "5" }] }, false, TOTAL).errors).toEqual({ bank0Account: "required" });
    expect(readPiece({ ...base, banks: [{ bankAccountId: "a1", amount: "1" }, { bankAccountId: "a1", amount: "1" }] }, false, TOTAL).errors).toEqual({ bank1Account: "duplicateAccount" });
  });
  it("the remaining is the total minus cash and every bank row, exact to the piastre", () => {
    expect(remainingToPay(TOTAL, "0.01", [{ bankAccountId: "a", amount: "100" }, { bankAccountId: "b", amount: "0.10" }])).toBe(TOTAL - 1 - 10000 - 10);
    expect(remainingToPay(TOTAL, "60000", [])).toBe(-651561);
  });
});

describe("price preview", () => {
  it("shows the buy price, cashback, one piece, the total and the date as exact money text (worked example)", () => {
    expect(previewLines({ priceDate: "2026-11-05T00:00:00.000Z", buyPricePerGram: 405000, cashbackPerGram: 2500, onePiece: 1782813, total: 5348439 }))
      .toEqual({ buyPerGram: "4,050.00", cashbackPerGram: "25.00", onePiece: "17,828.13", total: "53,484.39", priceDate: "2026-11-05" });
  });
  it("a count is a whole number 1 to 100 only", () => {
    expect([readQuantity("1"), readQuantity("100"), readQuantity(" 7 ")]).toEqual([1, 100, 7]);
    expect([readQuantity(""), readQuantity("0"), readQuantity("101"), readQuantity("1.5"), readQuantity("-1"), readQuantity("abc")]).toEqual([null, null, null, null, null, null]);
  });
});

describe("find box", () => {
  it("a short code is a code; 8 to 15 digits are also a phone; anything else is refused", () => {
    expect(readFind("100234")).toEqual({ code: "100234" });
    expect(readFind("٠١٠١٢٣٤٥٦٧٨")).toEqual({ code: "01012345678", phone: "01012345678" });
    expect(readFind("خاتم")).toBeNull();
    expect(readFind("")).toBeNull();
  });
  it("keeps each piece once, newest first, of the chosen category and karat", () => {
    const rows = [
      { id: "a", categoryId: "c1", karat: "21", createdAt: "2026-11-01T10:00:00Z" },
      { id: "b", categoryId: "c2", karat: "18", createdAt: "2026-11-03T10:00:00Z" },
      { id: "a", categoryId: "c1", karat: "21", createdAt: "2026-11-01T10:00:00Z" },
      { id: "c", categoryId: "c1", karat: "18", createdAt: "2026-11-02T10:00:00Z" },
    ];
    expect(narrow(rows, {}).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(narrow(rows, { categoryId: "c1" }).map((r) => r.id)).toEqual(["c", "a"]);
    expect(narrow(rows, { categoryId: "c1", karat: "21" }).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("label", () => {
  it("prints the code, category, karat and weight, and never a price, name or phone", () => {
    const record = { pieceCode: "100234", categoryName: "Rings <b>", karat: "21", weight: 5250, customerName: "Mona Ali", customerPhone: "01012345678", tagPrice: 990000 };
    const html = customerLabelHtml(record, tr);
    expect(html).toContain(">100234<");
    expect(html).toContain("Rings &lt;b&gt;");
    expect(html).toContain("21K · 5.25 g");
    for (const leak of ["Mona", "01012345678", "9,900", "9900"]) expect(html).not.toContain(leak);
    expect(html).toContain("width:30mm");
    expect(customerLabelHtml(record, tr, "a4")).toContain("width:38.1mm");
  });
});
