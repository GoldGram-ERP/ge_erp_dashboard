"use client";
// الأصناف: buy/items (gold-accounts/categories, item-names, items + their -list screens). ONE page, three tabs:
// المجموعات الرئيسية (category) -> أسماء الأصناف (item name, one category) -> مجموعات الأصناف (item, one per name).
// Ported from docs/nav-preview/app/things/gold-items.js. Codes come from the backend (the form shows the upcoming one, a preview).
// Lists take only search / page (fixed 20) / order / deleted (+ categoryId on names and items): no pageSize, no limit.
// Category and name forms are engine sheets; the item form cascades (name list follows the category), so it is a page form (custom).
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { Chip, Column, CustomFormProps, FieldConfig, FilterConfig, Option, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { dateTimeText, milligramsText, piastresText, typedMilligrams, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { Kv, Ltr, Section, ThingPage, toast } from "@/components/engine";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import { useAccess } from "./sales-access";
import { useJobIntent } from "./job-intent";
import { CHARGE_MODES, exampleOf, pricePerGram, valueText, type PriceSet } from "./item-math";

type Kind = "category" | "name" | "item";
const K = {
  category: { path: "/categories", ns: "categories", codeKey: "categoryCode", view: "categories", editForm: "editCategory" },
  name: { path: "/item-names", ns: "itemNames", codeKey: "itemNameCode", view: "names", editForm: "editName" },
  item: { path: "/items", ns: "items", codeKey: "itemCode", view: "items", editForm: "editItem" },
} as const;
const kindOf = (r: Row): Kind => (r.categoryCode !== undefined ? "category" : r.itemNameCode !== undefined ? "name" : "item");
const code6 = (n: unknown) => String(n).padStart(6, "0");
const KEYS = ["gold-accounts/categories", "gold-accounts/categories-list", "gold-accounts/item-names", "gold-accounts/item-names-list", "gold-accounts/items", "gold-accounts/items-list"];

// Every row of a paged list (the backend gives 20 at a time).
async function allPages(path: string, query: Record<string, string> = {}): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await api(path, { query: { ...query, page } });
    const rows: Row[] = r?.items ?? [];
    out.push(...rows);
    if (!rows.length || out.length >= (r?.total ?? 0)) break;
  }
  return out;
}
const CATS = ["gold-accounts", "categories"], KARATS = ["gold-accounts", "karats"];
const loadCats = () => allPages("/categories");

type Ctx = { cats: Row[]; qc: QueryClient };
const forget = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["gold-accounts"] });

