// Price requests (owner, 2026-11-25, backend #228): a salesperson asks the accountant to approve selling some items, from the price board. The pure rules: who sees
// the tabs and decides, the status words, and the send form's check and payload. The backend enforces all of it; nothing here guesses beyond showing the right buttons.
import { latinNumber } from "@/lib/format";

export const REQUEST_QUANTITY_MAX = 100;
export const REQUEST_LINES_MAX = 50;
export const REQUEST_NOTE_MAX = 1000;

type Person = { userType?: string; businessRole?: string | null; screens?: string[] } | null | undefined;

/** The deciders: an Admin, the Super admin and a plain user with the business role accountant. They see every request and accept or reject. */
export const isRequestDecider = (me: Person): boolean => me?.userType === "admin" || me?.userType === "super_admin" || (me?.userType === "user" && me.businessRole === "accountant");


export type RequestStatus = "pending" | "accepted" | "rejected";
export const requestStatusText = (L: (ar: string, en: string) => string, status: string): string =>
  status === "accepted" ? L("مقبول", "Accepted") : status === "rejected" ? L("مرفوض", "Rejected") : L("قيد الانتظار", "Pending");
export const requestStatusTone = (status: string): "good" | "warn" | "off" => (status === "accepted" ? "good" : status === "rejected" ? "off" : "warn");

/** The tabs of the price board, in order: the board, Send a request and Requests, for everyone who can open the price board (owner, 2026-11-25: no second tick). A person
 *  sees only their own requests; the deciders see all. An address naming a tab that does not exist falls back to the board. */
export type BoardTab = "board" | "send" | "requests";
export const boardTabs = (): BoardTab[] => ["board", "send", "requests"];
export const tabFromAddress = (tab: string | null | undefined): BoardTab => {
  const tabs = boardTabs();
  return tabs.includes(tab as BoardTab) ? (tab as BoardTab) : "board";
};

export type RequestLineForm = { itemId: string; quantity: string };
export const blankRequestLine = (): RequestLineForm => ({ itemId: "", quantity: "1" });

const quantityOf = (typed: string): number | undefined => {
  const digits = latinNumber(typed.trim());
  const n = /^\d{1,3}$/.test(digits) ? Number(digits) : 0;
  return n >= 1 && n <= REQUEST_QUANTITY_MAX ? n : undefined;
};

/** The send form -> the errors by field (`line<N>Item`, `line<N>Quantity`, `lines`), or the payload. Every line needs an item; an item once; counts 1 to 100. */
export function readRequestForm(L: (ar: string, en: string) => string, lines: readonly RequestLineForm[]): { errors: Record<string, string>; payload?: { lines: { itemId: string; quantity: number }[] } } {
  const errors: Record<string, string> = {};
  if (lines.length === 0 || lines.length > REQUEST_LINES_MAX) errors.lines = L("أضف صنفًا واحدًا على الأقل.", "Add at least one item.");
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    if (!line.itemId) errors[`line${i}Item`] = L("اختر الصنف.", "Pick the item.");
    else if (seen.has(line.itemId)) errors[`line${i}Item`] = L("هذا الصنف مضاف بالفعل.", "This item is already added.");
    if (line.itemId) seen.add(line.itemId);
    if (quantityOf(line.quantity) === undefined) errors[`line${i}Quantity`] = L(`العدد من 1 إلى ${REQUEST_QUANTITY_MAX}.`, `The count is 1 to ${REQUEST_QUANTITY_MAX}.`);
  });
  if (Object.keys(errors).length > 0) return { errors };
  return { errors, payload: { lines: lines.map((l) => ({ itemId: l.itemId, quantity: quantityOf(l.quantity) as number })) } };
}

/** The items of a request in one line: "name × 2، name × 1". */
export const requestLinesSummary = (lines: readonly { itemName: string; quantity: number }[] | undefined, sep = "، "): string => (lines ?? []).map((l) => `${l.itemName} × ${l.quantity}`).join(sep);
