import { describe, expect, it } from "vitest";
import { carriedOf, leafOfScreen, pathOf, routeForStep } from "./route";
import { JOBS, QUESTIONS } from "@/nav/jobs";

describe("job routes", () => {
  it("every step and question screen has a page", () => {
    const missing = [...JOBS.flatMap((j) => j.steps), ...QUESTIONS].filter((s) => !leafOfScreen(s.screen)).map((s) => s.screen);
    expect(missing).toEqual([]);
  });
  it("puts job, step, carried and new/open on the address", () => {
    const step = { screen: "gold-sales/sales-invoices", href: "/gold-sales/sales-invoices/new" };
    expect(routeForStep(step, { job: { id: "J-S1" }, n: 2, carried: { invoice: "A1" } })).toBe("/sales/invoices?job=J-S1&step=2&invoice=A1&new=create");
    const open = { screen: "gold-sales/sales-invoices", href: "/gold-sales/sales-invoices/:invoice" };
    expect(routeForStep(open, { carried: { invoice: "A1" } })).toBe("/sales/invoices?invoice=A1&open=A1");
  });
  it("carriedOf drops routing keys and derived aliases", () => {
    expect(carriedOf({ job: "x", step: "1", invoice: "A", from: "d", fromDate: "d" })).toEqual({ invoice: "A", from: "d" });
  });
  it("pathOf stops before a missing name", () => {
    expect(pathOf({ href: "/a/b/:id/c" }, {})).toBe("/a/b");
    expect(pathOf({ href: "/a/b/:id" }, { id: "9" })).toBe("/a/b/9");
  });
});
