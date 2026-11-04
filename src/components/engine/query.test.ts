import { describe, expect, it } from "vitest";
import { parseDeepLink, pruneParams, withParams } from "./query";

describe("thing address", () => {
  it("splits view, new, open from the filter values", () => {
    expect(parseDeepLink("?view=history&new=create&open=7&fromDate=2026-01-01&q=ab&empty=")).toEqual({ view: "history", newForm: "create", open: "7", query: { fromDate: "2026-01-01", q: "ab" } });
    expect(parseDeepLink("")).toEqual({ view: undefined, newForm: undefined, open: undefined, query: {} });
  });
  it("changes keys and can start fresh", () => {
    expect(withParams("view=a&x=1", { new: "create", x: null })).toBe("view=a&new=create");
    expect(withParams("view=a&x=1", { view: "b", fromDate: "d" }, true)).toBe("view=b&fromDate=d");
  });
  it("prunes form-only keys on close", () => {
    expect(pruneParams("new=create&reservation=5&fromDate=d&view=v&open=1", ["fromDate"])).toBe("fromDate=d&view=v");
  });
});