export const makeConfigWith = (x: Ctx) => (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("gold-accounts", k, v);
  const c = (k: string, v?: Record<string, string>) => t("common", k, v);
  const yesNo = (v: unknown) => (v ? c("yes") : c("no"));
  const catOptions: Option[] = x.cats.map((cat) => [cat.id, cat.categoryName]);

  const statusCol = (): Column => ({ key: "deletedAt", label: c("recordStatus"), type: "status", get: (r) => (r.deletedAt ? "deleted" : "active"), statuses: { active: [c("active"), "good"], deleted: [m("categories.deletedBadge"), "off"] } });
  // An item's Active column: deleted, inactive or active, as words (never color alone).
  const activeCol = (): Column => ({ key: "isActive", label: m("items.status"), type: "status", get: (r) => (r.deletedAt ? "deleted" : r.isActive === false ? "inactive" : "active"), statuses: { active: [m("items.active"), "good"], inactive: [m("items.inactive"), "warn"], deleted: [m("categories.deletedBadge"), "off"] } });
  const charge = (mode: unknown, value: unknown) => (mode && value != null ? <Ltr>{m(`items.shown.${mode}`, { value: String(value) })}</Ltr> : "");
  const codeCol = (label: string, key: string): Column => ({ key, label, render: (r) => <Ltr>{code6(r[key])}</Ltr> });
  const categoryFilter = (): FilterConfig[] => [{ name: "categoryId", label: m("itemNames.categoryId"), type: "select", options: catOptions, placeholder: m("items.allCategories") }];

  const tab = (kind: Kind, label: string, columns: Column[], withCategory = false, chips: Chip[] = []): ViewConfig => {
    const k = K[kind], keys = KEYS.filter((s) => s.startsWith(`gold-accounts/${{ category: "categories", name: "item-names", item: "items" }[kind]}`));
    return {
      id: k.view, label, keys,
      create: [{ form: `create${kind[0].toUpperCase()}${kind.slice(1)}`, label: m(`${k.ns}.add`), keys: keys.filter((s) => !s.endsWith("-list")) }],   // each tab adds its own kind
      endpoint: k.path,
      query: { order: "newest" },
      search: { param: "search", placeholder: m(`${k.ns}.searchPlaceholder`) },
      chips: [{ id: "all", label: c("report.all") }, ...chips, { id: "deleted", label: m(`${k.ns}.deletedOnly`), query: { deleted: "only" }, superOnly: true }],   // Super admin only
      filters: withCategory ? categoryFilter() : [],
      paging: { sizeParam: null },
      columns,
      rowClass: (r) => (r.deletedAt ? "deleted" : r.isActive === false ? "inactive" : ""),
      onRow: (row, h) => h.open(row),
    };
  };

  const codeField = (kind: Kind): FieldConfig => ({ name: K[kind].codeKey, label: m(`${K[kind].ns}.${K[kind].codeKey}`), type: "code", documentType: { category: "category", name: "item_name", item: "item" }[kind], hint: m(`${K[kind].ns}.autoHint`) });
  const afterNew = (kind: Kind) => (a: Row, h: { toast: (s: string) => void }) => { forget(x.qc); h.toast(m(`${K[kind].ns}.savedNumber`, { code: code6(a[K[kind].codeKey]) })); };
  const afterEdit = (kind: Kind) => (_a: unknown, h: { toast: (s: string) => void }) => { forget(x.qc); h.toast(m(`${K[kind].ns}.changesSaved`)); };
  const catFields = (): FieldConfig[] => [
    codeField("category"),
    { name: "categoryName", label: m("categories.categoryName"), type: "text", required: true, maxLength: 100 },
    { name: "qrLabel", label: m("categories.qrLabel"), type: "checkbox", help: m("categories.qrLabelHint") },
  ];
  const nameFields = (): FieldConfig[] => [
    codeField("name"),
    { name: "categoryId", label: m("itemNames.categoryId"), type: "select", required: true, options: catOptions, placeholder: c("choose") },
    { name: "itemName", label: m("itemNames.itemName"), type: "text", required: true, maxLength: 100 },
  ];

  const stamps = (r: Row) => <>
    <Kv k={L("تاريخ الإضافة", "Created")}>{dateTimeText(r.createdAt)}</Kv><Kv k={L("آخر تعديل", "Last edited")}>{dateTimeText(r.updatedAt)}</Kv>
    {r.deletedAt && <Kv k={m("categories.deletedBadge")}>{dateTimeText(r.deletedAt)}</Kv>}
  </>;
  const body = (r: Row) => {
    const kind = kindOf(r);
    return <Section title={m(`${K[kind].ns}.details`)}>
      {kind === "category" && <><Kv k={m("categories.categoryCode")}><Ltr>{code6(r.categoryCode)}</Ltr></Kv><Kv k={m("categories.categoryName")}>{r.categoryName}</Kv><Kv k={m("categories.qrLabel")}>{yesNo(r.qrLabel)}</Kv></>}
      {kind === "name" && <><Kv k={m("itemNames.itemNameCode")}><Ltr>{code6(r.itemNameCode)}</Ltr></Kv><Kv k={m("itemNames.itemName")}>{r.itemName}</Kv><Kv k={m("itemNames.categoryId")}>{r.categoryName}</Kv></>}
      {kind === "item" && <>
        <Kv k={m("items.itemCode")}><Ltr>{code6(r.itemCode)}</Ltr></Kv><Kv k={m("items.itemName")}>{r.itemName}</Kv><Kv k={m("items.coding")}>{m(r.isCoded ? "items.coded" : "items.notCoded")}</Kv>
        <Kv k={m("items.itemType")}>{m(`items.itemTypes.${r.itemType}`)}</Kv><Kv k={m("items.categoryId")}>{r.categoryName}</Kv><Kv k={m("items.karat")}><Ltr>{r.karat}</Ltr></Kv>
        <Kv k={m("items.weightG")}><Ltr>{r.weight == null ? "" : milligramsText(r.weight)}</Ltr></Kv>
        <Kv k={m("items.workmanship")}>{charge(r.workmanshipMode, r.workmanshipValue)}</Kv><Kv k={m("items.cashback")}>{charge(r.cashbackMode, r.cashbackValue)}</Kv>
        <Kv k={m("items.status")}>{m(r.isActive === false ? "items.inactive" : "items.active")}</Kv></>}
      {stamps(r)}
    </Section>;
  };

  const deleteText = (kind: Kind, r: Row) => ({ title: m(`${K[kind].ns}.deleteTitle`, { code: code6(r[K[kind].codeKey]) }), text: m(`${K[kind].ns}.deleteBody`) });
  const sheet = (kind: Kind, fields: () => FieldConfig[]) => {
    const k = K[kind];
    return {
      [`create${kind[0].toUpperCase()}${kind.slice(1)}`]: { title: m(`${k.ns}.new`), path: () => k.path, method: "POST", fields: fields(), load: () => ({}), toPayload: kind === "category" ? (v: Row) => ({ categoryName: v.categoryName, qrLabel: v.qrLabel }) : (v: Row) => ({ categoryId: v.categoryId, itemName: v.itemName }), afterSave: afterNew(kind) },
      [k.editForm]: { title: (r: Row | null) => m(`${k.ns}.editTitle`, { code: code6(r![k.codeKey]) }), path: (r: Row | null) => `${k.path}/${r!.id}`, method: "PATCH", fields: fields(), load: (r: Row | null) => ({ ...r }), toPayload: kind === "category" ? (v: Row) => ({ categoryName: v.categoryName, qrLabel: v.qrLabel }) : (v: Row) => ({ categoryId: v.categoryId, itemName: v.itemName }), afterSave: afterEdit(kind) },
    };
  };

  return {
    id: "items",
    title: L("الأصناف", "Items"),
    unit: L("سجل", "record"),
    keys: KEYS,
    views: [
      tab("category", m("categories.title"), [
        codeCol(m("categories.categoryCode"), "categoryCode"),
        { key: "categoryName", label: m("categories.categoryName") },
        { key: "qrLabel", label: m("categories.qrLabel"), render: (r) => yesNo(r.qrLabel) },
        { key: "createdAt", label: L("تاريخ الإضافة", "Created"), type: "date" },
        statusCol(),
      ]),
      tab("name", m("itemNames.title"), [
        codeCol(m("itemNames.itemNameCode"), "itemNameCode"),
        { key: "itemName", label: m("itemNames.itemName") },
        { key: "categoryName", label: m("itemNames.categoryId") },
        { key: "liveItemId", label: m("itemNames.hasItem"), render: (r) => yesNo(r.liveItemId) },
        statusCol(),
      ], true),
      tab("item", m("items.title"), [
        codeCol(m("items.cols.itemCode"), "itemCode"),
        { key: "itemName", label: m("items.cols.itemName") },
        { key: "categoryName", label: m("items.cols.categoryName") },
        { key: "itemType", label: m("items.itemType"), render: (r) => m(`items.itemTypes.${r.itemType}`) },
        { key: "karat", label: m("items.cols.karat"), render: (r) => <Ltr>{r.karat}</Ltr> },
        { key: "weight", label: m("items.weightG"), type: "weight" },
        { key: "workmanshipValue", label: m("items.workmanship"), render: (r) => charge(r.workmanshipMode, r.workmanshipValue) },
        { key: "cashbackValue", label: m("items.cashback"), render: (r) => charge(r.cashbackMode, r.cashbackValue) },
        activeCol(),
      ], true, [{ id: "active", label: m("items.activeOnly"), query: { active: true } }, { id: "inactive", label: m("items.inactiveOnly"), query: { active: false } }]),
    ],
    record: {
      title: (r) => `${m(`${K[kindOf(r)].ns}.title`)} · ${code6(r[K[kindOf(r)].codeKey])}`,
      endpoint: (r) => `${K[kindOf(r)].path}/${r.id}`,
      render: body,
      actions: [
        { id: "edit", label: c("edit"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm(K[kindOf(r)].editForm, r); } },
        // Items: the backend answers itemInUse, which the messages have no text for, so the refusal is worded here.
        {
          id: "delete-item", label: c("delete"), icon: "trash", danger: true, when: (r) => !r.deletedAt && kindOf(r) === "item",
          confirm: { title: L("حذف هذا الصنف؟", "Delete this item?"), text: m("items.deleteBody") },
          run: async (r, h) => {
            try { await api(`/items/${r.id}`, { method: "DELETE" }); } catch (e) {
              if (e instanceof ApiFailure && e.error.message === "itemInUse") { h.toast(L("لم يُحذف: ما زالت فواتير مشتريات تستخدم هذا الصنف.", "Not deleted: purchase invoices still use this item."), { error: true }); return; }
              throw e;
            }
            h.close(); h.toast(m("items.deleted")); forget(x.qc); h.reload();
          },
        },
      ],
      remove: {   // marks the row; refused with categoryInUse / categoryHasItemNames / itemNameInUse
        when: (r) => !r.deletedAt && kindOf(r) !== "item",
        path: (r) => `${K[kindOf(r)].path}/${r.id}`,
        confirm: (r) => deleteText(kindOf(r), r),
      },
    },
    forms: {
      ...sheet("category", catFields),
      ...sheet("name", nameFields),
      createItem: { title: m("items.new"), display: "page", fields: [], path: () => "/items", custom: ItemForm },
      editItem: { title: (r) => m("items.editTitle", { code: code6(r!.itemCode) }), display: "page", fields: [], path: (r) => `/items/${r!.id}`, custom: ItemForm },
    },
  };
};
export const makeConfig = makeConfigWith({ cats: [], qc: null as unknown as QueryClient });

