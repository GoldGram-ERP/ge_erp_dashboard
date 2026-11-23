import { describe, expect, it } from "vitest";
import { screensOnTypeChange } from "./user-screens";

describe("the screens sent when a person becomes an Admin", () => {
  it("clears the leftover screens of a plain user who becomes an Admin (every screen again)", () => {
    expect(screensOnTypeChange("user", "admin")).toEqual([]);
  });
  it("sends nothing when an Admin is edited as an Admin: a desk-only Admin stays desk-only", () => {
    expect(screensOnTypeChange("admin", "admin")).toBeUndefined();
  });
  it("sends nothing for a new account, for a plain user who stays one, or for a Super admin", () => {
    expect(screensOnTypeChange(undefined, "admin")).toBeUndefined();
    expect(screensOnTypeChange("user", "user")).toBeUndefined();
    expect(screensOnTypeChange("user", "super_admin")).toBeUndefined();
    expect(screensOnTypeChange("super_admin", "admin")).toBeUndefined();
  });
});
