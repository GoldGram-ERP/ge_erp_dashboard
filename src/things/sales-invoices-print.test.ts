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
// The merged rows and the karat weights the backend sends, derived from the lines of the fixture (a test may merge by hand with its own groups).
const groupsFrom = (lines: any[]) => lines.map((l) => ({ itemName: l.itemName, karat: l.karat, count: 1, weight: l.weight, goldValue: l.goldValue, makingCharge: l.makingCharge, piecePrice: l.linePrice, rowTotal: l.linePrice, cashbackPerGram: l.goldValue === null ? null : 2800, pieceCodes: [l.pieceCode] }));
const weightsFrom = (lines: any[]) => ["24", "21"].flatMap((k) => { const of = lines.filter((l) => l.karat === k); return of.length ? [{ karat: k, weight: of.reduce((s, l) => s + l.weight, 0) }] : []; });
const invoice = (over: Record<string, any> = {}) => ({
  layout: "a4", shopName: "GoldGram", branchName: "كايرو بيزنس بلازا", invoiceNumber: 142, invoiceDate: "2026-10-21", invoiceTime: "18:03",
  isGift: false, customerName: "أحمد محمد علي", customerPhone: "01012345678", nationalId: "29001011234567",
  karatPrices: [{ karat: "24", pricePerGram: 684_200 }, { karat: "21", pricePerGram: 598_500 }],
  footer: null,
  lines: [line(1, "21", 5000, 2_992_500, 24_944), line(2, "24", 1000, 684_200, 24_944)],
  totals: { lineCount: 2, weight: 6000, goldTotal: 3_676_700, makingTotal: 49_888, grossTotal: 3_726_588, goldValue: 3_676_700, makingCharge: 49_888, discount: 0, total: 3_726_588, paid: 3_726_588 },
  payments: [{ kind: "cash", label: null, amount: 3_726_588 }],
  ...over,
  groups: over.groups ?? groupsFrom(over.lines ?? [line(1, "21", 5000, 2_992_500, 24_944), line(2, "24", 1000, 684_200, 24_944)]),
  weightsByKarat: over.weightsByKarat ?? weightsFrom(over.lines ?? [line(1, "21", 5000, 2_992_500, 24_944), line(2, "24", 1000, 684_200, 24_944)]),
});

