import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
vi.mock("@/components/engine", () => ({ toast: () => {} }));   // the toast pulls in Next; the drawing needs none of it
const { renderInvoice } = await import("./sales-invoices-print");

// The invoice print on A5 preprinted paper (owner, 2026-11-05): the real messages, the real drawing, no window.
const dict = { ar, en } as Record<string, any>;
const tFor = (lang: "ar" | "en") => (ns: string, key: string, vars?: Record<string, any>) => {
  const v = key.split(".").reduce((o: any, k) => o?.[k], dict[lang][ns]);
  if (typeof v !== "string") throw new Error(`missing message ${ns}.${key} (${lang})`);
  return Object.entries(vars ?? {}).reduce((s, [k, x]) => s.replaceAll(`{${k}}`, String(x)), v);
};

const line = (n: number, karat: string, weight: number, gold: number, making: number) => ({
  lineNumber: n, pieceCode: `GE-00${n}`, itemName: `سبيكة ذهب ${n} جرام`, karat, weight, goldValue: gold, makingCharge: making, discount: 0, linePrice: gold + making, netPrice: gold + making,
});
const invoice = (over: Record<string, any> = {}) => ({
  layout: "a4", shopName: "GoldGram", branchName: "كايرو بيزنس بلازا", invoiceNumber: 142, invoiceDate: "2026-10-21", invoiceTime: "18:03",
  isGift: false, customerName: "أحمد محمد علي", customerPhone: "01012345678", nationalId: "29001011234567",
  karatPrices: [{ karat: "24", pricePerGram: 684_200 }, { karat: "21", pricePerGram: 598_500 }],
  footer: "ملف ضريبي 346-088-774\nالأسعار شاملة الضريبة.",
  lines: [line(1, "21", 5000, 2_992_500, 24_944), line(2, "24", 1000, 684_200, 24_944)],
  totals: { lineCount: 2, weight: 6000, goldTotal: 3_676_700, makingTotal: 49_888, grossTotal: 3_726_588, goldValue: 3_676_700, makingCharge: 49_888, discount: 0, total: 3_726_588, paid: 3_726_588 },
  payments: [{ kind: "cash", label: null, amount: 3_726_588 }],
  ...over,
});

describe("the preprinted invoice", () => {
  it("fills the customer block from the invoice and writes the total in words", () => {
    const html = renderInvoice(invoice(), tFor("ar"), true);
    for (const must of ["INV/2026/000142", "18:03 · 21 / 10 / 2026", "أحمد محمد علي", "01012345678", "29001011234567", "كايرو بيزنس بلازا", "الرقم القومي"]) expect(html, must).toContain(must);
    expect(html).toContain("فقط وقدره سبعة وثلاثون ألفاً ومائتان وخمسة وستون جنيهاً وثمانية وثمانون قرشاً لا غير");
    expect(html).toContain("LE 37,265.88");
    expect(html).toContain("☑ نقدي");
    expect(html).toContain("ملف ضريبي 346-088-774");
    mkdirSync("e2e-tests/.shots", { recursive: true });
    writeFileSync("e2e-tests/.shots/invoice-preprinted-ar.html", html);
    writeFileSync("e2e-tests/.shots/invoice-preprinted-en.html", renderInvoice(invoice(), tFor("en"), false));
  });

  it("lists the price of each karat on the invoice, and only those", () => {
    const both = renderInvoice(invoice(), tFor("ar"), true);
    expect(both).toContain("سعر عيار 24:");
    expect(both).toContain("سعر عيار 21:");
    const one = renderInvoice(invoice({ karatPrices: [{ karat: "21", pricePerGram: 598_500 }] }), tFor("ar"), true);
    expect(one).toContain("سعر عيار 21:");
    expect(one).not.toContain("سعر عيار 24:");
  });

  it("derives the gram price of a line from its gold value", () => {
    expect(renderInvoice(invoice(), tFor("ar"), true)).toContain("5,985.00");   // 2,992,500 piastres over 5 g
  });

  it("prints the discount so the totals add up", () => {
    const html = renderInvoice(invoice({ totals: { ...invoice().totals, discount: 100_00, total: 3_716_588 } }), tFor("ar"), true);
    expect(html).toContain("خصم نقدي");
    expect(html).toContain("LE -100.00");
  });

  it("a gift has the same shape with no National ID and no prices", () => {
    const gift = invoice({
      layout: "gift", isGift: true, customerName: "منى", customerPhone: "01199999999", nationalId: null, karatPrices: [{ karat: "21", pricePerGram: null }],
      lines: invoice().lines.map((l) => ({ ...l, goldValue: null, makingCharge: null, discount: null, linePrice: null, netPrice: null })),
      totals: { lineCount: 2, weight: 6000, goldTotal: null, makingTotal: null, grossTotal: null, goldValue: null, makingCharge: null, discount: null, total: null, paid: null },
      payments: [{ kind: "cash", label: null, amount: null }],
    });
    const html = renderInvoice(gift, tFor("ar"), true);
    expect(html).toContain("INV/2026/000142");
    expect(html).toContain("منى");
    expect(html).not.toContain("الرقم القومي");
    expect(html).not.toContain("29001011234567");
    for (const gone of ["LE ", "سعر عيار", "فقط وقدره", "طريقة الدفع", "سعر الجرام", "قيمة الذهب"]) expect(html, gone).not.toContain(gone);
    writeFileSync("e2e-tests/.shots/invoice-preprinted-gift-ar.html", html);
  });

  it("a star print shows stars where the amounts are and no words", () => {
    const stars = invoice({
      layout: "star", karatPrices: [{ karat: "21", pricePerGram: "****" }],
      lines: invoice().lines.map((l) => ({ ...l, goldValue: "****", makingCharge: "****", discount: "****", linePrice: "****", netPrice: "****" })),
      totals: { lineCount: 2, weight: 6000, goldTotal: "****", makingTotal: "****", grossTotal: "****", goldValue: "****", makingCharge: "****", discount: "****", total: "****", paid: "****" },
      payments: [{ kind: "cash", label: null, amount: "****" }],
    });
    const html = renderInvoice(stars, tFor("ar"), true);
    expect(html).toContain("****");
    expect(html).not.toContain("فقط وقدره");
  });

  it("English labels exist for every new message", () => {
    const html = renderInvoice(invoice(), tFor("en"), false);
    expect(html).toContain("Total in words");
    expect(html).toContain("Only thirty-seven thousand two hundred sixty-five pounds and eighty-eight piastres");
  });
});
