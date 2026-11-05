import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Record<string, unknown>[] = [];
let refuseLimit = true;
vi.mock("@/lib/api", () => {
  class ApiFailure extends Error { constructor(public status: number, public error: { message: string }) { super(error.message); } }
  return {
    ApiFailure,
    api: async (_path: string, o: { query: Record<string, unknown> }) => {
      calls.push(o.query);
      if (refuseLimit && "limit" in o.query) throw new ApiFailure(400, { message: "invalidFields" });
      return { items: o.query.page === 1 ? [{ id: "a", name: "A" }, { id: "b", name: "B" }] : [], total: 2 };
    },
  };
});
import { loadLookup } from "./useLookup";

describe("loadLookup", () => {
  beforeEach(() => { calls.length = 0; });
  it("asks again without limit when the list refuses it (categories and items answer 400 to limit), and returns the options", async () => {
    refuseLimit = true;
    expect(await loadLookup({ path: "/categories", label: "name" })).toEqual([["a", "A"], ["b", "B"]]);
    expect(calls[0]).toMatchObject({ page: 1, limit: 20 });
    expect(calls[1]).toEqual({ page: 1 });
  });
  it("keeps sending limit to a list that accepts it", async () => {
    refuseLimit = false;
    await loadLookup({ path: "/branches", label: "name" });
    expect(calls.every((c) => c.limit === 20)).toBe(true);
  });
});
