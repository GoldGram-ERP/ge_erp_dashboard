"use client";
// The Sales desk (issue #6, backend #168): a sales agent's numbered drafts. The list is "My drafts" (a User sees only their own, the backend enforces it; an Admin, the Super admin and an
// accountant see the drafts of every branch, with a branch column and filter), a row opens the draft on its own page, "New draft" opens an empty one, and they can also open a draft by its number.
import { useMemo } from "react";
import type { Column, FilterConfig, MakeConfig, ThingConfig } from "@/lib/engine-types";
import { piastresText } from "@/lib/format";
import { useMe } from "@/lib/session";
import { Ltr, ThingPage } from "@/components/engine";
import { Status } from "@/components/ui";
import { useAccess } from "./sales-access";
import { DraftForm, OpenByNumber } from "./sales-desk-form";
import { seesEveryBranchDrafts } from "./sales-desk-rules";

const KEYS = ["gold-sales/sales-desk"];

// `everyBranch`: the person sees the drafts of every branch (an Admin, the Super admin, an accountant; owner 2026-11-25), so the list shows each draft's branch and can be narrowed to one.
export const buildConfig = (tr: Parameters<MakeConfig>[0], everyBranch: boolean): ThingConfig => {
  const d = (k: string, v?: Record<string, string | number>) => tr.t("gold-sales", `salesDesk.${k}`, v);
  const badge = (tone: string, text: string) => <span className={`badge ${tone}`}>{text}</span>;
  const branchColumn: Column[] = everyBranch ? [{ key: "branchName", label: d("branch"), sortable: false }] : [];
  const branchFilter: FilterConfig[] = everyBranch
    ? [{ name: "branchId", label: d("branch"), type: "select", optionsFrom: { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } }, placeholder: tr.L("كل الفروع", "All branches") }]
    : [];
  return {
    id: "sales-desk",
    title: d("title"),
    unit: tr.L("مسودة", "drafts"),
    keys: KEYS,
    views: [{
      id: "list", label: d("list"), keys: KEYS, endpoint: "/sales-drafts", rowKey: "id",
      search: { placeholder: d("search") },
      chips: [
        { id: "all", label: d("all") },
        { id: "open", label: d("status.open"), query: { status: "open" } },
        { id: "completed", label: d("status.completed"), query: { status: "completed" } },
        { id: "deleted", label: d("status.deleted"), query: { deleted: "only" }, superOnly: true },
      ],
      ...(branchFilter.length ? { filters: branchFilter } : {}),
      paging: { sizeParam: null, sizes: [20], size: 20 },
      columns: [
        { key: "draftNumber", label: d("draftNumberShort"), render: (r) => <><Ltr>{r.draftNumber}</Ltr> {r.operation === "buy" && <Status tone="warn" data-operation="buy">{d("desk.buy")}</Status>}</> },
        ...branchColumn,
        { key: "customerName", label: d("customerCol") },
        { key: "customerPhone", label: d("phoneCol"), render: (r) => <Ltr>{r.customerPhone}</Ltr> },
        { key: "total", label: d("total"), render: (r) => <Ltr>{piastresText(r.totals?.total ?? 0)}</Ltr>, className: "num" },
        { key: "status", label: d("statusLabel"), sortable: false,
          render: (r) => (r.status === "deleted" ? badge("off", d("status.deleted")) : r.status === "completed" ? badge("good", d("status.completed"))
            : r.locked ? badge("warn", d("lock.locked")) : badge("info", d("status.open"))) },
        { key: "createdDay", label: d("day"), type: "date" },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
      onRow: (r, h) => h.openForm("draft", r),
    }],
    create: [
      { form: "draft", label: d("newDraft"), keys: KEYS },
      { form: "open", label: d("openByNumber"), keys: KEYS },
    ],
    forms: {
      draft: { byId: true, title: (r) => (r ? d("draftNumber", { number: r.draftNumber }) : d("newDraft")), display: "page", fields: [], path: () => "/sales-drafts", custom: DraftForm },
      open: { title: d("openByNumber"), display: "page", fields: [], path: () => "/sales-drafts", custom: OpenByNumber },
    },
  };
};

export default function Page() {
  const { data: me } = useMe();
  const everyBranch = seesEveryBranchDrafts(me);
  const make = useMemo<MakeConfig>(() => (tr) => buildConfig(tr, everyBranch), [everyBranch]);
  return <ThingPage make={make} access={useAccess()} />;
}
