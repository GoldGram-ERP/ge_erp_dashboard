import { describe, expect, it } from "vitest";
import { withMovedRoutes } from "@/stores/ui";
import { allLeaves, leafShown } from "./tree";

// Delivery charges moved to the Admin menu (owner, 2026-11-26): its tick box on the Users form follows the menu group, and a plain user can still be given it.
describe("the delivery charges menu item", () => {
  const leaf = allLeaves().find((l) => l.id === "delivery-charges")!;
  it("sits in the Admin group, shown to a plain user who has the screen", () => {
    expect([leaf.route, leaf.group.id]).toEqual(["/setup/delivery-charges", "setup"]);
    expect(leaf.screens).toEqual(["gold-sales/delivery-charges"]);
    expect(leafShown({ screens: ["gold-sales/delivery-charges"], userType: "user" }, leaf)).toBe(true);
  });
  it("keeps what a browser saved under the old address", () => {
    const saved = { lastRoute: "/sales/delivery-charges", pins: { u: ["/sales/desk", "/sales/delivery-charges"] }, recents: { u: [{ id: "/sales/delivery-charges", at: 1 }] }, textStep: 2 };
    expect(withMovedRoutes(saved)).toEqual({ lastRoute: "/setup/delivery-charges", pins: { u: ["/sales/desk", "/setup/delivery-charges"] }, recents: { u: [{ id: "/setup/delivery-charges", at: 1 }] }, textStep: 2 });
  });
});

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
