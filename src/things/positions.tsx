"use client";
import { Status } from "@/components/ui";
// المسميات الوظيفية: hr/positions (new), hr/positions-list. Modelled on Banks; the form adds the tick list of live sales channels.
// Writes: POST/PATCH /positions {positionName}, then PUT /positions/{id}/sales-channels {salesChannelIds}. Delete marks the row; refused while a user holds it (positionInUse).
import type { MakeConfig, ThingConfig } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { ChannelNames, PositionForm } from "@/components/hr/position-form";
import { code6 } from "@/lib/code6";

export const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const p = (k: string, v?: Record<string, string>) => t("hr", `positions.${k}`, v);
  const stamp = (x: unknown) => (x ? <Ltr>{String(x).slice(0, 19).replace("T", " ")}</Ltr> : "");
  return {
    id: "positions",
    title: p("title"),
    unit: L("مسمى وظيفي", "positions"),
    keys: ["hr/positions", "hr/positions-list"],
    views: [{
      id: "list", label: p("listTitle"), keys: ["hr/positions", "hr/positions-list"],
      create: [{ form: "create", label: p("add"), keys: ["hr/positions"] }],
      endpoint: "/positions", query: { order: "newest" },
      search: { param: "search", placeholder: p("searchPlaceholder") },
      chips: [{ id: "all", label: t("common", "report.all") }, { id: "deleted", label: p("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
      paging: { sizeParam: null },
      columns: [
        { key: "positionCode", label: p("positionCode"), get: (r) => code6(r.positionCode), render: (r) => <><Ltr>{code6(r.positionCode)}</Ltr>{r.deletedAt && <> <Status tone="off">{p("deletedBadge")}</Status></>}</> },
        { key: "positionName", label: p("positionName") },
        { key: "salesChannelIds", label: p("channels"), sortable: false, render: (r) => <ChannelNames ids={r.salesChannelIds ?? []} none="—" /> },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
      onRow: (row, h) => h.open(row),
    }],
    record: {
      title: (r) => `${p("recordNo")} ${code6(r.positionCode)}`,
      endpoint: (r) => `/positions/${r.id}`,
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{p("deletedBadge")}</div>}
          <Section title={p("details")}>
            <Kv k={p("positionCode")}><Ltr>{code6(r.positionCode)}</Ltr></Kv>
            <Kv k={p("positionName")}>{r.positionName}</Kv>
            <Kv k={p("channels")}><ChannelNames ids={r.salesChannelIds ?? []} none={p("noChannelsGiven")} /></Kv>
            <Kv k={L("تاريخ الإضافة", "Created")}>{stamp(r.createdAt)}</Kv>
            <Kv k={L("آخر تعديل", "Updated")}>{stamp(r.updatedAt)}</Kv>
            {r.deletedAt && <Kv k={p("deleted")}>{stamp(r.deletedAt)}</Kv>}
          </Section>
        </>
      ),
      actions: [{ id: "edit", label: L("تعديل", "Edit"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("edit", r); } }],
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => `/positions/${r.id}`,
        confirm: (r) => ({ title: p("deleteTitle", { code: code6(r.positionCode) }), text: p("deleteBody") }),
      },
    },
    forms: {
      create: { display: "page", title: p("new"), fields: [], path: () => "/positions", custom: PositionForm },
      edit: { display: "page", title: (r) => p("editTitle", { code: code6(r!.positionCode) }), fields: [], path: (r) => `/positions/${r!.id}`, custom: PositionForm },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} />; }
