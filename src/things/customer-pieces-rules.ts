// Pure rules of the Returned pieces screen: the form read, the price preview lines, the find box, and the label HTML.
// The shop BUYS the returned piece (owner, 2026-11-05): the form sends branch, the items with their counts (one or many: owner, 2026-11-10), the
// payment (cash + bank rows) and the optional description, customer name and phone. Karat, weight, code and price are never sent: the backend works them out (GET /customer-pieces/buy-price).
import { esc, labelGramsText, latinNumber, piastresText, typedPiastres } from "@/lib/format";
import type { Row } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";
import { bankPaid, cashPaid, paymentErrors, sentBanks, type Bank } from "./sales-invoices-math";
import { qrSvgText } from "@/lib/qr";

export const TEXT_MAX = 100;
export const QUANTITY_MAX = 100;   // the pieces of all the items together
export const ITEMS_MAX = 20;       // how many different items one save holds
const PHONE = /^\d{8,15}$/;                       // the sales invoice's phone rule
const CODE = /^[A-Za-z0-9 .]{1,20}$/;             // the backend's pattern for a piece code

export type ItemRow = { itemId: string; quantity: string };
export const blankItem = (): ItemRow => ({ itemId: "", quantity: "1" });

export type PieceForm = { branchId?: string; items: ItemRow[]; description: string; customerName: string; customerPhone: string; cash: string; banks: Bank[] };

/** The count typed: a whole number from 1 to 100, Arabic digits read as Latin. null = not valid (the preview waits). */
export function readQuantity(typed: unknown): number | null {
  const s = latinNumber(typed).trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= QUANTITY_MAX ? n : null;
}

/** What is still to pay out: total minus cash and every bank row, in piastres (negative = too much). */
export const remainingToPay = (total: number, cash: string, banks: Bank[]) => total - cashPaid(cash) - bankPaid(banks);

/** The item rows that are filled in, as the backend takes them, or null while one row is still empty or wrong (the preview waits). */
export function readItems(rows: ItemRow[]): { itemId: string; quantity: number }[] | null {
  const out: { itemId: string; quantity: number }[] = [];
  for (const r of rows) {
    const quantity = readQuantity(r.quantity);
    if (!r.itemId || quantity === null) return null;
    out.push({ itemId: r.itemId, quantity });
  }
  return out.length ? out : null;
}

/** The form as the backend takes it, or the error key of each bad field ("required", "tooLong", "phoneInvalid", "quantityInvalid", "noPrice",
 *  "itemTwice" and "tooManyPieces" on the item rows (keys `items.N.itemId`, `items.N.quantity`, `items`),
 *  and for the payment block the keys of paymentErrors plus sum = "mismatch"). `total` = the previewed total in piastres (null = no price yet).
 *  `needsBranch`: the Super admin and an Admin choose the branch; the backend uses a plain User's own. */
export function readPiece(v: PieceForm, needsBranch: boolean, total: number | null): { payload?: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (needsBranch && !v.branchId) errors.branchId = "required";
  let pieces = 0;
  const seen = new Set<string>();
  v.items.forEach((row, i) => {
    if (!row.itemId) errors[`items.${i}.itemId`] = "required";
    else if (seen.has(row.itemId)) errors[`items.${i}.itemId`] = "itemTwice";   // the same item once: raise its count instead
    else seen.add(row.itemId);
    const quantity = readQuantity(row.quantity);
    if (quantity === null) errors[`items.${i}.quantity`] = "quantityInvalid"; else pieces += quantity;
  });
  if (!v.items.length || v.items.length > ITEMS_MAX || pieces > QUANTITY_MAX) errors.items = "tooManyPieces";
  const text = (k: "description" | "customerName") => { const s = v[k].trim(); if (s.length > TEXT_MAX) errors[k] = "tooLong"; return s; };
  const description = text("description"), customerName = text("customerName");
  const customerPhone = latinNumber(v.customerPhone).trim();
  if (customerPhone && !PHONE.test(customerPhone)) errors.customerPhone = "phoneInvalid";
  Object.assign(errors, paymentErrors(v.cash, v.banks, "any"));
  if (!errors.sum && !Object.keys(errors).some((k) => /^(cash|bank)/.test(k))) {
    if (total === null) errors.sum = "noPrice";
    else if (remainingToPay(total, v.cash, v.banks) !== 0) errors.sum = "mismatch";
  }
  if (Object.keys(errors).length) return { errors };
  const cash = v.cash.trim();
  return { errors, payload: {
    ...(needsBranch ? { branchId: v.branchId } : {}), items: v.items.map((row) => ({ itemId: row.itemId, quantity: readQuantity(row.quantity) })),
    ...(cash !== "" ? { cash: typedPiastres(cash) } : {}), bankPayments: sentBanks(v.banks),
    ...(description ? { description } : {}), ...(customerName ? { customerName } : {}), ...(customerPhone ? { customerPhone } : {}),
  } };
}

