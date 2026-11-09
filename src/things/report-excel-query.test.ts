import { describe, expect, it } from "vitest";
import { excelQuery } from "./report-excel-query";

const DAY = "2026-11-09";

describe("excelQuery: the Excel file asks for what the screen shows", () => {
  it("All (no dates) on a dated report: the widest period, so the backend takes it", () => {
    expect(excelQuery("/reports/sales-report", { branchId: "b1", fromDate: undefined, toDate: "" }, DAY)).toEqual({ branchId: "b1", fromDate: "2000-01-01", toDate: DAY });
  });
  it("one end set: only the open end is filled", () => {
    expect(excelQuery("/reports/sales-report", { fromDate: "2026-10-01" }, DAY)).toEqual({ fromDate: "2026-10-01", toDate: DAY });
    expect(excelQuery("/reports/bank-statement", { toDate: "2026-10-31" }, DAY)).toEqual({ fromDate: "2000-01-01", toDate: "2026-10-31" });
  });
  it("a from date after today: the to date is not before it", () => {
    expect(excelQuery("/reports/sales-report", { fromDate: "2026-12-01" }, DAY)).toEqual({ fromDate: "2026-12-01", toDate: "2026-12-01" });
  });
  it("a chosen period stays as it is", () => {
    const q = { fromDate: "2026-11-01", toDate: "2026-11-05", karat: "21" };
    expect(excelQuery("/reports/sales-report", q, DAY)).toEqual(q);
  });
  it("a report without dates gets none (its query refuses unknown fields)", () => {
    const q = { branchId: "b1" };
    expect(excelQuery("/reports/gold-stock", q, DAY)).toBe(q);
    expect(excelQuery("/reports/branch-stock", q, DAY)).toBe(q);
  });
});
