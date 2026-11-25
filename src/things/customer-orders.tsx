"use client";
// Customer orders (owner, 2026-11-25, backend #226): a customer phones and says they are coming to buy. A person records it (the customer, what they will buy or an
// undefined item), adds notes as the talk goes on (a history: each note keeps who wrote it and when), and marks whether the customer came.
// The list is "my orders" for a plain user (the backend enforces it); an Admin, the Super admin and the accountant, the call center admin and the branch sales manager see every order
// of every branch, with a branch column and filter. Tabs: all / came / did not come (the ones still waiting are in "did not come"). The status buttons are on the record.
import { useMemo } from "react";
import type { Column, FilterConfig, MakeConfig, RecordAction, Row, ThingConfig } from "@/lib/engine-types";
import { api, newSaveKey } from "@/lib/api";
import { code6 } from "@/lib/code6";
import { dateTimeText } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { Kv, Ltr, Section, ThingPage } from "@/components/engine";
import { Status } from "@/components/ui";
import CustomerOrderForm from "./customer-orders-form";
import { ORDER_NOTE_MAX, linesSummary, seesEveryOrder, statusText, statusTone, type OrderStatus } from "./customer-orders-rules";
import { useAccess } from "./sales-access";

const screenKeys = ["gold-sales/customer-orders"];

