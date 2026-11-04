"use client";
// The job bar's address contract for a page: `new=create` starts the create form, `open=<id>` opens that record, other values are carried filters.
// The engine has no hook for either, so this presses the page's own first create button / the row with that id once it is on screen
// (shortcut: an `open` id not on the first loaded page is not found; upgrade when the engine takes initial.open / initial.new).
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { RESERVED } from "@/lib/jobs/route";

export function useJobIntent(): { view?: string; query: Record<string, string> } {
  const sp = useSearchParams();
  const isNew = sp.get("new") === "create", open = sp.get("open");
  useEffect(() => {
    if (!isNew && !open) return;
    let tries = 0;
    const timer = setInterval(() => {
      const el = isNew ? document.querySelector<HTMLElement>(".thing-root .head .actions button.primary") : document.querySelector<HTMLElement>(`tr.row[data-k="${CSS.escape(open!)}"]`);
      if (el || ++tries > 40) { clearInterval(timer); el?.click(); }
    }, 250);
    return () => clearInterval(timer);
  }, [isNew, open]);
  const key = sp.toString();
  return useMemo(() => {
    const q: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(key)) if (!RESERVED.has(k) || k === "q" || k === "chip") q[k] = v;
    return { view: new URLSearchParams(key).get("view") ?? undefined, query: q };
  }, [key]);
}
