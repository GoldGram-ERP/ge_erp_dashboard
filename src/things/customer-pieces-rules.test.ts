import { describe, expect, it } from "vitest";
import { customerLabelHtml, narrow, readFind, readPiece } from "./customer-pieces-rules";

const tr = { t: (_ns: string, key: string, v?: Record<string, unknown>) => (key === "purchaseCoding.karatValue" ? `Karat ${v?.karat}` : key === "purchaseCoding.gram" ? "g" : key) };
const ok = { categoryId: "c1", itemId: "i1", description: " ring with a red stone ", customerName: " Mona ", customerPhone: "٠١٠١٢٣٤٥٦٧٨" };

describe("returned piece form", () => {
  it("sends the five fields only, trimmed, the phone in Latin digits; never a karat, weight or code", () => {
    expect(readPiece(ok)).toEqual({ errors: {}, payload: { categoryId: "c1", itemId: "i1", description: "ring with a red stone", customerName: "Mona", customerPhone: "01012345678" } });
  });
  it("refuses each bad field by its own key", () => {
    expect(readPiece({ categoryId: "", itemId: "", description: " ", customerName: "x".repeat(101), customerPhone: "" }).errors)
      .toEqual({ categoryId: "required", itemId: "required", description: "required", customerName: "tooLong", customerPhone: "required" });
    expect(readPiece({ ...ok, customerPhone: "1234567" }).errors).toEqual({ customerPhone: "phoneInvalid" });
    expect(readPiece({ ...ok, customerPhone: "1234567890123456" }).errors).toEqual({ customerPhone: "phoneInvalid" });
    expect(readPiece({ ...ok, customerPhone: "12345678" }).payload?.customerPhone).toBe("12345678");
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
    expect(html).toContain("Karat 21 · 5.250 g");
    for (const leak of ["Mona", "01012345678", "9,900", "9900"]) expect(html).not.toContain(leak);
    expect(html).toContain("width:50mm");
    expect(customerLabelHtml(record, tr, "a4")).toContain("width:38.1mm");
  });
});
