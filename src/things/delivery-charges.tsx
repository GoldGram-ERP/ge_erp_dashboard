"use client";
// أسعار التوصيل: sales/delivery-charges (owner, 2026-11-26). The price of a delivery to each governorate: picked from Egypt's list, each once.
// GET /delivery-charges (all of them, or deleted=only), POST {governorate, pricePiastres}, PATCH /:id {pricePiastres}, delete = soft delete.
import type { FieldConfig, MakeConfig, ThingConfig } from "@/lib/engine-types";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { piastresText } from "@/lib/format";
import { GOVERNORATES, governorateName } from "@/lib/governorates";
import { useAccess } from "./sales-access";

const screenKeys = ["gold-sales/delivery-charges"];

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { L, isAr } = tr;
  const name = (code: string) => governorateName(code, isAr);
  const deleted = <span className="st off"><i />{L("محذوف", "Deleted")}</span>;
  // The governorate of a saved row never changes: on the edit form it is shown, not sent.
  const fields = (editing: boolean): FieldConfig[] => [
    { name: "governorate", label: L("المحافظة", "Governorate"), type: "select", required: true, searchable: true, disabled: editing, options: GOVERNORATES.map(([code]) => [code, name(code)]) },
    { name: "pricePiastres", label: L("سعر التوصيل (ج.م)", "Delivery price (EGP)"), type: "money", required: true },
  ];
  return {
    id: "delivery-charges",
    title: L("أسعار التوصيل", "Delivery charges"),
    unit: L("محافظة", "governorates"),
    keys: screenKeys,
    create: [{ form: "create", label: L("إضافة محافظة", "Add a governorate"), keys: screenKeys }],
    views: [{
      id: "list", label: L("أسعار التوصيل", "Delivery charges"), keys: screenKeys,
      endpoint: "/delivery-charges", rowKey: "id",
      chips: [{ id: "all", label: L("الكل", "All") }, { id: "deleted", label: L("المحذوفة", "Deleted"), query: { deleted: "only" } }],
      paging: false,   // at most one row per governorate: the whole list, sorted here
      columns: [
        { key: "governorate", label: L("المحافظة", "Governorate"), get: (r) => name(r.governorate), render: (r) => <>{name(r.governorate)}{r.deletedAt && <> {deleted}</>}</> },
        { key: "pricePiastres", label: L("سعر التوصيل (ج.م)", "Delivery price (EGP)"), type: "money" },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
      onRow: (row, h) => h.open(row),
    }],
    record: {
      title: (r) => (r.governorate ? name(r.governorate) : L("سعر التوصيل", "Delivery charge")),
      endpoint: (r) => `/delivery-charges/${r.id}`,
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{L("محذوف", "Deleted")}</div>}
          <Section title={L("البيانات", "Details")}>
            <Kv k={L("المحافظة", "Governorate")}>{name(r.governorate)}</Kv>
            <Kv k={L("سعر التوصيل (ج.م)", "Delivery price (EGP)")}><Ltr>{piastresText(r.pricePiastres)}</Ltr></Kv>
          </Section>
        </>
      ),
      // Edit only a live one.
      actions: [{ id: "edit", label: L("تعديل", "Edit"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("edit", r); } }],
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => `/delivery-charges/${r.id}`,
        confirm: (r) => ({ title: L(`حذف سعر توصيل ${name(r.governorate)}؟`, `Delete the delivery charge of ${name(r.governorate)}?`), text: L("يبقى ظاهرًا للقراءة تحت «المحذوفة»، ويمكن إضافة المحافظة من جديد.", "It stays visible, read only, under Deleted, and the governorate can be added again.") }),
      },
    },
    forms: {
      create: { title: L("إضافة محافظة", "Add a governorate"), path: () => "/delivery-charges", method: "POST", load: () => ({}), toPayload: (v) => ({ governorate: v.governorate, pricePiastres: v.pricePiastres }), fields: fields(false) },
      edit: {
        title: (r) => L(`تعديل سعر توصيل ${name(r!.governorate)}`, `Edit the delivery charge of ${name(r!.governorate)}`), path: (r) => `/delivery-charges/${r!.id}`, method: "PATCH",
        load: (r) => ({ governorate: r!.governorate, pricePiastres: r!.pricePiastres }), toPayload: (v) => ({ pricePiastres: v.pricePiastres }), fields: fields(true),
      },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
