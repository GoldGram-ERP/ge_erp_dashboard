"use client";
import { Status } from "@/components/ui";
// قنوات البيع: hr/sales-channels (new), hr/sales-channels-list. Modelled on Banks. Writes: create, edit, delete (marks the row; refused while a live record uses it).
import type { FieldConfig, MakeConfig, ThingConfig } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { code6 } from "@/lib/code6";

export const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const c = (k: string, v?: Record<string, string>) => t("hr", `salesChannels.${k}`, v);
  const ALL = t("common", "report.all");
  const stamp = (x: unknown) => (x ? <Ltr>{String(x).slice(0, 19).replace("T", " ")}</Ltr> : "");
  const fields = (): FieldConfig[] => [
    { name: "channelName", label: c("channelName"), type: "text", required: true, maxLength: 100 },   // backend: trim, 1..100, unique (salesChannelNameTaken)
  ];
  return {
    id: "sales-channels",
    title: c("title"),
    unit: L("قناة بيع", "sales channels"),
    keys: ["hr/sales-channels", "hr/sales-channels-list"],
    views: [{
      id: "list", label: c("listTitle"), keys: ["hr/sales-channels", "hr/sales-channels-list"],
      create: [{ form: "create", label: c("add"), keys: ["hr/sales-channels"] }],
      endpoint: "/sales-channels", query: { order: "newest" },
      search: { param: "search", placeholder: c("searchPlaceholder") },
      chips: [{ id: "all", label: ALL }, { id: "deleted", label: c("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
      paging: { sizeParam: null },
      columns: [
        { key: "channelCode", label: c("channelCode"), get: (r) => code6(r.channelCode), render: (r) => <><Ltr>{code6(r.channelCode)}</Ltr>{r.deletedAt && <> <Status tone="off">{c("deletedBadge")}</Status></>}</> },
        { key: "channelName", label: c("channelName") },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
      onRow: (row, h) => h.open(row),
    }],
    record: {
      title: (r) => `${c("recordNo")} ${code6(r.channelCode)}`,
      endpoint: (r) => `/sales-channels/${r.id}`,
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{c("deletedBadge")}</div>}
          <Section title={c("details")}>
            <Kv k={c("channelCode")}><Ltr>{code6(r.channelCode)}</Ltr></Kv>
            <Kv k={c("channelName")}>{r.channelName}</Kv>
            <Kv k={L("تاريخ الإضافة", "Created")}>{stamp(r.createdAt)}</Kv>
            <Kv k={L("آخر تعديل", "Updated")}>{stamp(r.updatedAt)}</Kv>
            {r.deletedAt && <Kv k={c("deleted")}>{stamp(r.deletedAt)}</Kv>}
          </Section>
        </>
      ),
      actions: [{ id: "edit", label: L("تعديل", "Edit"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("edit", r); } }],
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => `/sales-channels/${r.id}`,
        confirm: (r) => ({ title: c("deleteTitle", { code: code6(r.channelCode) }), text: c("deleteBody") }),
      },
    },
    forms: {
      create: { title: c("new"), path: () => "/sales-channels", method: "POST", fields: fields() },
      edit: { title: (r) => c("editTitle", { code: code6(r!.channelCode) }), path: (r) => `/sales-channels/${r!.id}`, method: "PATCH", load: (r) => ({ channelName: r!.channelName }), fields: fields() },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} />; }
