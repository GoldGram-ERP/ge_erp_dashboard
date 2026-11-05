import { describe, expect, it } from "vitest";
import { buildDeskMessage, type DeskLine, type DeskMessageInput } from "./sales-desk-whatsapp";
// The reference calculator's own files (no employee names) are the oracle: `message()` and `calculate()`.
import { calculate, changePayment, message } from "./__fixtures__/reference-calculation.mjs";
import { goldSpecs, silverFees, silverProducts } from "./__fixtures__/catalog.js";

const silverSpecs = silverProducts.map((p, i) => [...p, ...silverFees.wrapped[i], ...silverFees.unwrapped[i]]);
const DAY = "2026-11-05";

// A small seeded generator so the grid is the same on every run.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RefLine = { product: number; qty: number; wrapping: "wrapped" | "unwrapped"; fee: string };

function makeLines(rand: () => number, metal: "gold" | "silver", type: "sell" | "buy"): RefLine[] {
  const specs = metal === "gold" ? goldSpecs : silverSpecs;
  const one = (): RefLine => {
    const product = Math.floor(rand() * specs.length);
    const wrapping = metal === "gold" || rand() < 0.5 ? "wrapped" : "unwrapped";
    const spec = specs[product] as (string | number)[];
    const fee = rand() < 0.2 ? String(Math.floor(rand() * 200) + 0.5) : String(spec[(metal === "gold" ? 4 : wrapping === "unwrapped" ? 6 : 4) + (type === "buy" ? 1 : 0)]);
    return { product, qty: rand() < 0.1 ? 999 : 1 + Math.floor(rand() * 5), wrapping, fee };
  };
  const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, one);
  if (rand() < 0.5) lines.push({ ...lines[0] });                                  // identical product: merged
  if (rand() < 0.3) lines.push({ ...lines[0], fee: String(Number(lines[0].fee) + 1), qty: 2 }); // same product, another fee: not merged
  return lines;
}

const methods = {
  sell: [["كاش"], ["فيزا"], ["كاش", "انستا باي"], ["تحويل بنكي", "كاش"]],
  buy: [["كاش"], ["تحويل بنكي"], ["كاش", "تحويل بنكي"]],
} as const;

function cases() {
  const out: { d: any; input: DeskMessageInput }[] = [];
  const rand = rng(20261105);
  for (const type of ["sell", "buy"] as const) for (const metal of ["gold", "silver"] as const)
    for (const pay of methods[type]) for (const discount of type === "sell" ? [0, 5, 10] : [0]) for (const manual of ["none", "21", "21+24"] as const) for (let n = 0; n < 4; n++) {
      const catalog = metal === "gold" ? goldSpecs : silverSpecs;
      const lines = makeLines(rand, metal, type);
      const base = metal === "gold" ? `${4000 + Math.floor(rand() * 5000)}${rand() < 0.5 ? "" : "." + String(Math.floor(rand() * 100)).padStart(2, "0")}` : `${60 + Math.floor(rand() * 40)}.${String(Math.floor(rand() * 100)).padStart(2, "0")}`;
      const d: any = {
        metal, type, branch: "فرع الاختبار", branchNames: ["فرع الاختبار"], seller: "بائع", channel: rand() < 0.2 ? "جملة" : "قطاعي", customer: "عميل", nationalId: "29001011234567", phone: "01012345678",
        basePrice21: base, finalPrice21: null, finalPrice24: null, payment: pay[0], payment2: pay[1] ?? "", splitAmount: "", discount, visaPercent: rand() < 0.3 ? 3 : 2, catalog,
        lines,
      };
      if (manual !== "none") {
        d.finalPrice21 = String(4000 + Math.floor(rand() * 5000));
        if (manual === "21+24") d.finalPrice24 = String(4500 + Math.floor(rand() * 5000));
        if (rand() < 0.5) d.manualPayment = rand() < 0.5 ? "visa" : "cash";
      }
      const first = calculate(d);
      if (d.payment2) d.splitAmount = (Math.floor(Number(first.totalCents) * rand()) / 100).toFixed(2);
      const c = calculate(d);
      const visa = d.payment === "فيزا";
      let cashTotal: bigint | undefined;
      if (type === "sell" && visa) {
        const original = { ...d, payment2: "" };
        changePayment(original, "كاش");
        cashTotal = calculate(original).totalCents;
      }
      const inputLines: DeskLine[] = d.lines.map((l: RefLine) => ({ productName: catalog[l.product][0], quantity: l.qty, feePerGram: l.fee, ...(metal === "silver" ? { wrapping: l.wrapping } : {}) }));
      out.push({
        d,
        input: {
          date: DAY, branch: d.branch, channel: d.channel, seller: d.seller, customer: d.customer, nationalId: d.nationalId, phone: d.phone,
          operation: type, metal, payment1: d.payment, payment2: d.payment2 || undefined,
          split: d.payment2 ? Math.round(Number(d.splitAmount) * 100) : undefined,
          discount: c.discount, visa, visaPercent: d.visaPercent,
          basePrice21: d.basePrice21, finalPrice21: c.finalPrice21, visaPrice21: c.visaPrice21,
          manual: d.finalPrice21 != null || d.finalPrice24 != null, finalPrice24: d.finalPrice24 != null ? c.finalPrice24 : null,
          lines: inputLines, totals: { before: c.beforeCents, final: c.totalCents, cashTotal },
        },
      });
    }
  return out;
}

describe("sales desk WhatsApp text equals the reference calculator's message()", () => {
  const grid = cases();
  it("covers a grid of at least 300 inputs", () => {
    expect(grid.length).toBe(360);
    // every branch of the text is in the grid
    const texts = grid.map((g) => message(g.d, DAY));
    for (const needle of ["قطعة فضه", "كاش باك", "خصم 5%", "خصم 10%", "بعد 2%", "بعد 3%", "جنيه\n", "سعر عيار 24 المعتمد", "سعر جرام 21 المعتمد", "غير مغلف", "إجمالى سعر قبل خصم (بعد"]) {
      expect(texts.some((t: string) => t.includes(needle)), needle).toBe(true);
    }
  });

  it("matches character for character on every input", () => {
    for (const { d, input } of grid) expect(buildDeskMessage(input)).toBe(message(d, DAY));
  });
});