describe("the preprinted invoice", () => {
  it("fills the customer block from the invoice and writes the total in words", () => {
    const html = renderInvoice(invoice(), tFor("ar"), true);
    for (const must of ["INV/2026/000142", "21 / 10 / 2026 · 18:03", "أحمد محمد علي", "01012345678", "29001011234567", "كايرو بيزنس بلازا", "الرقم القومي"]) expect(html, must).toContain(must);
    expect(html).toContain("LE 37,265.88");
    // the look of the owner's screenshot: no total in words, no payment line, no signatures
    for (const gone of ["فقط وقدره", "طريقة الدفع", "☑", "المستلم", "ختم الشركة"]) expect(html, gone).not.toContain(gone);
    mkdirSync("e2e-tests/.shots", { recursive: true });
    writeFileSync("e2e-tests/.shots/invoice-preprinted-ar.html", html);
    writeFileSync("e2e-tests/.shots/invoice-preprinted-en.html", renderInvoice(invoice(), tFor("en"), false));
  });

  it("prints the foot of the screenshot (two lines, in the language of the invoice), and a footer saved in Settings replaces it", () => {
    const fixed = ["برجاء الاحتفاظ بهذه الفاتورة", "الذهب المباع لا يُرد ولا يُستبدل"];
    for (const layout of ["a4", "gift", "star"]) {
      const html = renderInvoice(invoice({ layout, footer: null }), tFor("ar"), true);
      for (const part of fixed) expect(html, `${layout}: ${part}`).toContain(part);
    }
    const english = renderInvoice(invoice({ footer: null }), tFor("en"), false);
    for (const part of ["Please keep this invoice", "Sold gold cannot be returned or exchanged"]) expect(english, part).toContain(part);
    expect(english).toContain('<footer class="pfoot" dir="ltr" lang="en">');
    expect(english).not.toContain("برجاء الاحتفاظ");
    const arabic = renderInvoice(invoice({ footer: null }), tFor("ar"), true);
    expect(arabic).toContain('<footer class="pfoot" dir="rtl" lang="ar">');
    expect(arabic).not.toContain("Sold gold cannot");
    const own = renderInvoice(invoice({ footer: "ملف ضريبي 111-222-333" }), tFor("ar"), true);
    expect(own).toContain("111-222-333");
    expect(own).not.toContain("برجاء الاحتفاظ");
  });

  it("draws the contact strip of the screenshot at the foot, and a line under every row", () => {
    const html = renderInvoice(invoice(), tFor("ar"), true);
    for (const part of ["17937", "01282011114", "goldgram.eg", "295852", "774-088-346", "Cairo Business Plaza, North Tower, Unit 401, New Cairo"]) expect(html, part).toContain(part);
    expect(html.indexOf('class="contact"')).toBeGreaterThan(html.indexOf('class="pfoot"'));   // the strip comes after the foot note
    expect(html).toContain(".pre tbody td{border-bottom:1px solid #d5d9e2}");
    expect(html).toContain(".pre .contact svg{width:14px;height:14px;flex:none;color:#c2a56e}");   // the gold of the screenshot's icons
  });

  it("prints its colours even when the print window has Background graphics off", () => {
    // the table head is white text on blue: without its background it would read blank
    expect(renderInvoice(invoice(), tFor("en"), false)).toContain("article.pre,article.pre *{-webkit-print-color-adjust:exact;print-color-adjust:exact}");
  });

  it("lists the price of each karat on the invoice, and only those", () => {
    const both = renderInvoice(invoice(), tFor("ar"), true);
    expect(both).toContain("سعر عيار 24:");
    expect(both).toContain("سعر عيار 21:");
    const one = renderInvoice(invoice({ karatPrices: [{ karat: "21", pricePerGram: 598_500 }] }), tFor("ar"), true);
    expect(one).toContain("سعر عيار 21:");
    expect(one).not.toContain("سعر عيار 24:");
  });

  it("draws the table of the owner's sample: count, one piece's weight, workmanship and price, the amount, and cashback per gram", () => {
    const html = renderInvoice(invoice(), tFor("ar"), true);
    const head = html.slice(html.indexOf("<thead>"), html.indexOf("</thead>"));
    const order = ["الصنف", "العدد", "الوزن", "العيار", "مصنعية القطعة", "سعر القطعة", "إجمالي المبلغ", "كاش باك / جرام"].map((x) => head.indexOf(x));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(head).not.toContain("سعر الجرام");
    expect(html).toContain("28.00");   // the cashback per gram of the item
  });

  it("merges identical pieces into one row: the count, the price of one piece, and count x that price as the amount", () => {
    const merged = invoice({
      lines: [line(1, "24", 250, 165_857, 43), line(2, "24", 250, 165_857, 43), line(3, "24", 250, 165_857, 43)],
      groups: [{ itemName: "GE - 0.25g Gold Bar", karat: "24", count: 3, weight: 250, goldValue: 165_857, makingCharge: 43, piecePrice: 165_900, rowTotal: 497_700, cashbackPerGram: null, pieceCodes: ["GE-001", "GE-002", "GE-003"] }],
      weightsByKarat: [{ karat: "24", weight: 750 }],
    });
    const html = renderInvoice(merged, tFor("ar"), true);
    expect(html.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr>/g)).toHaveLength(1);
    expect(html).toContain("1,659.00");   // one piece
    expect(html).toContain("4,977.00");   // three pieces
    expect(html).toContain("—");          // an item with no cashback
  });

  it("the weight box has one line for one karat and a line per karat for two", () => {
    const two = renderInvoice(invoice(), tFor("ar"), true);
    expect(two).toContain("إجمالي وزن عيار 24:");
    expect(two).toContain("إجمالي وزن عيار 21:");
    expect(two).not.toContain("إجمالي وزن الفاتورة:");
    const one = renderInvoice(invoice({ lines: [line(1, "24", 250, 165_857, 43)], weightsByKarat: [{ karat: "24", weight: 250 }], karatPrices: [{ karat: "24", pricePerGram: 684_200 }] }), tFor("ar"), true);
    expect(one).toContain("إجمالي وزن الفاتورة:");
    expect(one).toContain("0.250");
    expect(one).not.toContain("إجمالي وزن عيار");
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
    for (const gone of ["LE ", "سعر عيار", "سعر الجرام", "قيمة الذهب"]) expect(html, gone).not.toContain(gone);
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
    for (const label of ["Count", "Piece workmanship", "Piece price", "Amount", "Cashback / gram", "Total weight 24K:", "Total weight 21K:"]) expect(html, label).toContain(label);
  });
});
