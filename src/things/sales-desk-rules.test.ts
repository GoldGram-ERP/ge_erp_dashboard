import { describe, expect, it } from "vitest";
import { LINES_MAX, isForeignDraft, mayEditForeignDraft, seesEveryBranchDrafts, canCompleteDraft, channelError, channelOptions, defaultChannel, deskTypes, forMath, lineTakesAccount, linesInStock, lockNote, methodsLeftFor, plannedAgainst, readCustomer, readLines, reservationBody } from "./sales-desk-rules";

// The engine's own translator answers the key when a message is missing; the rules are the real ones.
const tr: any = { t: (_ns: string, key: string, v?: Record<string, unknown>) => (v ? `${key}|${JSON.stringify(v)}` : key) };
const ok = { customerName: " Mona ", customerPhone: "01012345678", nationalId: "" };

describe("customer fields", () => {
  it("the phone takes 8 to 15 digits, and Arabic-Indic or Persian digits become Latin", () => {
    expect(readCustomer(tr, { ...ok, customerPhone: "١٢٣٤٥٦٧٨" }).payload?.customerPhone).toBe("12345678");
    expect(readCustomer(tr, { ...ok, customerPhone: "۰۱۰۱۲۳۴۵۶۷۸" }).payload?.customerPhone).toBe("01012345678");
    expect(readCustomer(tr, { ...ok, customerPhone: "123456789012345" }).payload?.customerPhone).toBe("123456789012345");
    for (const bad of ["1234567", "1234567890123456", "0101 234 5678", "+201012345678", "010-1234-5678", "abc12345678"]) {
      expect(readCustomer(tr, { ...ok, customerPhone: bad }).errors, bad).toEqual({ customerPhone: "salesInvoices.phoneInvalid" });
    }
    expect(readCustomer(tr, { ...ok, customerPhone: "" }).errors).toEqual({ customerPhone: "fieldErrors.required" });
  });
  it("the national ID is optional, 14 digits, Arabic digits normalised; the name is trimmed and required", () => {
    expect(readCustomer(tr, ok)).toEqual({ errors: {}, payload: { customerName: "Mona", customerPhone: "01012345678" } });
    expect(readCustomer(tr, { ...ok, nationalId: "٢٩٠٠١٠١١٢٣٤٥٦٧" }).payload?.nationalId).toBe("29001011234567");
    for (const bad of ["2900101123456", "290010112345678", "2900101123456a"]) expect(readCustomer(tr, { ...ok, nationalId: bad }).errors, bad).toEqual({ nationalId: "salesInvoices.nationalIdInvalid" });
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
  it("nobody does while the person is unknown (the page is still loading)", () => {
    expect(canCompleteDraft(undefined, "open", false)).toBe(false);
  });
  it("not a completed, deleted or missing draft, and not a Buy draft (a quote only)", () => {
    for (const status of ["completed", "deleted", undefined]) expect(canCompleteDraft({ userType: "admin" }, status, false)).toBe(false);
    expect(canCompleteDraft({ userType: "admin" }, "open", true)).toBe(false);
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

describe("the type choice and the reservation the desk saves", () => {
  it("offers Sale and Hand over; Reservation only on a new draft for a person with the reservations screen; an old delivery draft keeps its type", () => {
    expect(deskTypes("sale", true, true)).toEqual(["sale", "handover", "reservation"]);
    expect(deskTypes("sale", true, false)).toEqual(["sale", "handover"]);
    expect(deskTypes("handover", false, true)).toEqual(["sale", "handover"]);
    expect(deskTypes("delivery", false, true)).toEqual(["sale", "delivery", "handover"]);
  });
  it("sends a reservation paid by cash and bank lines, the discount and Visa only when they are there", () => {
    const base = { branchId: "b1", date: "2026-11-18", employeeId: "u1", customer: { customerName: "Mona", customerPhone: "01012345678" }, lines: [{ itemId: "i1", quantity: 2 }] };
    expect(reservationBody({ ...base, cash: "100", banks: [{ bankAccountId: "a1", amount: "50.5" }, { bankAccountId: "", amount: "" }], discount: { kind: "amount", value: 0 }, visa: false }))
      .toEqual({ branchId: "b1", date: "2026-11-18", employeeId: "u1", customerName: "Mona", customerPhone: "01012345678", lines: [{ itemId: "i1", quantity: 2 }], cash: 10000, bankPayments: [{ bankAccountId: "a1", amount: 5050 }] });
    expect(reservationBody({ ...base, cash: "", banks: [{ bankAccountId: "a2", amount: "300" }], discount: { kind: "percent", value: 5 }, visa: true }))
      .toEqual({ ...base, customer: undefined, customerName: "Mona", customerPhone: "01012345678", bankPayments: [{ bankAccountId: "a2", amount: 30000 }], cashDiscount: { kind: "percent", value: 5 }, payByVisa: true });
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
