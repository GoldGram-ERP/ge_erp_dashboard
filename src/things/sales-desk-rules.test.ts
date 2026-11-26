import { describe, expect, it } from "vitest";
import { LINES_MAX, isForeignDraft, mayEditForeignDraft, mayDeleteDraft, seesEveryBranchDrafts, canCompleteDraft, channelError, channelOptions, defaultChannel, deskTypes, forMath, lineTakesAccount, linesInStock, lockNote, methodsLeftFor, plannedAgainst, readCustomer, readLines, canCompleteBuyDraft, canConfirmReservation, discountCell, paymentMethodsOf } from "./sales-desk-rules";

// The engine's own translator answers the key when a message is missing; the rules are the real ones.
const tr: any = { t: (_ns: string, key: string, v?: Record<string, unknown>) => (v ? `${key}|${JSON.stringify(v)}` : key) };
const ok = { customerName: " Mona ", customerPhone: "01012345678", nationalId: "29001011234567" };

describe("customer fields", () => {
  it("the phone is 11 digits starting 010, 011, 012 or 015, and Arabic-Indic or Persian digits become Latin (backend #222)", () => {
    for (const good of ["01012345678", "01112345678", "01212345678", "01512345678"]) expect(readCustomer(tr, { ...ok, customerPhone: good }).payload?.customerPhone, good).toBe(good);
    expect(readCustomer(tr, { ...ok, customerPhone: "٠١١٢٣٤٥٦٧٨٩" }).payload?.customerPhone).toBe("01123456789");
    expect(readCustomer(tr, { ...ok, customerPhone: "۰۱۰۱۲۳۴۵۶۷۸" }).payload?.customerPhone).toBe("01012345678");
    // The old 8-15 digit rule took the first three; a landline and the other prefixes are refused too.
    for (const bad of ["12345678", "123456789012345", "0223456789", "01312345678", "01412345678", "01612345678", "0101234567", "010123456789", "11012345678",
      "1234567", "0101 234 5678", "+201012345678", "010-1234-5678", "abc12345678"]) {
      expect(readCustomer(tr, { ...ok, customerPhone: bad }).errors, bad).toEqual({ customerPhone: "fieldErrors.phone" });
    }
    expect(readCustomer(tr, { ...ok, customerPhone: "" }).errors).toEqual({ customerPhone: "fieldErrors.required" });
  });
  it("the national ID is required, 14 digits, Arabic digits normalised; the name is trimmed and required", () => {
    expect(readCustomer(tr, ok)).toEqual({ errors: {}, payload: { customerName: "Mona", customerPhone: "01012345678", nationalId: "29001011234567" } });
    expect(readCustomer(tr, { ...ok, nationalId: "" }).errors).toEqual({ nationalId: "fieldErrors.required" });
    expect(readCustomer(tr, { ...ok, nationalId: "   " }).errors).toEqual({ nationalId: "fieldErrors.required" });
    expect(readCustomer(tr, { ...ok, nationalId: "٢٩٠٠١٠١١٢٣٤٥٦٧" }).payload?.nationalId).toBe("29001011234567");
    for (const bad of ["2900101123456", "290010112345678", "2900101123456a"]) expect(readCustomer(tr, { ...ok, nationalId: bad }).errors, bad).toEqual({ nationalId: "fieldErrors.nationalId" });
    expect(readCustomer(tr, { ...ok, customerName: "  " }).errors).toEqual({ customerName: "fieldErrors.required" });
    expect(readCustomer(tr, { ...ok, customerName: "x".repeat(101) }).errors).toEqual({ customerName: "fieldErrors.tooLong" });
  });
});

