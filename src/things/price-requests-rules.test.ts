import { describe, expect, it } from "vitest";
import { REQUEST_KINDS, REQUEST_QUANTITY_MAX, blankRequestLine, boardTabs, isRequestDecider, readRequestForm, requestKindText, requestLinesSummary, requestStatusText, requestStatusTone, tabFromAddress } from "./price-requests-rules";

// Price requests (owner, 2026-11-25, backend #228): who decides and sees the tabs, the words of a status, and the send form.
const L = (_ar: string, en: string) => en;
const item = "00000000-0000-4000-8000-000000000001";
const item2 = "00000000-0000-4000-8000-000000000002";

describe("who decides and who gets the tabs", () => {
  it("an Admin, the Super admin and an accountant decide", () => {
    for (const me of [{ userType: "admin" }, { userType: "super_admin" }, { userType: "user", businessRole: "accountant", screens: [] }]) {
      expect(isRequestDecider(me), JSON.stringify(me)).toBe(true);
      expect(boardTabs()).toEqual(["board", "send", "requests"]);
    }
  });
  it("a normal user gets the same three tabs with no extra tick, and never decides", () => {
    const seller = { userType: "user", businessRole: null, screens: ["gold-sales/price-board"] };
    expect(boardTabs()).toEqual(["board", "send", "requests"]);
    expect(boardTabs()).toEqual(["board", "send", "requests"]);
    for (const role of ["call_center_admin", "branch_sales_manager", "call_center", null]) expect(isRequestDecider({ userType: "user", businessRole: role }), String(role)).toBe(false);
  });
  it("an address names one of the tabs, or falls back to the board", () => {
    const seller = { userType: "user", screens: [] };
    expect(tabFromAddress("requests")).toBe("requests");
    expect(tabFromAddress("send")).toBe("send");
    expect(tabFromAddress("nonsense")).toBe("board");
    expect(tabFromAddress(null)).toBe("board");
  });
});

describe("the status", () => {
  it("in words and a tone", () => {
    expect(requestStatusText(L, "pending")).toBe("Pending");
    expect(requestStatusText(L, "accepted")).toBe("Accepted");
    expect(requestStatusText(L, "rejected")).toBe("Rejected");
    expect([requestStatusTone("pending"), requestStatusTone("accepted"), requestStatusTone("rejected")]).toEqual(["warn", "good", "off"]);
  });
});

describe("the request type", () => {
  it("has the four types, in words, and an old request reads as a sale", () => {
    expect(REQUEST_KINDS).toEqual(["sale", "reservation", "handover", "delivery"]);
    expect(REQUEST_KINDS.map((k) => requestKindText(L, k))).toEqual(["Sale", "Reservation", "Handover", "Delivery"]);
    expect(requestKindText(L, "")).toBe("Sale");
  });
  it("the form needs one, and sends it", () => {
    const lines = [{ itemId: item, quantity: "1" }];
    expect(Object.keys(readRequestForm(L, "", lines).errors)).toEqual(["kind"]);
    expect(Object.keys(readRequestForm(L, "refund", lines).errors)).toEqual(["kind"]);
    expect(readRequestForm(L, "delivery", lines).payload).toEqual({ kind: "delivery", lines: [{ itemId: item, quantity: 1 }] });
  });
});

describe("readRequestForm", () => {
  it("items and counts make the payload, with Latin digits", () => {
    expect(readRequestForm(L, "sale", [{ itemId: item, quantity: "٢" }, { itemId: item2, quantity: "1" }])).toEqual({ errors: {}, payload: { kind: "sale", lines: [{ itemId: item, quantity: 2 }, { itemId: item2, quantity: 1 }] } });
  });
  it("every line needs an item, an item once, a count 1 to 100", () => {
    expect(Object.keys(readRequestForm(L, "sale", [blankRequestLine()]).errors)).toEqual(["line0Item"]);
    expect(Object.keys(readRequestForm(L, "sale", [{ itemId: item, quantity: "1" }, { itemId: item, quantity: "1" }]).errors)).toEqual(["line1Item"]);
    for (const quantity of ["0", "", String(REQUEST_QUANTITY_MAX + 1), "x"]) expect(Object.keys(readRequestForm(L, "sale", [{ itemId: item, quantity }]).errors), quantity).toEqual(["line0Quantity"]);
    expect(readRequestForm(L, "sale", []).errors.lines).toBeTruthy();
  });
  it("the items of a request in one line", () => {
    expect(requestLinesSummary([{ itemName: "Bar", quantity: 2 }, { itemName: "Coin", quantity: 1 }], ", ")).toBe("Bar × 2, Coin × 1");
    expect(requestLinesSummary(undefined)).toBe("");
  });
});
