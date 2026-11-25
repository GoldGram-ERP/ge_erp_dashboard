import { describe, expect, it } from "vitest";
import { ACTIONS, BUSINESS_ROLES, DESK_WIDE_ROLES, hasAction, isDeskWideRole } from "./actions";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

describe("hasAction", () => {
  it("a plain user holds only the granted keys", () => {
    expect(hasAction({ userType: "user", actions: [] }, "confirm-taslem")).toBe(false);
    expect(hasAction({ userType: "user" }, "confirm-taslem")).toBe(false);
    expect(hasAction({ userType: "user", actions: ["confirm-taslem"] }, "confirm-taslem")).toBe(true);
    expect(hasAction({ userType: "user", actions: ["confirm-taslem"] }, "use-treasuries")).toBe(false);
    expect(hasAction({ userType: "user", actions: ["confirm-taslem"] }, "nonsense")).toBe(false);
  });
  it("Admin and Super admin hold every action", () => {
    expect(hasAction({ userType: "admin", actions: [] }, "give-cash-discount")).toBe(true);
    expect(hasAction({ userType: "super_admin" }, "confirm-taslem")).toBe(true);
  });
  it("nobody while the person is unknown", () => {
    expect(hasAction(undefined, "confirm-taslem")).toBe(false);
    expect(hasAction(null, "confirm-taslem")).toBe(false);
  });
});

describe("delete-records (owner, 2026-11-24)", () => {
  it("is in the list the Users form offers a plain user, and is off until given", () => {
    expect(ACTIONS).toContain("delete-records");
    expect(hasAction({ userType: "user", actions: ["confirm-taslem"] }, "delete-records")).toBe(false);
    expect(hasAction({ userType: "user", actions: ["delete-records"] }, "delete-records")).toBe(true);
  });
  it("an Admin and a Super admin may always delete", () => {
    expect(hasAction({ userType: "admin" }, "delete-records")).toBe(true);
    expect(hasAction({ userType: "super_admin", actions: [] }, "delete-records")).toBe(true);
  });
  it("nobody while the person is unknown", () => {
    expect(hasAction(undefined, "delete-records")).toBe(false);
  });
});

// The business roles (owner, 2026-11-25): the accountant and the two new managers work on the Sales desk drafts of every user and every branch.
describe("business roles", () => {
  it("the desk-wide roles are the accountant, the call center admin and the branch sales manager", () => {
    expect([...DESK_WIDE_ROLES]).toEqual(["accountant", "call_center_admin", "branch_sales_manager"]);
    for (const role of DESK_WIDE_ROLES) {
      expect(BUSINESS_ROLES as readonly string[]).toContain(role);
      expect(isDeskWideRole(role)).toBe(true);
    }
  });
  it("no other role, and nobody without one, is desk-wide", () => {
    for (const role of ["call_center", "branch_sales", "pricing_specialist", "Accountant", "", null, undefined]) expect(isDeskWideRole(role)).toBe(false);
  });
  it("every business role has an Arabic and an English label in the user form", () => {
    for (const role of BUSINESS_ROLES) {
      expect((ar as any).administration.users.roles[role], `ar ${role}`).toBeTruthy();
      expect((en as any).administration.users.roles[role], `en ${role}`).toBeTruthy();
    }
    expect((ar as any).administration.users.roles.call_center_admin).toBe("مدير كول سنتر");
    expect((ar as any).administration.users.roles.branch_sales_manager).toBe("مدير مبيعات فرع");
    expect((en as any).administration.users.roles.call_center_admin).toBe("Contact center admin");
    expect((en as any).administration.users.roles.branch_sales_manager).toBe("Branch sales manager");
  });
});