describe("item + count lines", () => {
  it("sends item and quantity as numbers, counts typed in Arabic digits included", () => {
    expect(readLines([{ itemId: "ring", count: "2" }, { itemId: "chain", count: "٣" }]).payload).toEqual([{ itemId: "ring", quantity: 2 }, { itemId: "chain", quantity: 3 }]);
  });
  it("refuses no lines, a missing item, a repeated item, and counts that are empty, zero, fractional, negative or above the maximum", () => {
    expect(LINES_MAX).toBe(100);
    expect(readLines([]).errors).toEqual({ lines: "required" });
    expect(readLines([{ itemId: "", count: "1" }]).errors).toEqual({ line0Item: "required" });
    expect(readLines([{ itemId: "a", count: "1" }, { itemId: "a", count: "1" }]).errors).toEqual({ line1Item: "duplicateItem" });
    for (const bad of ["0", "1.5", "-1", "101", "abc", "1e2"]) expect(readLines([{ itemId: "a", count: bad }]).errors, bad).toEqual({ line0Count: "invalid" });
    expect(readLines([{ itemId: "a", count: "" }]).errors).toEqual({ line0Count: "required" });
    expect(readLines([{ itemId: "a", count: "100" }]).payload).toEqual([{ itemId: "a", quantity: 100 }]);
    expect(readLines(Array.from({ length: 101 }, (_, i) => ({ itemId: `i${i}`, count: "1" }))).errors).toEqual({ lines: "invalid" });
  });
});

describe("planned payment against the total", () => {
  // 2 rings of 5 g at the day's price: 54,255.00 EGP = 5,425,500 piastres.
  it("10,000.00 cash + 44,255.00 in a bank leaves nothing; 10,000.00 alone leaves 44,255.00", () => {
    expect(plannedAgainst(5_425_500, "10000", [{ bankAccountId: "b1", amount: "44255.00", method: "bank_transfer" }])).toMatchObject({ errors: {}, planned: 5_425_500, left: 0, over: false });
    expect(plannedAgainst(5_425_500, "10000", [])).toMatchObject({ planned: 1_000_000, left: 4_425_500, over: false });
  });
  it("more than the total is flagged; the payment block's own refusals come through (bad cash, a bank amount without an account)", () => {
    expect(plannedAgainst(100, "1.01", [])).toMatchObject({ left: -1, over: true });
    expect(plannedAgainst(100, "0", []).errors).toEqual({ cash: "invalid" });
    expect(plannedAgainst(100, "", [{ bankAccountId: "", amount: "5", method: "bank_transfer" }]).errors).toEqual({ bank0Account: "required" });
  });
});

describe("lock note", () => {
  it("an open draft before midnight says it can be edited; after midnight it names the day it was made", () => {
    expect(lockNote({ status: "open", locked: false, createdDay: "2026-11-05" }, tr)).toEqual({ state: "editable", text: "salesDesk.lock.editable" });
    expect(lockNote({ status: "open", locked: true, createdDay: "2026-11-04" }, tr)).toEqual({ state: "locked", text: 'salesDesk.lock.reason|{"day":"2026-11-04"}' });
  });
  it("a completed or deleted draft says so, whatever `locked` is", () => {
    expect(lockNote({ status: "completed", locked: false, createdDay: "2026-11-05" }, tr).state).toBe("completed");
    expect(lockNote({ status: "deleted", locked: true, createdDay: "2026-11-04" }, tr).state).toBe("deleted");
  });
});

describe("who completes a draft (issue #25; per-person action since 2026-11-10)", () => {
  it("an Admin and the Super admin complete an open sell draft", () => {
    expect(canCompleteDraft({ userType: "admin" }, "open", false)).toBe(true);
    expect(canCompleteDraft({ userType: "super_admin" }, "open", false)).toBe(true);
  });
  it("a plain User only with the action complete-sales-draft", () => {
    expect(canCompleteDraft({ userType: "user" }, "open", false)).toBe(false);
    expect(canCompleteDraft({ userType: "user", actions: ["give-cash-discount"] }, "open", false)).toBe(false);
    expect(canCompleteDraft({ userType: "user", actions: ["complete-sales-draft"] }, "open", false)).toBe(true);
  });
  it("the accountant, the call center admin and the branch sales manager complete by the role alone, without the action (owner, 2026-11-25)", () => {
    for (const role of ["accountant", "call_center_admin", "branch_sales_manager"]) {
      expect(canCompleteDraft({ userType: "user", businessRole: role }, "open", false), role).toBe(true);
      expect(canCompleteDraft({ userType: "user", businessRole: role, actions: [] }, "open", false), role).toBe(true);
    }
  });
  it("the other roles still need the action", () => {
    for (const role of ["call_center", "branch_sales", "pricing_specialist", null, undefined]) {
      expect(canCompleteDraft({ userType: "user", businessRole: role }, "open", false), String(role)).toBe(false);
      expect(canCompleteDraft({ userType: "user", businessRole: role, actions: ["complete-sales-draft"] }, "open", false), String(role)).toBe(true);
    }
  });
  it("nobody does while the person is unknown (the page is still loading)", () => {
    expect(canCompleteDraft(undefined, "open", false)).toBe(false);
  });
  it("not a completed, deleted or missing draft, and not a Buy draft (a quote only), whatever the role", () => {
    for (const status of ["completed", "deleted", undefined]) expect(canCompleteDraft({ userType: "admin" }, status, false)).toBe(false);
    expect(canCompleteDraft({ userType: "admin" }, "open", true)).toBe(false);
    for (const status of ["completed", "deleted", undefined]) expect(canCompleteDraft({ userType: "user", businessRole: "accountant" }, status, false)).toBe(false);
    expect(canCompleteDraft({ userType: "user", businessRole: "accountant" }, "open", true)).toBe(false);
  });
});

