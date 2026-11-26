import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ViewConfig } from "@/lib/engine-types";
import { buildQuery, initialViewState } from "@/lib/fields";
import type { Tr } from "@/lib/t";
import { kindFilters } from "./sales-invoices-filters";

const tr = { locale: "ar", isAr: true, t: (_ns: string, key: string) => key, L: (ar: string) => ar, errorText: () => "" } as unknown as Tr;

describe("the invoice type and delivery status filters", () => {
  it("offer بيع, تسليم, حجز and توصيل, each once", () => {
    const [kind] = kindFilters(tr);
    expect(kind.options!.map(([value]) => value)).toEqual(["sale", "taslem", "reservation", "shipping"]);
    expect(kind.options!.slice(1).map(([, label]) => label)).toEqual(["تسليم", "حجز", "توصيل"]);
  });

  it("show the delivery status for تسليم, توصيل and حجز only", () => {
    const [, delivered] = kindFilters(tr);
    for (const kind of ["taslem", "shipping", "reservation"]) expect(delivered.when!({ kind }), kind).toBe(true);
    for (const kind of ["sale", ""]) expect(delivered.when!({ kind }), kind).toBe(false);
  });

  it("are on the invoice list and the sales report", () => {
    const page = readFileSync(join(__dirname, "sales-invoices.tsx"), "utf8");
    expect(page.match(/\.\.\.kindFilters\(tr\)/g)).toHaveLength(2);
    expect(page).not.toContain('name: "invoiceType", label');
  });

  it("send the status only while it is on screen", () => {
    const view: ViewConfig = { id: "list", label: "list", columns: [], filters: kindFilters(tr) };
    const queryOf = (kind: string, delivered: string) => {
      const state = initialViewState(view);
      return buildQuery(view, { ...state, filters: { ...state.filters, kind, delivered } });
    };
    expect(queryOf("taslem", "false")).toMatchObject({ kind: "taslem", delivered: "false" });
    expect(queryOf("sale", "true")).toMatchObject({ kind: "sale" });
    expect(queryOf("sale", "true")).not.toHaveProperty("delivered");
    expect(queryOf("", "true")).not.toHaveProperty("delivered");
    expect(queryOf("shipping", "")).not.toHaveProperty("delivered");
  });
});
