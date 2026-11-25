import { describe, expect, it } from "vitest";
import { ORDER_QUANTITY_MAX, attendanceQuery, blankOrderLine, linesSummary, readOrderForm, seesEveryOrder, statusText, statusTargets, statusTone } from "./customer-orders-rules";

// The engine's own translator answers the key when a message is missing; the rules are the real ones.
const tr: any = { L: (_ar: string, en: string) => en, t: (_ns: string, key: string) => key };
const item = "00000000-0000-4000-8000-000000000001";
const item2 = "00000000-0000-4000-8000-000000000002";
const ok = { customerName: " Mona ", customerPhone: "01012345678", lines: [{ itemId: item, quantity: "2" }] };

describe("who sees every order", () => {
  it("an Admin, the Super admin, the accountant, the call center admin and the branch sales manager do", () => {
    expect(seesEveryOrder({ userType: "admin" })).toBe(true);
    expect(seesEveryOrder({ userType: "super_admin" })).toBe(true);
    for (const role of ["accountant", "call_center_admin", "branch_sales_manager"]) expect(seesEveryOrder({ userType: "user", businessRole: role }), role).toBe(true);
  });
  it("every other plain user sees only their own, and nobody before the person is known", () => {
    for (const role of ["call_center", "branch_sales", "pricing_specialist", null, undefined]) expect(seesEveryOrder({ userType: "user", businessRole: role }), String(role)).toBe(false);
    expect(seesEveryOrder(undefined)).toBe(false);
    expect(seesEveryOrder(null)).toBe(false);
  });
});

describe("the status of an order", () => {
  it("says it in words and a tone: waiting, came, did not come", () => {
    const L = (_ar: string, en: string) => en;
    expect(statusText(L, "pending")).toBe("Not yet");
    expect(statusText(L, "present")).toBe("Came");
    expect(statusText(L, "not_present")).toBe("Did not come");
    expect(statusTone("pending")).toBe("warn");
    expect(statusTone("present")).toBe("good");
    expect(statusTone("not_present")).toBe("off");
  });
  it("offers every other status as a button, so a mistake can be undone", () => {
    expect(statusTargets("pending")).toEqual(["present", "not_present"]);
    expect(statusTargets("present")).toEqual(["pending", "not_present"]);
    expect(statusTargets("not_present")).toEqual(["pending", "present"]);
  });
});

describe("readOrderForm", () => {
  it("a customer, a phone and one item with a count: the payload is trimmed, with Latin digits", () => {
    const r = readOrderForm(tr, { ...ok, customerPhone: "٠١٠١٢٣٤٥٦٧٨", lines: [{ itemId: item, quantity: "٣" }] });
    expect(r.errors).toEqual({});
    expect(r.payload).toEqual({ customerName: "Mona", customerPhone: "01012345678", lines: [{ itemId: item, quantity: 3 }] });
  });
  it("the undefined item (no item chosen) is sent with a null id", () => {
    const r = readOrderForm(tr, { ...ok, lines: [{ itemId: "", quantity: "1" }, { itemId: item, quantity: "1" }] });
    expect(r.payload?.lines).toEqual([{ itemId: null, quantity: 1 }, { itemId: item, quantity: 1 }]);
  });
  it("a new form has one undefined line with a count of 1", () => {
    expect(blankOrderLine()).toEqual({ itemId: "", quantity: "1" });
  });
  it("refuses a bad phone and an empty name, with the shared rules' messages", () => {
    expect(readOrderForm(tr, { ...ok, customerPhone: "123" }).errors.customerPhone).toBeTruthy();
    expect(readOrderForm(tr, { ...ok, customerPhone: "" }).errors.customerPhone).toBeTruthy();
    expect(readOrderForm(tr, { ...ok, customerName: "   " }).errors.customerName).toBeTruthy();
    expect(readOrderForm(tr, { ...ok, customerName: "x".repeat(101) }).errors.customerName).toBeTruthy();
    expect(readOrderForm(tr, { ...ok, customerPhone: "123" }).payload).toBeUndefined();
  });
  it("a count from 1 to 100", () => {
    for (const quantity of ["0", "", "abc", "1.5", String(ORDER_QUANTITY_MAX + 1), "-1"]) {
      expect(Object.keys(readOrderForm(tr, { ...ok, lines: [{ itemId: item, quantity }] }).errors), quantity).toEqual(["line0Quantity"]);
    }
    expect(readOrderForm(tr, { ...ok, lines: [{ itemId: item, quantity: String(ORDER_QUANTITY_MAX) }] }).errors).toEqual({});
  });
  it("an item once and the undefined item once", () => {
    expect(Object.keys(readOrderForm(tr, { ...ok, lines: [{ itemId: item, quantity: "1" }, { itemId: item, quantity: "1" }] }).errors)).toEqual(["line1Item"]);
    expect(Object.keys(readOrderForm(tr, { ...ok, lines: [{ itemId: "", quantity: "1" }, { itemId: "", quantity: "1" }] }).errors)).toEqual(["line1Item"]);
    expect(readOrderForm(tr, { ...ok, lines: [{ itemId: item, quantity: "1" }, { itemId: item2, quantity: "1" }, { itemId: "", quantity: "1" }] }).errors).toEqual({});
  });
  it("at least one line", () => {
    expect(readOrderForm(tr, { ...ok, lines: [] }).errors.lines).toBeTruthy();
  });
});

describe("the list", () => {
  it("shows the items of an order in one line, the undefined item by its label", () => {
    const lines = [{ itemId: item, itemName: "Gold bar", quantity: 2 }, { itemId: null, itemName: "", quantity: 1 }];
    expect(linesSummary(lines, "Undefined", ", ")).toBe("Gold bar × 2, Undefined × 1");
    expect(linesSummary(undefined, "Undefined")).toBe("");
  });
  it("the tabs send nothing for all, and present or absent otherwise", () => {
    expect(attendanceQuery("all")).toEqual({});
    expect(attendanceQuery("present")).toEqual({ attendance: "present" });
    expect(attendanceQuery("absent")).toEqual({ attendance: "absent" });
  });
});
