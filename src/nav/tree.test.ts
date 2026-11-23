import { describe, expect, it } from "vitest";
import { allLeaves, leafShown } from "./tree";

// The activity log item of the Admin menu (owner, 2026-11-24): an Admin gets it, the Super admin (who has the log in "الأمان والبيانات") does not.
describe("the activity log menu item", () => {
  const leaf = allLeaves().find((l) => l.id === "activity-log")!;
  const screens = ["administration/activity-log"];

  it("sits in the Admin group, after the test printer", () => {
    expect(leaf.route).toBe("/setup/activity-log");
    expect(leaf.group.id).toBe("setup");
    const ids = leaf.group.items.map((i) => i.id);
    expect(ids.indexOf("activity-log")).toBe(ids.indexOf("test-printer") + 1);
  });
  it("is shown to an Admin, not to a Super admin, and not to someone without the screen", () => {
    expect(leafShown({ screens, userType: "admin" }, leaf)).toBe(true);
    expect(leafShown({ screens, userType: "super_admin" }, leaf)).toBe(false);
    expect(leafShown({ screens: [], userType: "user" }, leaf)).toBe(false);
  });
  it("never hides an ordinary item from a Super admin", () => {
    const desk = allLeaves().find((l) => l.id === "sales-desk")!;
    expect(leafShown({ screens: ["gold-sales/sales-desk"], userType: "super_admin" }, desk)).toBe(true);
  });
});
