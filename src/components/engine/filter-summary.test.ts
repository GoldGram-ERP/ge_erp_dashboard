import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FilterConfig } from "@/lib/engine-types";
import { FilterSummary, isUsed } from "./FilterSummary";

// The bar that replaces a report's filter panel after "تقرير" names only the filters that hold a value.
describe("filter summary", () => {
  it("a value is shown unless it is empty: empty text, null, undefined and an unticked box are left out", () => {
    for (const v of ["", null, undefined, false]) expect(isUsed(v)).toBe(false);
    for (const v of ["2026-11-01", 0, "0", true, "x"]) expect(isUsed(v)).toBe(true);   // 0 is a real value
  });

  it("with no value in any filter the bar says so", () => {
    const filters: FilterConfig[] = [
      { name: "fromDate", label: "From", type: "date" },
      { name: "branchId", label: "Branch", type: "select" },
      { name: "deleted", label: "Deleted only", type: "checkbox" },
    ];
    const html = renderToStaticMarkup(createElement(FilterSummary, { filters, values: { fromDate: "", branchId: undefined, deleted: false }, none: "No filters" }));
    expect(html).toContain("No filters");
    expect(html).not.toContain("fb-chip");
  });
});