describe("the sales channel picker", () => {
  const web = { id: "w", name: "الموقع" }, hot = { id: "h", name: "الخط الساخن" };
  it("offers exactly the channels /access/me allows", () => {
    expect(channelOptions([web, hot])).toEqual([["w", "الموقع"], ["h", "الخط الساخن"]]);
    expect(channelOptions(undefined)).toEqual([]);
  });
  it("keeps the draft's own stored channel visible even when it is no longer allowed", () => {
    expect(channelOptions([web], { id: "r", name: "قطاعي" })).toEqual([["w", "الموقع"], ["r", "قطاعي"]]);
    expect(channelOptions([web], web)).toEqual([["w", "الموقع"]]);
  });
  it("a new draft preselects the one allowed channel, and nothing when there are several or none", () => {
    expect(defaultChannel([web])).toBe("w");
    expect(defaultChannel([web, hot])).toBe("");
    expect(defaultChannel([])).toBe("");
  });
  it("a channel is required and must be one of the offered ones", () => {
    const opts = channelOptions([web, hot]);
    expect(channelError("", opts)).toBe("required");
    expect(channelError("x", opts)).toBe("invalid");
    expect(channelError("h", opts)).toBeNull();
  });
});

describe("one channel per payment line (owner, 2026-11-09)", () => {
  const ALL = ["instapay", "bank_transfer", "visa"];
  const r = (...methods: string[]) => methods.map((method) => ({ method }));
  it("a method already on another line is not offered again (the backend takes each once); the line's own value stays", () => {
    expect(methodsLeftFor(0, [], ALL)).toEqual(ALL);
    expect(methodsLeftFor(0, r("instapay"), ALL)).toEqual(ALL);
    expect(methodsLeftFor(1, r("instapay", "bank_transfer"), ALL)).toEqual(["bank_transfer", "visa"]);
    expect(methodsLeftFor(1, r("instapay", "bank_transfer"), ALL)).not.toContain("instapay");
  });
  it("different channels on different lines are allowed: Instapay on one, Bank transfer on the next", () => {
    expect(methodsLeftFor(1, r("instapay", "instapay"), ALL)).toEqual(ALL);
    expect(methodsLeftFor(0, r("bank_transfer", "instapay"), ALL)).toEqual(["bank_transfer", "visa"]);
  });
  it("cash never counts as a line's channel", () => {
    expect(methodsLeftFor(1, r("cash", "instapay"), ["cash", ...ALL])).toEqual(["cash", ...ALL]);
  });
  it("deleting a line frees its method", () => {
    const rows = r("instapay", "bank_transfer");
    expect(methodsLeftFor(1, rows, ALL)).not.toContain("instapay");
    expect(methodsLeftFor(0, rows.slice(1), ALL)).toContain("bank_transfer");
  });
  it("only a Bank transfer line takes a bank account", () => {
    expect(lineTakesAccount("bank_transfer")).toBe(true);
    expect(lineTakesAccount("instapay")).toBe(false);
    expect(lineTakesAccount("visa")).toBe(false);
  });
  it("the payment math does not ask an Instapay or Visa line for an account, but still asks a Bank transfer line", () => {
    expect(plannedAgainst(1_000_00, "", [{ bankAccountId: "", amount: "100", method: "instapay" }]).errors).toEqual({});
    expect(plannedAgainst(1_000_00, "", [{ bankAccountId: "", amount: "100", method: "visa" }]).errors).toEqual({});
    expect(plannedAgainst(1_000_00, "", [{ bankAccountId: "", amount: "100", method: "bank_transfer" }]).errors).toEqual({ bank0Account: "required" });
  });
  it("an Instapay line counts toward what is planned, so the remainder is right", () => {
    expect(plannedAgainst(100_00, "", [{ bankAccountId: "", amount: "40", method: "instapay" }])).toMatchObject({ planned: 4_000, left: 6_000, over: false });
  });
  it("forMath gives an accountless Instapay line its own stand-in account and leaves every other line alone", () => {
    const rows = [{ bankAccountId: "", amount: "1", method: "instapay" }, { bankAccountId: "x", amount: "2", method: "bank_transfer" }, { bankAccountId: "", amount: "3", method: "bank_transfer" }];
    expect(forMath(rows).map((b) => b.bankAccountId)).toEqual(["none-0", "x", ""]);
  });
});

