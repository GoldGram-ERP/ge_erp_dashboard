// The WhatsApp summary of a Sales desk draft (issue #6): the facts of the old calculator message as plain text for the customer.
// The seller is never in it: the draft type here has no employee at all, so no caller can hand one over by mistake.
import { dateTimeText, milligramsText, piastresText } from "@/lib/format";

export type WaDraft = {
  createdAt: string; branchName: string; customerName: string; customerPhone: string; nationalId: string | null; goldPrice21k: number;
  lines: { itemName: string; karat: string; weightMg: number; quantity: number; linePrice: number }[];
  totals: { discount: number; total: number };
  cash: number; bankPayments: { bankAccountId: string; amount: number }[];
};
/** The words, already in the user's language (messages gold-sales.salesDesk.wa.*). `piece` is a template: {count} {item} {karat} {weight} {price}. */
export type WaLabels = { date: string; branch: string; customer: string; phone: string; nationalId: string; pieces: string; piece: string; goldPrice: string; discount: string; total: string; payment: string; cash: string; bank: string };

const fill = (template: string, v: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** bankNames: account names by id (the draft holds ids only). Weight shown is the line's whole weight (piece weight x count). */
export function buildWhatsappText(d: WaDraft, labels: WaLabels, lang = "en", bankNames: Record<string, string> = {}): string {
  const out = [
    `${labels.date}: ${dateTimeText(d.createdAt, lang)}`,
    `${labels.branch}: ${d.branchName}`,
    `${labels.customer}: ${d.customerName}`,
    `${labels.phone}: ${d.customerPhone}`,
    ...(d.nationalId ? [`${labels.nationalId}: ${d.nationalId}`] : []),
    "",
    `${labels.pieces}:`,
    ...d.lines.map((l, i) => `${i + 1}) ${fill(labels.piece, { count: l.quantity, item: l.itemName, karat: l.karat, weight: milligramsText(l.weightMg * l.quantity), price: piastresText(l.linePrice) })}`),
    "",
    `${labels.goldPrice}: ${piastresText(d.goldPrice21k)}`,
    ...(d.totals.discount > 0 ? [`${labels.discount}: ${piastresText(d.totals.discount)}`] : []),
    `${labels.total}: ${piastresText(d.totals.total)}`,
  ];
  const pays = [...(d.cash > 0 ? [`${labels.cash}: ${piastresText(d.cash)}`] : []),
    ...d.bankPayments.map((b) => `${labels.bank}${bankNames[b.bankAccountId] ? ` ${bankNames[b.bankAccountId]}` : ""}: ${piastresText(b.amount)}`)];
  if (pays.length) out.push("", `${labels.payment}:`, ...pays);
  return out.join("\n");
}
