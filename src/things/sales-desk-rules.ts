// The Sales desk's pure rules (issue #6): customer fields, item + count lines, planned payment against the total, the lock note.
// The phone and national ID rules are the ones of every sales form (customerRules); the payment rules are the payment block's.
import { hasAction, isDeskWideRole } from "@/lib/actions";
import { latinNumber } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { customerRules } from "./sales-form-parts";
import { LINES_MAX, bankPaid, cashPaid, paymentErrors, sentBanks, type Bank } from "./sales-invoices-math";

export { LINES_MAX };

/** The types the desk's type choice offers (owner, 2026-11-18): Sale, Hand over, and Reservation on a new draft for a person who has the reservations
 *  screen. A draft saved as "delivery" before Hand over replaced it still shows its own type. */
export const deskTypes = (current: string, isNew: boolean, mayReserve: boolean): string[] =>
  ["sale", ...(current === "delivery" ? ["delivery"] : []), "handover", ...(isNew && mayReserve ? ["reservation"] : [])];

/** What POST /reservations takes when the desk saves a reservation: today's date, paid in full, every bank line with its account.
 *  No channel, no typed price and no wrapping: a reservation has none (the backend prices it, silver as wrapped). */
export function reservationBody(x: { branchId: string; date: string; employeeId: string; customer: { customerName: string; customerPhone: string; nationalId?: string };
  lines: { itemId: string; quantity: number }[]; cash: string; banks: Bank[]; discount?: { kind: string; value: number }; visa: boolean }) {
  return {
    branchId: x.branchId, date: x.date, employeeId: x.employeeId, ...x.customer, lines: x.lines,
    ...(cashPaid(x.cash) > 0 ? { cash: cashPaid(x.cash) } : {}), bankPayments: sentBanks(x.banks),
    ...(x.discount && x.discount.value > 0 ? { cashDiscount: x.discount } : {}), ...(x.visa ? { payByVisa: true } : {}),
  };
}

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

export type ChannelOption = { id: string; name: string };
/** The desk does not sell wholesale (owner, 2026-11-18): the channel named جملة is never offered here, whoever is allowed it. */
const offered = (allowed: ChannelOption[] | undefined): ChannelOption[] => (allowed ?? []).filter((c) => c.name.trim() !== "جملة");
/** The lines a Sale or a Hand over keeps when the type leaves Reservation: only the items in stock and not switched off by hand (a reservation may hold any item). Stock not heard: all stay. */
export const linesInStock = <T extends { itemId: string }>(lines: T[], stock: ReadonlyMap<string, number> | undefined, switchedOff?: ReadonlySet<string>): T[] =>
  (stock ? lines.filter((l) => (stock.get(l.itemId) ?? 0) > 0 && !switchedOff?.has(l.itemId)) : lines);
/** The channels the picker offers: the ones /access/me allows, plus the draft's own stored channel (shown even when it is no longer allowed or was deleted). */
export function channelOptions(allowed: ChannelOption[] | undefined, stored?: ChannelOption | null): [string, string][] {
  const out: [string, string][] = offered(allowed).map((c) => [c.id, c.name]);
  if (stored && !out.some(([id]) => id === stored.id)) out.push([stored.id, stored.name]);
  return out;
}
/** A new draft starts on the only channel the person may use; with several or none it starts empty (the person must choose). */
export const defaultChannel = (allowed: ChannelOption[] | undefined): string => (offered(allowed).length === 1 ? offered(allowed)[0].id : "");
/** The picker's error code (fieldErrors): a channel is required and must be one of the offered ones. */
export const channelError = (id: string, options: [string, string][]): "required" | "invalid" | null => (id === "" ? "required" : options.some(([o]) => o === id) ? null : "invalid");

/** The planned payment against the draft's total (piastres): the payment block's own errors, what is planned, what is left (negative: more than the total). */
export function plannedAgainst(total: number, cash: string, banks: (Bank & { method: string })[]) {
  const planned = cashPaid(cash) + bankPaid(banks);
  return { errors: paymentErrors(cash, forMath(banks), "none"), planned, left: total - planned, over: planned > total };
}

export type LockDraft = { status: string; locked: boolean; createdDay: string };
/** What the screen says about a draft's edit state, from the server's own `locked` and `createdDay` (the client never works out midnight). */
export function lockNote(d: LockDraft, tr: Tr): { state: "editable" | "locked" | "completed" | "deleted"; text: string } {
  const t = (k: string, v?: Record<string, string | number>) => tr.t("gold-sales", `salesDesk.lock.${k}`, v);
  if (d.status === "completed") return { state: "completed", text: t("completed") };
  if (d.status === "deleted") return { state: "deleted", text: t("deleted") };
  return d.locked ? { state: "locked", text: t("reason", { day: d.createdDay }) } : { state: "editable", text: t("editable") };
}

/** Who completes a draft into an invoice: Admin and Super admin, or a plain user holding the action `complete-sales-draft`, on an open sell draft.
 *  Nobody while the person is unknown (the page is loading). A Buy draft is a quote only. The backend refuses the rest (403 notAllowed). */
export const canCompleteDraft = (me: { userType?: string; actions?: string[] } | undefined, status: string | undefined, buy: boolean): boolean =>
  hasAction(me, "complete-sales-draft") && status === "open" && !buy;

/** One channel per payment line (owner, 2026-11-09): a line is Instapay, Visa or Bank transfer, never two at once, and the backend takes each method once per
 *  sale. The methods row `i` may offer: every one not already used by another line ("cash" never counts), plus the row's own value. */
export function methodsLeftFor(i: number, rows: readonly { method: string }[], all: readonly string[]): string[] {
  const taken = new Set(rows.filter((r, j) => j !== i && r.method !== "cash").map((r) => r.method));
  const own = rows[i]?.method;
  return all.filter((m) => m === "cash" || m === own || !taken.has(m));
}
/** Only a Bank transfer line picks a bank account (owner, 2026-11-09). An Instapay or Visa line is its method and its amount; the account that received
 *  the money is asked at Complete, where the money is posted. */
export const lineTakesAccount = (method: string): boolean => method === "bank_transfer";
/** The rows as the shared payment math reads them: a line without an account that does not take one gets a stand-in account of its own, so the math
 *  (half a row, an account once) does not ask for what the line never shows. Never sent anywhere. */
export function forMath<T extends { method: string; bankAccountId: string }>(banks: readonly T[]): T[] {
  return banks.map((b, i) => (!b.bankAccountId && !lineTakesAccount(b.method) ? { ...b, bankAccountId: `none-${i}` } : b));
}

/** A plain user opening a draft that someone else made. */
export const isForeignDraft = (me: { id?: string; userType?: string } | null | undefined, draft: { employeeId?: string } | null | undefined): boolean =>
  Boolean(draft?.employeeId && me?.id && me.userType === "user" && draft.employeeId !== me.id);
/** A plain user with a desk-wide business role (the accountant) may edit another person's draft, of any branch (owner, 2026-11-25); no other plain user may. Complete and Delete have their own rules. */
export const mayEditForeignDraft = (me: { userType?: string; businessRole?: string | null } | null | undefined): boolean => me?.userType === "user" && isDeskWideRole(me.businessRole);
/** Who sees the drafts of every branch, so the list shows the branch and a branch filter: an Admin, the Super admin, and a plain user with a desk-wide business role. */
export const seesEveryBranchDrafts = (me: { userType?: string; businessRole?: string | null } | null | undefined): boolean =>
  me?.userType === "admin" || me?.userType === "super_admin" || mayEditForeignDraft(me);
