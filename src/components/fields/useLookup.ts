"use client";
// A list a select picks from, read from the backend once and kept (TanStack Query). Pages whole lists in 20s unless `paged: false`.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LookupSpec, Option } from "@/lib/engine-types";
import { LOOKUPS, rowsOf } from "@/lib/fields";

export async function loadLookup(spec: LookupSpec): Promise<Option[]> {
  const rows: Record<string, any>[] = [];
  if (spec.paged === false) rows.push(...rowsOf(await api(spec.path, { query: spec.query ?? {} }), spec.rowsPath));   // refuses page/limit (e.g. /treasuries)
  else {
    for (let page = 1; page <= 100; page++) {
      const r = await api(spec.path, { query: { ...(spec.query ?? {}), page, ...(spec.pageOnly ? {} : { limit: 20 }) } });
      const got = rowsOf(r, spec.rowsPath);
      rows.push(...got);
      if (got.length === 0 || (typeof r?.total === "number" ? rows.length >= r.total : got.length < 20)) break;
    }
  }
  return rows.map((row) => [row[spec.value ?? "id"], typeof spec.label === "function" ? spec.label(row) : String(row[spec.label ?? "name"])] as Option);
}

export function useLookup(from?: string | LookupSpec) {
  const spec = typeof from === "string" ? LOOKUPS[from] : from;
  const q = useQuery({
    enabled: !!spec,
    queryKey: ["lookup", spec?.path, spec?.query, spec?.paged, typeof spec?.label === "string" ? spec.label : "fn", spec?.value],
    queryFn: () => loadLookup(spec!),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: spec?.path === "/bank-accounts" || spec?.path === "/banks" ? "always" : true,
  });
  return { options: q.data, failed: q.isError };
}