// The price set the example box uses: the newest saved one (owner rule, see gold-prices.tsx); null when none was ever saved.
const loadPrice = async (): Promise<PriceSet | null> => {
  try { return await api("/gold-prices/today"); } catch (e) { if (e instanceof ApiFailure && e.status === 404) return null; throw e; }
};
const SILVER = "999";
const hundredthsOf = (v: unknown) => (v == null || v === "" ? "" : typedPiastres(String(v)) ?? "");   // "187.50" -> 18750, the money field's typed form

// Under each workmanship and cashback setting: one piece at today's price, following the typing.
function ExampleBox({ kind, price, tr }: { kind: "workmanship" | "cashback"; price: PriceSet | null | undefined; tr: Tr }) {
  const m = (k: string, v?: Record<string, string>) => tr.t("gold-accounts", `items.${k}`, v);
  const [karat, weight, mode, value] = useWatch({ name: ["karat", "weight", `${kind}Mode`, `${kind}Value`] });
  if (price === undefined) return <div className="note example" id={`${kind}-example`}>{tr.L("جارٍ التحميل…", "Loading…")}</div>;
  const ex = exampleOf(price, { karat, weight, mode, value });
  const money = (p: bigint) => piastresText(Number(p));
  return (
    <div className="note example" id={`${kind}-example`}>
      <div className="example-title">{m("example.title")}</div>
      {ex.ok ? <>
        <div className="example-basis">{m("example.basis", { karat: String(karat), price: money(pricePerGram(price!, String(karat))!), weight: milligramsText(typedMilligrams(weight)) })}</div>
        <div className="example-line">{m(`example.${kind}`, { gold: money(ex.gold), charge: money(ex.charge), total: money(ex.total) })}</div>
      </> : <div>{m(`example.${ex.why}`)}</div>}
    </div>
  );
}

