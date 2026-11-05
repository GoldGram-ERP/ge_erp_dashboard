// Pure rules of the Returned pieces screen (issue #4): the form read, the find box, and the label HTML.
// The form sends category, item, description, customer name and phone only: karat, weight and workmanship come from the item (backend #167).
import { esc, latinNumber, milligramsText } from "@/lib/format";
import type { Row } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";

export const TEXT_MAX = 100;
const PHONE = /^\d{8,15}$/;                       // the sales invoice's phone rule
const CODE = /^[A-Za-z0-9 .]{1,20}$/;             // the backend's pattern for a piece code

export type PieceForm = { categoryId: string; itemId: string; description: string; customerName: string; customerPhone: string };

/** The form as the backend takes it, or the error key of each bad field ("required", "tooLong", "phoneInvalid"). */
export function readPiece(v: PieceForm): { payload?: PieceForm; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const text = (k: "description" | "customerName") => { const s = v[k].trim(); if (!s) errors[k] = "required"; else if (s.length > TEXT_MAX) errors[k] = "tooLong"; return s; };
  if (!v.categoryId) errors.categoryId = "required";
  if (!v.itemId) errors.itemId = "required";
  const description = text("description"), customerName = text("customerName");
  const customerPhone = latinNumber(v.customerPhone);
  if (!customerPhone) errors.customerPhone = "required";
  else if (!PHONE.test(customerPhone)) errors.customerPhone = "phoneInvalid";
  if (Object.keys(errors).length) return { errors };
  return { errors, payload: { categoryId: v.categoryId, itemId: v.itemId, description, customerName, customerPhone } };
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
 *  "tag" = one 50 x 12 mm label, "a4" = one 38.1 x 21.2 mm label at the top of an A4 sheet. */
// shortcut: the symbol is a labelled box ("QR"), as on every other label of the dashboard; swap in a real QR drawing when a shared label module exists.
export function customerLabelHtml(l: CustomerLabel, tr: Pick<Tr, "t">, layout: "tag" | "a4" = "tag"): string {
  const pc = (k: string, v?: Record<string, string>) => tr.t("gold-accounts", `purchaseCoding.${k}`, v);
  const tag = layout === "tag";
  return `<div data-label data-label-kind="qr" style="width:${tag ? "50mm" : "38.1mm"};height:${tag ? "12mm" : "21.2mm"};display:flex;align-items:center;gap:1mm;overflow:hidden;background:#fff;color:#1c1912;font-size:7pt">`
    + `<span data-qr style="flex:none;width:10mm;height:10mm;border:1px solid #1c1912;display:flex;align-items:center;justify-content:center;font-size:6pt;font-weight:700">QR</span>`
    + `<span style="display:flex;flex-direction:column;min-width:0;flex:1;padding-inline-end:1mm;line-height:1.05">`
    + `<span dir="ltr" data-label-code style="font-family:monospace;font-weight:700">${esc(l.pieceCode)}</span>`
    + (l.categoryName ? `<span data-label-category style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.categoryName)}</span>` : "")
    + `<span dir="ltr" style="white-space:nowrap">${esc(pc("karatValue", { karat: l.karat }))} · ${esc(milligramsText(l.weight))} ${esc(pc("gram"))}</span>`
    + `</span></div>`;
}