describe("the type choice and the reservation draft", () => {
  it("offers Reservation on a new draft and on a saved reservation draft only; an old delivery draft keeps its type", () => {
    expect(deskTypes("sale", true)).toEqual(["sale", "handover", "reservation"]);
    expect(deskTypes("handover", false)).toEqual(["sale", "handover"]);
    expect(deskTypes("reservation", false)).toEqual(["sale", "handover", "reservation"]);
    expect(deskTypes("delivery", false)).toEqual(["sale", "delivery", "handover"]);
  });
  it("lets an Admin, the Super admin and the accountant confirm an open reservation draft, nobody else", () => {
    const draft = { status: "open", invoiceType: "reservation", locked: false };
    expect(canConfirmReservation({ userType: "admin" }, draft)).toBe(true);
    expect(canConfirmReservation({ userType: "super_admin" }, draft)).toBe(true);
    expect(canConfirmReservation({ userType: "user", businessRole: "accountant" }, draft)).toBe(true);
    for (const role of ["call_center", "branch_sales", "call_center_admin", "branch_sales_manager", "pricing_specialist", null]) {
      expect(canConfirmReservation({ userType: "user", businessRole: role }, draft), String(role)).toBe(false);
    }
    expect(canConfirmReservation(undefined, draft)).toBe(false);
  });
  it("offers Confirm only while the draft waits for it, and Complete never on a reservation draft", () => {
    const admin = { userType: "admin" };
    for (const status of ["completed", "reserved", "deleted"]) expect(canConfirmReservation(admin, { status, invoiceType: "reservation" }), status).toBe(false);
    expect(canConfirmReservation(admin, { status: "open", invoiceType: "sale" })).toBe(false);
    expect(canConfirmReservation(admin, { status: "open", invoiceType: "reservation", locked: true })).toBe(false);
    expect(canCompleteDraft(admin, "open", false, "reservation")).toBe(false);
    expect(canCompleteDraft(admin, "open", false, "sale")).toBe(true);
  });
});
describe("completing a Buy draft", () => {
  const draft = { status: "open", operation: "buy", locked: false };
  it("is for the same people as a sale's Complete", () => {
    expect(canCompleteBuyDraft({ userType: "admin" }, draft)).toBe(true);
    expect(canCompleteBuyDraft({ userType: "super_admin" }, draft)).toBe(true);
    expect(canCompleteBuyDraft({ userType: "user", businessRole: "accountant" }, draft)).toBe(true);
    expect(canCompleteBuyDraft({ userType: "user", actions: ["complete-sales-draft"] }, draft)).toBe(true);
    expect(canCompleteBuyDraft({ userType: "user", businessRole: "branch_sales" }, draft)).toBe(false);
    expect(canCompleteBuyDraft(undefined, draft)).toBe(false);
  });
  it("is only on an open Buy draft that is not locked for the person", () => {
    const admin = { userType: "admin" };
    for (const status of ["completed", "deleted"]) expect(canCompleteBuyDraft(admin, { ...draft, status }), status).toBe(false);
    expect(canCompleteBuyDraft(admin, { ...draft, operation: "sell" })).toBe(false);
    expect(canCompleteBuyDraft(admin, { ...draft, locked: true })).toBe(false);
    expect(canCompleteBuyDraft(admin, null)).toBe(false);
  });
});

