import { describe, expect, it } from "vitest";
import { ACTIONS, hasAction } from "./actions";

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