/** One item's price: what the backend works out for it (GET /customer-pieces/buy-price). */
export type BuyPriceLine = { itemId: string; quantity: number; buyPricePerGram: number; cashbackPerGram: number; onePiece: number; total: number };
export type BuyPrice = { priceDate: string; lines: BuyPriceLine[]; total: number };

/** One item's preview lines as text: buy price and cashback per gram, one piece and what the count costs (EGP, 2 decimals). */
export function previewLines(p: BuyPriceLine): { buyPerGram: string; cashbackPerGram: string; onePiece: string; total: string } {
  return { buyPerGram: piastresText(p.buyPricePerGram), cashbackPerGram: piastresText(p.cashbackPerGram), onePiece: piastresText(p.onePiece), total: piastresText(p.total) };
}

/** The grand total and the price date as text (the total is every item added up). */
export function previewTotals(p: BuyPrice): { total: string; priceDate: string } {
  return { total: piastresText(p.total), priceDate: String(p.priceDate).slice(0, 10) };
}

/** What the find box holds: a code, and also a phone when it is 8 to 15 digits (a code can be all digits too). null = neither. */
export function readFind(typed: unknown): { code: string; phone?: string } | null {
  const s = latinNumber(typed);
  if (!CODE.test(s)) return null;
  return PHONE.test(s) ? { code: s, phone: s } : { code: s };
}

/** The pieces found, each once, newest first, kept to the chosen category and karat. */
export function narrow(rows: Row[], { categoryId, karat }: { categoryId?: unknown; karat?: unknown }): Row[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .filter((r) => (!categoryId || r.categoryId === categoryId) && (!karat || r.karat === String(karat)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export type CustomerLabel = { pieceCode: string; categoryName: string | null; karat: string; weight: number };

/** The label as HTML: code, category, karat and weight. Only these fields are read, so no price, name or phone can reach the paper.
 *  "tag" = one 38 x 12.5 mm label (the tag printer's roll), "a4" = one 38.1 x 21.2 mm label at the top of an A4 sheet. */
export function customerLabelHtml(l: CustomerLabel, tr: Pick<Tr, "t">, layout: "tag" | "a4" = "tag"): string {
  const pc = (k: string, v?: Record<string, string>) => tr.t("gold-accounts", `purchaseCoding.${k}`, v);
  const tag = layout === "tag";
  return `<div data-label data-label-kind="qr" style="width:${tag ? "38mm" : "38.1mm"};height:${tag ? "12.5mm" : "21.2mm"};display:flex;align-items:center;gap:1mm;overflow:hidden;background:#fff;color:#1c1912;font-size:${tag ? "6pt" : "7pt"}">`
    + qrSvgText(l.pieceCode, tag ? 10.5 : 10)
    + `<span style="display:flex;flex-direction:column;min-width:0;flex:1;padding-inline-end:1mm;line-height:${tag ? 1.15 : 1.3}">`
    + `<span dir="ltr" data-label-code style="font-family:monospace;font-weight:700">${esc(l.pieceCode)}</span>`
    + (l.categoryName ? `<span data-label-category style="padding-block:0.15mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.categoryName)}</span>` : "")
    + `<span dir="ltr" style="white-space:nowrap">${esc(pc("karatShort", { karat: l.karat }))} · ${esc(labelGramsText(l.weight))} ${esc(pc("gram"))}</span>`
    + `</span></div>`;
}