describe("wholesale is not a desk channel, and leaving Reservation drops what is not in stock", () => {
  it("never offers the channel named جملة, and a person left with one other channel starts on it", () => {
    const retail = { id: "r", name: "قطاعي" }, whole = { id: "g", name: " جملة " };
    expect(channelOptions([retail, whole])).toEqual([["r", "قطاعي"]]);
    expect(defaultChannel([retail, whole])).toBe("r");
    expect(channelOptions([retail], whole)).toEqual([["r", "قطاعي"], ["g", " جملة "]]);   // a saved draft still shows its own channel
  });
  it("keeps only the lines whose item has pieces; with no stock answer every line stays", () => {
    const lines = [{ itemId: "a", count: "1" }, { itemId: "b", count: "2" }, { itemId: "c", count: "1" }];
    expect(linesInStock(lines, new Map([["a", 3], ["b", 0]]))).toEqual([lines[0]]);
    expect(linesInStock(lines, undefined)).toEqual(lines);
  });
});

describe("linesInStock and the hand switch", () => {
  it("also drops the items switched off by hand", () => {
    const lines = [{ itemId: "a", count: "1" }, { itemId: "b", count: "1" }];
    expect(linesInStock(lines, new Map([["a", 2], ["b", 2]]), new Set(["b"]))).toEqual([lines[0]]);
  });
});

describe("another person's draft (owner, 2026-11-24)", () => {
  const draft = { employeeId: "seller" };
  it("is foreign only for a plain user who did not make it", () => {
    expect(isForeignDraft({ id: "me", userType: "user" }, draft)).toBe(true);
    expect(isForeignDraft({ id: "seller", userType: "user" }, draft)).toBe(false);
    expect(isForeignDraft({ id: "boss", userType: "admin" }, draft)).toBe(false);
    expect(isForeignDraft({ id: "me", userType: "user" }, null)).toBe(false);
    expect(isForeignDraft(undefined, draft)).toBe(false);
  });
  it("an accountant, a call center admin and a branch sales manager may edit it, of any branch (owner, 2026-11-25), no other plain user may", () => {
    for (const role of ["accountant", "call_center_admin", "branch_sales_manager"]) expect(mayEditForeignDraft({ userType: "user", businessRole: role }), role).toBe(true);
    for (const role of ["call_center", "branch_sales", "pricing_specialist", null, undefined]) expect(mayEditForeignDraft({ userType: "user", businessRole: role })).toBe(false);
    expect(mayEditForeignDraft({ userType: "admin", businessRole: "accountant" })).toBe(false);   // an Admin edits anyway: never a "foreign" draft
    expect(mayEditForeignDraft(undefined)).toBe(false);
  });
});

// Delete on a draft (owner, 2026-11-25): the action and an open draft the person has opened; no role, not the creator.
describe("mayDeleteDraft", () => {
  const open = { status: "open" };
  it("anyone with the action deletes an open draft, whatever their role and whoever made it", () => {
    for (const businessRole of [null, undefined, "call_center", "branch_sales", "pricing_specialist", "accountant", "call_center_admin", "branch_sales_manager"]) {
      expect(mayDeleteDraft({ userType: "user", businessRole, actions: ["delete-records"] } as any, open), String(businessRole)).toBe(true);
    }
  });
  it("without the action nobody but an Admin and the Super admin does, whatever the role", () => {
    for (const businessRole of [null, "call_center", "accountant", "call_center_admin", "branch_sales_manager"]) {
      expect(mayDeleteDraft({ userType: "user", businessRole, actions: [] } as any, open), String(businessRole)).toBe(false);
      expect(mayDeleteDraft({ userType: "user", businessRole, actions: ["complete-sales-draft"] } as any, open), String(businessRole)).toBe(false);
    }
    expect(mayDeleteDraft({ userType: "admin" }, open)).toBe(true);
    expect(mayDeleteDraft({ userType: "super_admin", actions: [] }, open)).toBe(true);
  });
  it("never a completed or deleted draft, a new draft that is not saved, or while the person is unknown", () => {
    for (const status of ["completed", "deleted", undefined]) expect(mayDeleteDraft({ userType: "admin" }, { status }), String(status)).toBe(false);
    expect(mayDeleteDraft({ userType: "admin" }, null)).toBe(false);
    expect(mayDeleteDraft({ userType: "admin" }, undefined)).toBe(false);
    expect(mayDeleteDraft(undefined, open)).toBe(false);
    expect(mayDeleteDraft(null, open)).toBe(false);
  });
});

