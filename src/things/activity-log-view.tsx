// The activity log view (owner, 2026-11-24): the log of the system, shared by the Super admin's page "الأمان والبيانات" and the Admin's "سجل النشاط".
// GET /reports/activity-log?fromDate&toDate&userId&screen&action&page&pageSize (10|25|50|100, default 25), newest first. An Admin never gets a Super admin's rows (the backend filters them).
import type { Row, ViewConfig } from "@/lib/engine-types";
import { timeText } from "@/lib/format";
import type { Tr } from "@/lib/t";

const SCREENS: Record<string, string> = { access: "access", bank: "bank", bankAccount: "bankAccount", bank_movement: "bankMovement", bank_transfer: "bankTransfer", branch: "branch", cash_movement: "cashMovement", category: "category", expense: "expense", expenseType: "expenseType", expense_refund: "expenseRefund", gold_price_set: "goldPrices", item: "item", piece: "piece", "purchase-coding": "purchaseCoding", "purchase-invoice": "purchaseInvoice", "reprint-label": "reprintLabel", reservation: "reservation", "sales-invoice": "salesInvoice", "sales-return": "salesReturn", security_policy: "securityPolicy", settings: "settings", "stock-count": "stockCount", user: "user" };
const actionKinds = ["create", "update", "delete", "print", "reprint", "lock", "unlock", "refused", "signIn", "signInFailed", "request", "export"];
const typeOf = (r: Row) => String(r.record).split(":")[0];
const idOf = (r: Row) => String(r.record).split(":").slice(1).join(":");
const cairo = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "Africa/Cairo" }).format(new Date(iso));
const dash = "—";
const vals = (x: unknown): Row | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Row) : null);
const changedFields = (r: Row) => { const b = vals(r.before), a = vals(r.after); return [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])].filter((f) => f !== "createdAt" && f !== "updatedAt" && JSON.stringify(b?.[f]) !== JSON.stringify(a?.[f])); };
const side = (r: Row, s: "before" | "after") => { const v = vals(r[s]); if (!v) return dash; const f = changedFields(r); return f.length === 0 ? dash : f.map((k) => `${k}: ${v[k] === undefined || v[k] === null ? dash : typeof v[k] === "object" ? JSON.stringify(v[k]) : String(v[k])}`).join(" · "); };
const mono = (s: string) => <bdi dir="ltr" title={s} className="cb-mono">{s}</bdi>;

/** The one view of the log; `keys` are the screens that may open it. */
export function activityLogView(tr: Tr, keys: string[]): ViewConfig {
  const { t } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("super-control", k, v as never);
  const screenText = (type: string) => (SCREENS[type] ? m(`activityLog.screens.${SCREENS[type]}`) : type);
  const actionText = (a: string) => (actionKinds.includes(a) ? m(`activityLog.actions.${a}`) : a);
  return {
    id: "log", label: m("activityLog.title"), keys, create: [],
    endpoint: "/reports/activity-log", runLabel: t("common", "report.run"),
    paging: { param: "page", sizeParam: "pageSize", sizes: [10, 25, 50, 100], size: 25 },
    filters: [
      { name: "fromDate", label: m("activityLog.fromDate"), type: "date" },
      { name: "toDate", label: m("activityLog.toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? t("common", "report.toBeforeFrom") : null) },
      { name: "userId", label: m("activityLog.user"), type: "select", optionsFrom: { path: "/users", value: "id", label: "username" }, placeholder: t("common", "report.all") },
      { name: "action", label: m("activityLog.columns.action"), type: "select", options: actionKinds.map((a) => [a, actionText(a)]), placeholder: t("common", "report.all") },
      { name: "screen", label: m("activityLog.screen"), type: "select", options: Object.keys(SCREENS).map((k) => [k, screenText(k)]), placeholder: t("common", "report.all") },
    ],
    columns: [
      { key: "date", label: m("activityLog.columns.date"), sortable: false, render: (r) => <span dir="ltr">{cairo(r.at, { day: "2-digit", month: "2-digit", year: "numeric" })}</span> },
      { key: "time", label: m("activityLog.columns.time"), sortable: false, render: (r) => <span dir="ltr">{timeText(r.at, undefined, true)}</span> },
      { key: "user", label: m("activityLog.columns.user"), sortable: false, render: (r) => (r.userName ? <bdi dir="auto">{r.userName}</bdi> : r.userId ? mono(r.userId) : m("activityLog.system")) },
      { key: "screen", label: m("activityLog.columns.screen"), sortable: false, get: (r) => screenText(typeOf(r)) },
      { key: "action", label: m("activityLog.columns.action"), sortable: false, get: (r) => actionText(r.action) },
      { key: "record", label: m("activityLog.columns.record"), sortable: false, render: (r) => (idOf(r) ? mono(idOf(r)) : dash) },
      { key: "changed", label: m("activityLog.columns.changed"), sortable: false, render: (r) => { const f = changedFields(r); return f.length ? mono(f.join(", ")) : dash; } },
      { key: "before", label: m("activityLog.columns.before"), sortable: false, render: (r) => mono(side(r, "before")) },
      { key: "after", label: m("activityLog.columns.after"), sortable: false, render: (r) => mono(side(r, "after")) },
    ],
    onRow: false,
  };
}
