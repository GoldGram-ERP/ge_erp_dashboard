"use client";
// The filters a report ran with, as short chips ("Branch: Main branch"): shown in the bar that replaces the filter panel after "تقرير".
import type { FilterConfig, Option } from "@/lib/engine-types";
import { dateText } from "@/lib/format";
import { useLookup } from "@/components/fields/useLookup";

/** Whether a filter holds a value worth showing: an empty box, "all" and an unticked box are left out. */
export const isUsed = (v: unknown) => v !== undefined && v !== null && v !== "" && v !== false;

function Chip({ f, value }: { f: FilterConfig; value: unknown }) {
  const { options } = useLookup(f.type === "select" ? f.optionsFrom : undefined);   // a select fed by the backend names its value from the same list the box used
  let text = "";
  if (f.type === "select") { const hit = (f.options ?? options ?? []).find((o: Option) => String(o[0]) === String(value)); text = hit ? hit[1] : String(value); }
  else if (f.type === "date") text = dateText(value);
  else if (f.type !== "checkbox") text = String(value);   // a ticked box shows its label alone
  return <span className="fb-chip" data-filter={f.name}><b>{f.label}{text ? ":" : ""}</b>{text && <span>{text}</span>}</span>;
}

export function FilterSummary({ filters, values, none }: { filters: FilterConfig[]; values: Record<string, unknown>; none: string }) {
  const used = filters.filter((f) => isUsed(values[f.name]));
  if (!used.length) return <span className="fb-none">{none}</span>;
  return <>{used.map((f) => <Chip key={f.name} f={f} value={values[f.name]} />)}</>;
}
