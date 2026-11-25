// Customer orders (owner, 2026-11-25, backend #226): a customer phones and says they are coming to buy. The pure rules of the page: the status and its buttons, the
// form's check and payload, the items summary. The backend decides who sees which orders (an order outside the caller's reach is not found); nothing here guesses it.
import { isDeskWideRole } from "@/lib/actions";
import { latinNumber } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { customerRules } from "./sales-form-parts";

/** Who sees every order, of every branch, and may name an earlier day: an Admin, the Super admin and a plain user with a desk-wide business role (the accountant, the call center admin,
 *  the branch sales manager). Everyone else sees and records only their own orders, for today. The backend enforces it (orderScopeOf). */
export const seesEveryOrder = (me: { userType?: string; businessRole?: string | null } | null | undefined): boolean =>
  me?.userType === "admin" || me?.userType === "super_admin" || (me?.userType === "user" && isDeskWideRole(me.businessRole));

export type OrderStatus = "pending" | "present" | "not_present";
export const ORDER_STATUSES: readonly OrderStatus[] = ["pending", "present", "not_present"];
export const ORDER_QUANTITY_MAX = 100;
export const ORDER_LINES_MAX = 50;
export const ORDER_NOTE_MAX = 1000;

/** The words of a status: pending (the customer has not been seen yet), present (came), not present (did not come). */
export const statusText = (L: (ar: string, en: string) => string, status: string): string =>
  status === "present" ? L("حضر", "Came") : status === "not_present" ? L("لم يحضر", "Did not come") : L("لم يحضر بعد", "Not yet");
export const statusTone = (status: string): "good" | "warn" | "off" => (status === "present" ? "good" : status === "not_present" ? "off" : "warn");

/** The status buttons of an order: every status it is not in now (pending is the way back from a mistake). */
export const statusTargets = (status: string): OrderStatus[] => ORDER_STATUSES.filter((s) => s !== status);

/** One line of the form: an item (empty = the undefined item, the customer does not know yet) and a count as typed. */
export type OrderLineForm = { itemId: string; quantity: string };
export const blankOrderLine = (): OrderLineForm => ({ itemId: "", quantity: "1" });

const quantityOf = (typed: string): number | undefined => {
  const digits = latinNumber(typed.trim());
  const n = /^\d{1,3}$/.test(digits) ? Number(digits) : 0;
  return n >= 1 && n <= ORDER_QUANTITY_MAX ? n : undefined;
};

export type OrderPayload = { customerName: string; customerPhone: string; lines: { itemId: string | null; quantity: number }[] };

/** The form as typed -> the errors by field (`customerName`, `customerPhone`, `line<N>Item`, `line<N>Quantity`, `lines`), or the payload to send. The phone and name rules are
 *  the shared ones of every sales form (customerRules), so a change of the phone rule reaches this page too. An item once, the undefined item once. */
export function readOrderForm(tr: Tr, form: { customerName: string; customerPhone: string; lines: readonly OrderLineForm[] }): { errors: Record<string, string>; payload?: OrderPayload } {
  const { L } = tr;
  const rules = customerRules(tr);
  const errors: Record<string, string> = {};
  const name = form.customerName.trim();
  const phone = latinNumber(form.customerPhone.trim());
  const nameError = rules.customerName(name);
  const phoneError = rules.customerPhone(phone);
  if (nameError) errors.customerName = nameError;
  if (phoneError) errors.customerPhone = phoneError;
  if (form.lines.length === 0 || form.lines.length > ORDER_LINES_MAX) errors.lines = L("أضف صنفًا واحدًا على الأقل.", "Add at least one item.");
  const seen = new Set<string>();
  form.lines.forEach((line, i) => {
    if (quantityOf(line.quantity) === undefined) errors[`line${i}Quantity`] = L(`العدد من 1 إلى ${ORDER_QUANTITY_MAX}.`, `The count is 1 to ${ORDER_QUANTITY_MAX}.`);
    if (seen.has(line.itemId)) errors[`line${i}Item`] = line.itemId === "" ? L("الصنف غير المحدد يُضاف مرة واحدة فقط.", "The undefined item can be added once.") : L("هذا الصنف مضاف بالفعل.", "This item is already added.");
    seen.add(line.itemId);
  });
  if (Object.keys(errors).length > 0) return { errors };
  return { errors, payload: { customerName: name, customerPhone: phone, lines: form.lines.map((l) => ({ itemId: l.itemId === "" ? null : l.itemId, quantity: quantityOf(l.quantity) as number })) } };
}

/** The items of an order in one line for the list: "name × 2، undefined × 1". An item with no id is the undefined one. */
export const linesSummary = (lines: readonly { itemId: string | null; itemName: string; quantity: number }[] | undefined, undefinedLabel: string, sep = "، "): string =>
  (lines ?? []).map((l) => `${l.itemId ? l.itemName : undefinedLabel} × ${l.quantity}`).join(sep);

/** The orders of the list by tab: all, the customers who came, and the ones who did not (still waiting included). The query the list sends. */
export const attendanceQuery = (tab: "all" | "present" | "absent"): Record<string, string> => (tab === "all" ? {} : { attendance: tab });