// ───── the item form: category -> its item names (a name that already has another item is shown, refused) ─────
function ItemForm({ row, close, reload, tr }: CustomFormProps) {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("gold-accounts", k, v);
  const c = (k: string) => t("common", k);
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canSwitch = me?.userType === "admin" || me?.userType === "super_admin";   // the backend refuses anyone else (403 notAllowed)
  const [catId, setCatId] = useState(String(row?.categoryId ?? ""));
  const [itemType, setItemType] = useState(String(row?.itemType ?? "gold"));
  const [modes, setModes] = useState({ workmanship: String(row?.workmanshipMode ?? ""), cashback: String(row?.cashbackMode ?? "") });
  const [saving, setSaving] = useState(false);
  const [saveKey, setSaveKey] = useState(newSaveKey());
  const cats = useQuery({ queryKey: CATS, queryFn: loadCats, staleTime: 60_000 });
  const karats = useQuery({ queryKey: KARATS, queryFn: () => api("/karats"), staleTime: 5 * 60_000 });
  const price = useQuery({ queryKey: ["gold-prices", "today"], queryFn: loadPrice, staleTime: 60_000 });
  const names = useQuery({ queryKey: ["gold-accounts", "names-of", catId], enabled: !!catId, queryFn: () => allPages("/item-names", { categoryId: catId, order: "newest" }) });
  const nameOptions: Option[] = (names.data ?? []).map((n) => {
    const used = !!n.liveItemId && n.liveItemId !== row?.id;
    return [n.id, used ? `${n.itemName} · ${m("itemNames.hasItem")}` : n.itemName, used];
  });
  // The karat list follows the type: gold 18 / 21 / 24, silver 999 (from GET /karats).
  const karatOptions: Option[] = ((karats.data ?? []) as Row[]).map((k) => String(k.karat)).filter((k) => (itemType === "gold") === (k !== SILVER)).map((k) => [k, k]);
  const fields = useMemo<FieldConfig[]>(() => {
    const details = m("items.basicDetails"), work = m("items.workmanship"), back = m("items.cashback");
    const modeOptions: Option[] = CHARGE_MODES.map((x) => [x, m(`items.modes.${x}`)]);
    const setting = (kind: "workmanship" | "cashback", section: string): FieldConfig[] => [
      { name: `${kind}Mode`, label: m(`items.${kind}Mode`), type: "select", required: true, searchable: false, options: modeOptions, placeholder: c("choose"), section },
      { name: `${kind}Value`, label: m(`items.${kind}Value`), type: "money", required: true, help: modes[kind] ? m(`items.valueHelp.${modes[kind]}`) : undefined, section,
        // As the backend's rule: ten whole digits at most, and a percent is 100 at most (v is hundredths).
        validate: (v, all) => (v > 999_999_999_999 ? m("items.commissionInvalid") : all[`${kind}Mode`] === "percent" && v > 10_000 ? m("items.percentMax") : null) },
      { name: `${kind}Example`, label: "", type: "html", wide: true, html: () => <ExampleBox kind={kind} price={price.isPending ? undefined : price.data ?? null} tr={tr} />, section },
    ];
    return [
      { name: "itemCode", label: m("items.itemCode"), type: "code", documentType: "item", hint: m("items.autoHint"), section: details },
      { name: "categoryId", label: m("items.categoryId"), type: "select", required: true, options: (cats.data ?? []).map((x) => [x.id, x.categoryName] as Option), placeholder: c("choose"), section: details },
      { name: "itemNameId", label: m("items.itemName"), type: "select", required: true, disabled: !catId, options: nameOptions, placeholder: !catId ? m("itemNames.categoryFirst") : names.data && !names.data.length ? m("itemNames.noNamesInCategory") : c("choose"), section: details },
      { name: "isCoded", label: m("items.coding"), type: "select", required: true, searchable: false, options: [["true", m("items.coded")], ["false", m("items.notCoded")]], section: details },
      { name: "itemType", label: m("items.itemType"), type: "select", required: true, searchable: false, options: [["gold", m("items.itemTypes.gold")], ["other_or_silver", m("items.itemTypes.other_or_silver")]], section: details },
      { name: "karat", label: m("items.karat"), type: "select", required: true, searchable: false, options: karatOptions, placeholder: c("choose"), help: m("items.karatHelp"), section: details },
      { name: "weight", label: m("items.weightG"), type: "weight", required: true, positive: true, placeholder: "0.000", section: details },
      ...setting("workmanship", work),
      ...setting("cashback", back),
      { name: "isActive", label: m("items.isActive"), type: "checkbox", disabled: !canSwitch, help: canSwitch ? undefined : m("items.activeAdminOnly"), section: m("items.status") },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.data, karats.data, names.data, price.data, price.isPending, catId, itemType, modes, canSwitch, tr]);
  const values = useMemo<Row>(() => (row
    ? { ...row, isCoded: String(row.isCoded), weight: row.weight ?? "", workmanshipValue: hundredthsOf(row.workmanshipValue), cashbackValue: hundredthsOf(row.cashbackValue), isActive: row.isActive !== false }
    : { isCoded: "true", itemType: "gold", isActive: true }), [row]);
  const f = useFieldsForm(fields, values);
  useEffect(() => {
    const s = f.watch((v, info) => {
      setSaveKey(newSaveKey());                                  // edited: another attempt
      if (info.name === "categoryId") { setCatId(String(v.categoryId ?? "")); f.setValue("itemNameId", ""); }   // another category clears the name
      if (info.name === "itemType") {                            // silver has one karat; gold never takes it
        setItemType(String(v.itemType ?? ""));
        if (v.itemType === "gold" ? v.karat === SILVER : v.karat !== SILVER) f.setValue("karat", v.itemType === "gold" ? "" : SILVER);
      }
      if (info.name === "workmanshipMode" || info.name === "cashbackMode") setModes({ workmanship: String(v.workmanshipMode ?? ""), cashback: String(v.cashbackMode ?? "") });
    });
    return () => s.unsubscribe();
  }, [f]);

  const submit = async () => {
    const v = await f.read();
    if (!v) return;
    setSaving(true);
    try {
      const body = {
        itemNameId: v.itemNameId, isCoded: v.isCoded === "true", itemType: v.itemType, categoryId: v.categoryId, karat: v.karat, weight: v.weight,
        workmanshipMode: v.workmanshipMode, workmanshipValue: valueText(BigInt(v.workmanshipValue)), cashbackMode: v.cashbackMode, cashbackValue: valueText(BigInt(v.cashbackValue)),
        ...(canSwitch ? { isActive: v.isActive } : {}),   // a normal user never sends it: the item keeps its state
      };
      const a = await api(row ? `/items/${row.id}` : "/items", { method: row ? "PATCH" : "POST", body, saveKey });
      forget(qc);
      toast(row ? m("items.changesSaved") : m("items.savedNumber", { code: code6(a.itemCode) }));
      reload();
    } catch (e) {
      if (e instanceof ApiFailure) {
        const fe = backendFieldErrors(e.error, tr);
        if (!(Object.keys(fe).length && f.setErrors(fe))) toast(tr.errorText(e.error), { error: true });
      } else toast(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."), { error: true });
      setSaving(false);
    }
  };
  return <>
    <form id="form" className="card" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <FormFields form={f} fields={fields} values={values} />
    </form>
    <div className="formbar">
      <button type="button" className="btn primary" id="save" disabled={saving} onClick={submit}>{saving ? L("جارٍ الحفظ…", "Saving…") : L("حفظ", "Save")}</button>
      <button type="button" className="btn quiet" id="cancel" onClick={close}>{L("إلغاء", "Cancel")}</button>
    </div>
  </>;
}

export default function Page() {
  const qc = useQueryClient();
  const access = useAccess();
  const job = useJobIntent();
  const cats = useQuery({ queryKey: CATS, queryFn: loadCats, staleTime: 60_000 });
  const make = useMemo(() => makeConfigWith({ cats: cats.data ?? [], qc }), [cats.data, qc]);
  return <ThingPage make={make} access={access} initial={job.view || Object.keys(job.query).length ? job : undefined} />;
}