// The list shows the branch column and the branch filter to whoever sees the drafts of every branch (owner, 2026-11-25).
describe("seesEveryBranchDrafts", () => {
  it("an Admin, the Super admin, an accountant, a call center admin and a branch sales manager do", () => {
    expect(seesEveryBranchDrafts({ userType: "admin" })).toBe(true);
    expect(seesEveryBranchDrafts({ userType: "super_admin" })).toBe(true);
    for (const role of ["accountant", "call_center_admin", "branch_sales_manager"]) expect(seesEveryBranchDrafts({ userType: "user", businessRole: role }), role).toBe(true);
  });
  it("no other plain user does, and nobody before the person is known", () => {
    for (const role of ["call_center", "branch_sales", "pricing_specialist", null, undefined]) expect(seesEveryBranchDrafts({ userType: "user", businessRole: role })).toBe(false);
    expect(seesEveryBranchDrafts(undefined)).toBe(false);
    expect(seesEveryBranchDrafts(null)).toBe(false);
  });
});

describe("the drafts list columns (dashboard #97)", () => {
  it("discount: '-' with none; a percent with its amount; a typed cash discount; never on a Buy draft", () => {
    expect(discountCell({ discountPercent: 0, totals: { discount: 0 } })).toBeNull();
    expect(discountCell({ totals: null })).toBeNull();
    expect(discountCell({ discountPercent: 5, totals: { discount: 12_500 } })).toEqual({ kind: "percent", percent: 5, amount: 12_500 });
    expect(discountCell({ discountPercent: 10, totals: { discount: 30_000 } })).toEqual({ kind: "percent", percent: 10, amount: 30_000 });
    expect(discountCell({ discountPercent: 0, totals: { discount: 50_000 } })).toEqual({ kind: "cash", amount: 50_000 });
    expect(discountCell({ operation: "buy", discountPercent: 5, totals: { discount: 12_500 } })).toBeNull();
  });

  it("payment: every planned method once, in the desk's order", () => {
    expect(paymentMethodsOf({ paymentMethods: [{ method: "visa" }] })).toEqual(["visa"]);
    expect(paymentMethodsOf({ paymentMethods: [{ method: "bank_transfer" }, { method: "cash" }, { method: "instapay" }] })).toEqual(["cash", "instapay", "bank_transfer"]);
    // the same method on two rows (two accounts) is one pill
    expect(paymentMethodsOf({ paymentMethods: [{ method: "instapay" }, { method: "instapay" }] })).toEqual(["instapay"]);
  });

  it("payment of an older draft (no methods list) is read from its cash, bank rows and Visa flag; '-' when nothing is planned", () => {
    expect(paymentMethodsOf({ paymentMethods: null, cash: 100_000, bankPayments: [{ bankAccountId: "a", amount: 5 }] })).toEqual(["cash", "bank_transfer"]);
    expect(paymentMethodsOf({ paymentMethods: null, cash: 100_000, bankPayments: [] })).toEqual(["cash"]);
    expect(paymentMethodsOf({ paymentMethods: null, cash: 0, bankPayments: [{ bankAccountId: "a", amount: 5 }] })).toEqual(["bank_transfer"]);
    expect(paymentMethodsOf({ paymentMethods: null, payByVisa: true, cash: 0, bankPayments: [] })).toEqual(["visa"]);
    expect(paymentMethodsOf({ paymentMethods: null, cash: 0, bankPayments: [] })).toEqual([]);
    expect(paymentMethodsOf({})).toEqual([]);
  });
});
