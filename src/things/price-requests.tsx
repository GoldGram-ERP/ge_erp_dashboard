"use client";
// The "Requests" tab of the price board (owner, 2026-11-25, backend #228): the requests and their status. A plain user sees the ones they sent, read only; an Admin,
// the Super admin and the accountant see every request of every branch and accept or reject the pending ones (with an optional note). Notes are a history on each
// request. The list reloads by itself when a request is sent or decided (the live refresh topic "price-requests").
import { useMemo } from "react";
import type { Column, FilterConfig, MakeConfig, RecordAction, Row, ThingConfig } from "@/lib/engine-types";
import { code6 } from "@/lib/code6";
import { dateTimeText } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { Kv, Ltr, Section, ThingPage } from "@/components/engine";
import { Status } from "@/components/ui";
import { REQUEST_KINDS, REQUEST_NOTE_MAX, isRequestDecider, requestKindText, requestLinesSummary, requestStatusText, requestStatusTone } from "./price-requests-rules";
import { useAccess } from "./sales-access";

const screenKeys = ["gold-sales/price-board"];

export const buildRequestsConfig = (tr: Tr, decider: boolean): ThingConfig => {
  const { L } = tr;
  const badge = (r: Row) => <Status tone={requestStatusTone(String(r.status))}>{requestStatusText(L, String(r.status))}</Status>;
  const branchColumn: Column[] = decider ? [{ key: "branchName", label: L("الفرع", "Branch"), sortable: false }] : [];
  const branchFilter: FilterConfig[] = decider
    ? [{ name: "branchId", label: L("الفرع", "Branch"), type: "select", optionsFrom: { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } }, placeholder: L("كل الفروع", "All branches") }]
    : [];
  const decideAction = (status: "accepted" | "rejected"): RecordAction => ({
    id: status === "accepted" ? "accept" : "reject", icon: status === "accepted" ? "check" : "x",
    label: status === "accepted" ? L("قبول", "Accept") : L("رفض", "Reject"), danger: status === "rejected",
    when: (r) => Boolean(r.canDecide),
    run: (r, h) => { h.close(); h.openForm(status === "accepted" ? "accept" : "reject", r); },
  });
  const decideForm = (status: "accepted" | "rejected") => ({
    title: status === "accepted" ? L("قبول الطلب", "Accept the request") : L("رفض الطلب", "Reject the request"), display: "sheet" as const,
    fields: [{ name: "note", label: L("ملاحظة القرار (اختياري)", "Decision note (optional)"), type: "textarea" as const, maxLength: REQUEST_NOTE_MAX, wide: true }],
    path: (r: Row | null) => `/price-requests/${r?.id}/decision`, method: "PUT",
    toPayload: (v: Row) => ({ status, ...(String(v.note ?? "").trim() ? { note: String(v.note).trim() } : {}) }),
    afterSave: (answer: Row, h: { toast: (m: string) => void; open: (r: Row) => void }) => { h.toast(status === "accepted" ? L("تم قبول الطلب.", "Request accepted.") : L("تم رفض الطلب.", "Request rejected.")); h.open(answer); },
  });

  return {
    id: "price-requests",
    title: L("الطلبات", "Requests"),
    unit: L("طلب", "requests"),
    keys: screenKeys,
    views: [{
      id: "list", label: L("الطلبات", "Requests"), keys: screenKeys, endpoint: "/price-requests", rowKey: "id",
      search: { placeholder: L("ابحث برقم الطلب أو اسم المرسل", "Search by request number or sender name") },
      chips: [
        { id: "all", label: L("الكل", "All") },
        { id: "pending", label: L("قيد الانتظار", "Pending"), query: { status: "pending" } },
        { id: "accepted", label: L("مقبولة", "Accepted"), query: { status: "accepted" } },
        { id: "rejected", label: L("مرفوضة", "Rejected"), query: { status: "rejected" } },
      ],
      filters: [
        { name: "kind", label: L("نوع الطلب", "Request type"), type: "select", options: REQUEST_KINDS.map((k) => [k, requestKindText(L, k)]), placeholder: L("كل الأنواع", "All types") },
        { name: "fromDate", label: L("من تاريخ", "From date"), type: "date" },
        { name: "toDate", label: L("إلى تاريخ", "To date"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? L("«إلى» قبل «من».", "“To” is before “From”.") : null) },
        ...branchFilter,
      ],
      paging: { sizeParam: null, sizes: [20], size: 20 },
      columns: [
        { key: "requestNumber", label: L("رقم الطلب", "Request no."), render: (r) => <Ltr>{code6(r.requestNumber)}</Ltr> },
        { key: "createdAt", label: L("الوقت", "Time"), type: "datetime" },
        { key: "kind", label: L("النوع", "Type"), sortable: false, render: (r) => requestKindText(L, String(r.kind ?? "")) },
        ...branchColumn,
        { key: "requesterName", label: L("المرسل", "Sent by") },
        { key: "lines", label: L("الأصناف", "Items"), sortable: false, render: (r) => requestLinesSummary(r.lines) },
        { key: "status", label: L("الحالة", "Status"), sortable: false, render: badge },
        { key: "notesCount", label: L("الملاحظات", "Notes"), type: "int" },
      ],
    }],
    record: {
      title: (r) => `${L("طلب", "Request")} ${code6(r.requestNumber)}`,
      endpoint: (r) => `/price-requests/${r.id}`,
      render: (full) => {
        const notes: Row[] = Array.isArray(full.notes) ? full.notes : [];
        const lines: Row[] = Array.isArray(full.lines) ? full.lines : [];
        return (
          <>
            <Section title={L("التفاصيل", "Details")}>
              <Kv k={L("رقم الطلب", "Request no.")}><Ltr>{code6(full.requestNumber)}</Ltr></Kv>
              <Kv k={L("نوع الطلب", "Request type")}>{requestKindText(L, String(full.kind ?? ""))}</Kv>
              <Kv k={L("الفرع", "Branch")}>{full.branchName}</Kv>
              <Kv k={L("المرسل", "Sent by")}>{full.requesterName}</Kv>
              <Kv k={L("الوقت", "Time")}><Ltr>{dateTimeText(full.createdAt)}</Ltr></Kv>
              <Kv k={L("الحالة", "Status")}>{badge(full)}</Kv>
              {full.decidedByName ? <Kv k={L("القرار", "Decision")}>{full.decidedByName} · <Ltr>{dateTimeText(full.decidedAt)}</Ltr></Kv> : null}
              {full.decisionNote ? <Kv k={L("ملاحظة القرار", "Decision note")}>{full.decisionNote}</Kv> : null}
            </Section>
            <Section title={L("الأصناف", "Items")}>
              <ul className="co-items">{lines.map((l, i) => <li key={i}><b>{l.itemName}</b><span dir="ltr"> × {l.quantity}</span></li>)}</ul>
            </Section>
            <Section title={`${L("الملاحظات", "Notes")} (${notes.length})`}>
              {notes.length === 0
                ? <p className="quiet-note">{L("لا توجد ملاحظات.", "No notes.")}</p>
                : <ol className="co-notes">{[...notes].reverse().map((n) => <li key={n.id}><div className="co-note-head"><b>{n.authorName}</b><small dir="ltr">{dateTimeText(n.createdAt)}</small></div><p>{n.note}</p></li>)}</ol>}
            </Section>
          </>
        );
      },
      actions: [
        decideAction("accepted"),
        decideAction("rejected"),
        { id: "note", icon: "plus", label: L("إضافة ملاحظة", "Add a note"), when: (r) => Boolean(r.canAddNote), run: (r, h) => { h.close(); h.openForm("note", r); } },
      ],
    },
    forms: {
      accept: decideForm("accepted"),
      reject: decideForm("rejected"),
      note: {
        title: L("إضافة ملاحظة", "Add a note"), display: "sheet",
        fields: [{ name: "note", label: L("الملاحظة", "Note"), type: "textarea", required: true, maxLength: REQUEST_NOTE_MAX, wide: true }],
        path: (r) => `/price-requests/${r?.id}/notes`, method: "POST",
        toPayload: (v) => ({ note: String(v.note ?? "").trim() }),
        afterSave: (answer, h) => { h.toast(L("تمت إضافة الملاحظة.", "Note added.")); h.open(answer); },
      },
    },
  };
};

export default function PriceRequestsTab() {
  const { data: me } = useMe();
  const decider = isRequestDecider(me);
  const make = useMemo<MakeConfig>(() => (tr) => buildRequestsConfig(tr, decider), [decider]);
  return <ThingPage make={make} access={useAccess()} />;
}