// `everyOrder`: the person sees every order of every branch, so the list shows each order's branch and can be narrowed to one.
export const buildConfig = (tr: Tr, everyOrder: boolean): ThingConfig => {
  const { L } = tr;
  const undefinedLabel = L("غير محدد", "Undefined");
  const badge = (r: Row) => <Status tone={statusTone(String(r.status))}>{statusText(L, String(r.status))}</Status>;
  const branchColumn: Column[] = everyOrder ? [{ key: "branchName", label: L("الفرع", "Branch"), sortable: false }] : [];
  const branchFilter: FilterConfig[] = everyOrder
    ? [{ name: "branchId", label: L("الفرع", "Branch"), type: "select", optionsFrom: { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } }, placeholder: L("كل الفروع", "All branches") }]
    : [];

  // The status buttons: every status the order is not in now. Marking is for whoever sees the order (the backend's scope).
  const markAs = (target: OrderStatus, label: string, icon: string): RecordAction => ({
    id: `status-${target}`, icon, label,
    when: (r) => !r.deletedAt && r.status !== target,
    run: async (r, h) => {
      await api(`/customer-orders/${r.id}/status`, { method: "PUT", body: { status: target }, saveKey: newSaveKey() });
      h.toast(L("تم تحديث الحالة.", "Status updated."));
      h.reload(); h.close();
    },
  });

  return {
    id: "customer-orders",
    title: L("طلبات العملاء", "Customer orders"),
    unit: L("طلب", "orders"),
    keys: screenKeys,
    views: [{
      id: "list", label: L("الطلبات", "Orders"), keys: screenKeys, endpoint: "/customer-orders", rowKey: "id",
      search: { placeholder: L("ابحث برقم الطلب أو اسم العميل أو الهاتف", "Search by order number, customer name or phone") },
      chips: [
        { id: "all", label: L("الكل", "All") },
        { id: "present", label: L("حاضر", "Came"), query: { attendance: "present" } },
        { id: "absent", label: L("غير حاضر", "Did not come"), query: { attendance: "absent" } },
        { id: "deleted", label: L("المحذوفة", "Deleted"), query: { deleted: "only" } },
      ],
      filters: [
        { name: "fromDate", label: L("من تاريخ", "From date"), type: "date" },
        { name: "toDate", label: L("إلى تاريخ", "To date"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? L("«إلى» قبل «من».", "“To” is before “From”.") : null) },
        ...branchFilter,
      ],
      paging: { sizeParam: null, sizes: [20], size: 20 },
      columns: [
        { key: "orderNumber", label: L("رقم الطلب", "Order no."), render: (r) => <Ltr>{code6(r.orderNumber)}</Ltr> },
        { key: "date", label: L("التاريخ", "Date"), type: "date" },
        ...branchColumn,
        { key: "customerName", label: L("العميل", "Customer") },
        { key: "customerPhone", label: L("الهاتف", "Phone"), render: (r) => <Ltr>{r.customerPhone}</Ltr> },
        { key: "sellerName", label: L("المسجّل", "Recorded by") },
        { key: "lines", label: L("الأصناف", "Items"), sortable: false, render: (r) => linesSummary(r.lines, undefinedLabel) },
        { key: "status", label: L("الحالة", "Status"), sortable: false, render: badge },
        { key: "notesCount", label: L("الملاحظات", "Notes"), type: "int" },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    }],
    create: [{ form: "create", label: L("طلب جديد", "New order"), keys: screenKeys }],
    record: {
      title: (r) => `${L("طلب عميل", "Customer order")} ${code6(r.orderNumber)}`,
      endpoint: (r) => `/customer-orders/${r.id}`,
      render: (full) => {
        const notes: Row[] = Array.isArray(full.notes) ? full.notes : [];
        const lines: Row[] = Array.isArray(full.lines) ? full.lines : [];
        return (
          <>
            <Section title={L("التفاصيل", "Details")}>
              <Kv k={L("رقم الطلب", "Order no.")}><Ltr>{code6(full.orderNumber)}</Ltr></Kv>
              <Kv k={L("الفرع", "Branch")}>{full.branchName}</Kv>
              <Kv k={L("التاريخ", "Date")}><Ltr>{String(full.date ?? "").slice(0, 10)}</Ltr></Kv>
              <Kv k={L("العميل", "Customer")}>{full.customerName}</Kv>
              <Kv k={L("الهاتف", "Phone")}><Ltr>{full.customerPhone}</Ltr></Kv>
              <Kv k={L("المسجّل", "Recorded by")}>{full.sellerName}</Kv>
              <Kv k={L("الحالة", "Status")}>{badge(full)}{full.statusByName ? <small className="co-by"> {full.statusByName} · <Ltr>{dateTimeText(full.statusAt)}</Ltr></small> : null}</Kv>
            </Section>
            <Section title={L("اللي ناوي يشتريه", "What they will buy")}>
              <ul className="co-items">
                {lines.map((l, i) => <li key={i}><b>{l.itemId ? l.itemName : undefinedLabel}</b><span dir="ltr"> × {l.quantity}</span></li>)}
              </ul>
            </Section>
            <Section title={`${L("الملاحظات", "Notes")} (${notes.length})`}>
              {notes.length === 0
                ? <p className="quiet-note">{L("لا توجد ملاحظات بعد. اضغط «إضافة ملاحظة».", "No notes yet. Press “Add a note”.")}</p>
                : (
                  <ol className="co-notes">
                    {[...notes].reverse().map((n) => (
                      <li key={n.id}><div className="co-note-head"><b>{n.authorName}</b><small dir="ltr">{dateTimeText(n.createdAt)}</small></div><p>{n.note}</p></li>
                    ))}
                  </ol>
                )}
            </Section>
          </>
        );
      },
      actions: [
        markAs("present", L("حضر", "Came"), "check"),
        markAs("not_present", L("لم يحضر", "Did not come"), "x"),
        markAs("pending", L("إرجاع لقيد الانتظار", "Back to waiting"), "refresh"),
        { id: "note", icon: "plus", label: L("إضافة ملاحظة", "Add a note"), when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("note", r); } },
      ],
      edit: "edit",
      // Delete marks the order (who and when); the button shows only to someone who may delete (the action delete-records, an Admin and the Super admin always).
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => `/customer-orders/${r.id}`,
        confirm: (r) => ({ title: L(`حذف الطلب ${code6(r.orderNumber)}؟`, `Delete order ${code6(r.orderNumber)}?`), text: L("يتعلّم الطلب محذوفًا ويُسجَّل من حذفه ومتى، ويبقى ظاهرًا للقراءة فقط في المحذوفة.", "The order is marked deleted (who and when); it stays visible, read only, under Deleted.") }),
      },
    },
    forms: {
      create: { title: L("طلب عميل جديد", "New customer order"), display: "page", fields: [], path: () => "/customer-orders", custom: CustomerOrderForm },
      edit: { title: L("تعديل طلب عميل", "Edit customer order"), display: "page", fields: [], path: (r) => `/customer-orders/${r?.id}`, method: "PUT", custom: CustomerOrderForm },
      // One more note in the history; the order opens again with it.
      note: {
        title: L("إضافة ملاحظة", "Add a note"), display: "sheet",
        fields: [{ name: "note", label: L("الملاحظة", "Note"), type: "textarea", required: true, maxLength: ORDER_NOTE_MAX, wide: true }],
        path: (r) => `/customer-orders/${r?.id}/notes`, method: "POST",
        toPayload: (v) => ({ note: String(v.note ?? "").trim() }),
        afterSave: (answer, h) => { h.toast(L("تمت إضافة الملاحظة.", "Note added.")); h.open(answer); },
      },
    },
  };
};

export default function Page() {
  const { data: me } = useMe();
  const everyOrder = seesEveryOrder(me);
  const make = useMemo<MakeConfig>(() => (tr) => buildConfig(tr, everyOrder), [everyOrder]);
  return <ThingPage make={make} access={useAccess()} />;
}
