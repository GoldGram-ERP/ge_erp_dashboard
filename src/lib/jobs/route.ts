// Job step / question -> this app's address (port of docs/nav-preview/app/jobs/route.js).
// A step names a screen key + an old-style href (/gold-sales/sales-invoices/new, /x/y/:invoice?from=..). A nav leaf owns screen keys, so the
// address is the leaf's route plus a query: job, step, carried values, `new=create` (a /new href) or `open=<id>` (a :name part), filters.
import { allLeaves } from "@/nav/tree";
import { today, monthStart } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const RESERVED = new Set(["job", "step", "new", "open", "q", "chip", "view"]);
const ALIAS: Record<string, string[]> = { from: ["fromDate"], to: ["toDate"], branch: ["branchId"], fromDate: ["from"], toDate: ["to"], branchId: ["branch"] };
const DERIVED = new Set(["fromDate", "toDate", "branchId"]);

export const leafOfScreen = (screen: string) => allLeaves().find((l) => l.screens.includes(screen));

// What a job carries from step to step: every address value but the routing ones.
export function carriedOf(query: URLSearchParams | Record<string, string>): Record<string, string> {
  const q = query instanceof URLSearchParams ? Object.fromEntries(query) : query;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (RESERVED.has(k) || (DERIVED.has(k) && ALIAS[k].some((a) => a in q))) continue;
    out[k] = v;
  }
  return out;
}

export const stepNames = (href: string) => [...href.matchAll(/:(\w+)/g)].map((m) => m[1]);

// -> "/sales/invoices?job=..&step=.." (without the locale), or null when no page owns that screen.
export function routeForStep(step: any, o: { job?: any; n?: number; carried?: Record<string, string>; extra?: Record<string, string> } = {}): string | null {
  const leaf = leafOfScreen(step.screen);
  if (!leaf) return null;
  const { job, n, carried = {}, extra = {} } = o;
  const [template, qs = ""] = String(step.href).split("?");
  const parts = template.split("/").filter(Boolean).slice(2);
  const q: Record<string, string> = {};
  if (job) { q.job = job.id; q.step = String(n); }
  for (const [k, v] of new URLSearchParams(qs)) q[k] = v;
  for (const [k, v] of Object.entries(extra)) q[k] = v;
  for (const [k, v] of Object.entries(carried)) {
    if (RESERVED.has(k)) continue;
    q[k] = v;
    for (const a of ALIAS[k] ?? []) if (!(a in carried) && !(a in q)) q[a] = v;
  }
  let isNew = false;
  for (const part of parts) {
    if (part === "new" || part === ":copyOf") isNew = true;
    else if (part.startsWith(":") && carried[part.slice(1)]) q.open = carried[part.slice(1)];
  }
  if (isNew) q.new = "create";
  const s = new URLSearchParams(q).toString();
  return `${leaf.route}${s ? `?${s}` : ""}`;
}

// A question opens its report with the period filled in (Cairo time): today = from and to today; month = the 1st to today.
export function periodExtra(question: any): Record<string, string> {
  if (!question.period) return {};
  const d = today();
  return { from: question.period === "today" ? d : monthStart(), to: d };
}
export const routeForQuestion = (question: any) => routeForStep(question, { extra: periodExtra(question) });

// The address of a step with `:name` filled from the carried values; it stops before a name nobody carried.
export function pathOf(step: any, carried: Record<string, string>): string {
  const template = String(step.href).split("?")[0];
  const missing = [...template.matchAll(/\/:(\w+)/g)].find((m) => !carried[m[1]]);
  return (missing ? template.slice(0, missing.index) : template).replace(/:(\w+)/g, (_, name) => encodeURIComponent(carried[name]));
}
