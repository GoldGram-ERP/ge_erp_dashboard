// The Sales desk's pure rules (issue #6): customer fields, item + count lines, planned payment against the total, the lock note.
// The phone and national ID rules are the ones of every sales form (customerRules); the payment rules are the payment block's.
import { latinNumber } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { customerRules } from "./sales-form-parts";
import { LINES_MAX, bankPaid, cashPaid, paymentErrors, type Bank } from "./sales-invoices-math";

export { LINES_MAX };

export type DeskCustomer = { customerName: string; customerPhone: string; nationalId: string };
/** The customer fields: error texts by field, and (when none) what is sent: trimmed, digits in Latin, nationalId left out when empty. */
export function readCustomer(tr: Tr, f: DeskCustomer): { errors: Record<string, string>; payload?: { customerName: string; customerPhone: string; nationalId?: string } } {
  const rules = customerRules(tr), name = f.customerName.trim(), phone = f.customerPhone.trim(), id = f.nationalId.trim();
  const errors: Record<string, string> = {};
  for (const [k, v] of [["customerName", name], ["customerPhone", phone], ["nationalId", id]] as const) { const e = rules[k](v); if (e) errors[k] = e; }
  if (Object.keys(errors).length) return { errors };
  return { errors, payload: { customerName: name, customerPhone: latinNumber(phone), ...(id ? { nationalId: latinNumber(id) } : {}) } };
}

export type DeskLine = { itemId: string; count: string };
/** Item + count lines. Errors by key (fieldErrors codes): lines (none / too many), line<i>Item (required, duplicateItem), line<i>Count (required, invalid). */
export function readLines(lines: DeskLine[]): { errors: Record<string, string>; payload?: { itemId: string; quantity: number }[] } {
  const errors: Record<string, string> = {}, seen = new Set<string>();
  if (lines.length === 0) errors.lines = "required";
  else if (lines.length > LINES_MAX) errors.lines = "invalid";
  lines.forEach((l, i) => {
    if (!l.itemId) errors[`line${i}Item`] = "required";
    else if (seen.has(l.itemId)) errors[`line${i}Item`] = "duplicateItem";
    seen.add(l.itemId);
    const typed = latinNumber(l.count);
    if (typed === "") errors[`line${i}Count`] = "required";
    else if (!/^\d{1,3}$/.test(typed) || +typed < 1 || +typed > LINES_MAX) errors[`line${i}Count`] = "invalid";
  });
  if (Object.keys(errors).length) return { errors };
  return { errors, payload: lines.map((l) => ({ itemId: l.itemId, quantity: Number(latinNumber(l.count)) })) };
}

/** The planned payment against the draft's total (piastres): the payment block's own errors, what is planned, what is left (negative: more than the total). */
export function plannedAgainst(total: number, cash: string, banks: Bank[]) {
  const planned = cashPaid(cash) + bankPaid(banks);
  return { errors: paymentErrors(cash, banks, "none"), planned, left: total - planned, over: planned > total };
}

export type LockDraft = { status: string; locked: boolean; createdDay: string };
/** What the screen says about a draft's edit state, from the server's own `locked` and `createdDay` (the client never works out midnight). */
export function lockNote(d: LockDraft, tr: Tr): { state: "editable" | "locked" | "completed" | "deleted"; text: string } {
  const t = (k: string, v?: Record<string, string | number>) => tr.t("gold-sales", `salesDesk.lock.${k}`, v);
  if (d.status === "completed") return { state: "completed", text: t("completed") };
  if (d.status === "deleted") return { state: "deleted", text: t("deleted") };
  return d.locked ? { state: "locked", text: t("reason", { day: d.createdDay }) } : { state: "editable", text: t("editable") };
}

/** Who completes a draft into an invoice (issue #25): the Admin and the Super admin, on an open sell draft. A plain User never does (the backend
 *  refuses with 403 notAllowed too), and neither does anyone while the user type is still unknown (the page is loading). A Buy draft is a quote only. */
export const canCompleteDraft = (userType: string | undefined, status: string | undefined, buy: boolean): boolean =>
  (userType === "admin" || userType === "super_admin") && status === "open" && !buy;
