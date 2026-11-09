import type { Query } from "@/lib/engine-types";

// Reports whose Excel the backend refuses without both dates (ExcelExport { dates: true }), though their screen runs with an open end ("All").
const DATED_EXCEL = new Set(["bank-statement", "safe-statement", "expenses-by-type", "expenses-report", "bullion-report", "cancelled-reservations", "reserved-pieces", "sales-by-period", "sales-report", "unpaid-invoices", "missing-pieces", "sales-by-item", "activity-log"]);
const FIRST_DAY = "2000-01-01";   // before any record: the same as no from date (a statement's balance before is 0 either way)

/** The Excel query of what the screen shows: a dated report's open end gets the widest bound on that side (`day` is today). */
export function excelQuery(path: string, query: Query, day: string): Query {
  if (!DATED_EXCEL.has(path.replace(/^\/reports\//, ""))) return query;
  const fromDate = query.fromDate || FIRST_DAY;
  return { ...query, fromDate, toDate: query.toDate || (String(fromDate) > day ? fromDate : day) };
}
