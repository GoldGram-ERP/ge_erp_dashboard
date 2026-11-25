"use client";
// التجار: merchants/merchants (Admin and Super admin only). Wholesale gold traders the company buys from and sells to
// (docs/designs/merchants.md). One list, one record sheet (details, account statement, making-charge rules), and the forms
// to add or edit a merchant and to record a payment, a receipt or an adjustment. A balance is always an amount and a word:
// له (the company owes him) or عليه (he owes the company).
import { Status } from "@/components/ui";
import type { FieldConfig, LookupSpec, MakeConfig, Row, ThingConfig } from "@/lib/engine-types";
import { today } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { code6 } from "@/lib/code6";
import { goldOwed, moneyOwed, RulesPanel, StatementPanel } from "@/components/merchants/MerchantPanels";

const branchSpec: LookupSpec = { path: "/branches", value: "id", label: "branchName" };
const bankAccountSpec: LookupSpec = { path: "/bank-accounts", value: "id", label: "accountName" };
const num = (v: unknown) => Number(v) || 0;

export const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { L } = tr;
  const deleted = <Status tone="off">{L("محذوف", "Deleted")}</Status>;
  const stamp = (x: unknown) => (x ? <Ltr>{String(x).slice(0, 19).replace("T", " ")}</Ltr> : "");
  const dirOptions: [string, string][] = [["owed", L("له (إحنا مدينين له)", "We owe him (له)")], ["owing", L("عليه (هو مدين لنا)", "He owes us (عليه)")]];
  const sign = (dir: unknown) => (dir === "owing" ? -1 : 1);

  const merchantFields = (adding: boolean): FieldConfig[] => [
    { name: "merchantCode", label: L("كود التاجر", "Merchant code"), type: "code", documentType: "merchant", hint: L("بيتحدد تلقائي", "Given by the system"), section: L("بيانات التاجر", "Merchant") },
    { name: "merchantName", label: L("اسم التاجر", "Name"), type: "text", required: true, maxLength: 100, section: L("بيانات التاجر", "Merchant") },
    { name: "phone", label: L("التليفون", "Phone"), type: "text", maxLength: 30, section: L("بيانات التاجر", "Merchant") },
    { name: "address", label: L("العنوان", "Address"), type: "text", maxLength: 300, wide: true, section: L("بيانات التاجر", "Merchant") },
    { name: "isActive", label: L("نشط", "Active"), type: "checkbox", default: true, help: L("التاجر غير النشط مابيظهرش في فواتير الشراء والبيع الجديدة، لكن بيفضل في الكشف.", "An inactive merchant is left out of new purchases and sales, and stays in the statement."), wide: true, section: L("بيانات التاجر", "Merchant") },
    // The opening balance is set when the merchant is added. Later, the account changes by documents and adjustments.
    ...(adding ? [
      { name: "openingMoney", label: L("رصيد أول المدة بالفلوس", "Opening balance in money"), type: "money", section: L("رصيد أول المدة", "Opening balance") },
      { name: "openingMoneyDir", label: L("الرصيد ده", "This balance is"), type: "select", default: "owed", options: dirOptions, section: L("رصيد أول المدة", "Opening balance") },
      { name: "openingGoldKarat", label: L("عيار الذهب", "Gold karat"), type: "select", options: [["18", "18"], ["21", "21"], ["24", "24"]], section: L("رصيد أول المدة", "Opening balance") },
      { name: "openingGoldWeight", label: L("رصيد أول المدة بالذهب (جم)", "Opening balance in gold (g)"), type: "weight", section: L("رصيد أول المدة", "Opening balance") },
      { name: "openingGoldDir", label: L("الرصيد ده", "This balance is"), type: "select", default: "owed", options: dirOptions, section: L("رصيد أول المدة", "Opening balance") },
    ] as FieldConfig[] : []),
  ];
  const merchantPayload = (v: Row, row: Row | null) => ({
    merchantName: v.merchantName,
    phone: v.phone ? String(v.phone).trim() : null,
    address: v.address ? String(v.address).trim() : null,
    isActive: !!v.isActive,
    ...(row ? {} : {
      ...(num(v.openingMoney) > 0 ? { openingOwedPiastres: sign(v.openingMoneyDir) * num(v.openingMoney) } : {}),
      ...(num(v.openingGoldWeight) > 0 ? { openingGoldKarat: v.openingGoldKarat || undefined, openingGoldWeightMg: sign(v.openingGoldDir) * num(v.openingGoldWeight) } : {}),
    }),
  });

  // A payment or a receipt: money (cash, one bank account) and gold (per karat), through the branch's own safe, bank and gold treasury.
  const settleFields = (): FieldConfig[] => [
    { name: "date", label: L("التاريخ", "Date"), type: "date", required: true, default: () => today(), section: L("البيانات", "Details") },
    { name: "branchId", label: L("الفرع", "Branch"), type: "select", required: true, optionsFrom: branchSpec, section: L("البيانات", "Details") },
    { name: "cash", label: L("كاش", "Cash"), type: "money", section: L("فلوس", "Money") },
    { name: "bankAccountId", label: L("حساب بنكي", "Bank account"), type: "select", optionsFrom: bankAccountSpec, section: L("فلوس", "Money") },
    { name: "bankAmount", label: L("المبلغ على الحساب البنكي", "Amount through the bank account"), type: "money", section: L("فلوس", "Money") },
    { name: "g18", label: L("ذهب عيار 18 (جم)", "Gold 18K (g)"), type: "weight", section: L("ذهب", "Gold") },
    { name: "g21", label: L("ذهب عيار 21 (جم)", "Gold 21K (g)"), type: "weight", section: L("ذهب", "Gold") },
    { name: "g24", label: L("ذهب عيار 24 (جم)", "Gold 24K (g)"), type: "weight", section: L("ذهب", "Gold") },
    { name: "note", label: L("ملاحظة", "Note"), type: "text", maxLength: 300, wide: true, section: L("البيانات", "Details") },
  ];
  const settlePayload = (direction: "paid" | "received") => (v: Row) => {
    const gold = ([["18", v.g18], ["21", v.g21], ["24", v.g24]] as const).filter(([, w]) => num(w) > 0).map(([karat, w]) => ({ karat, weightMg: num(w) }));
    return {
      direction, date: v.date, branchId: v.branchId,
      ...(num(v.cash) > 0 ? { cashPiastres: num(v.cash) } : {}),
      ...(v.bankAccountId && num(v.bankAmount) > 0 ? { bank: [{ bankAccountId: v.bankAccountId, amountPiastres: num(v.bankAmount) }] } : {}),
      ...(gold.length ? { gold } : {}),
      ...(v.note ? { note: String(v.note).trim() } : {}),
    };
  };

  // An adjustment corrects the account, in money or in gold of one karat, with a reason.
  const adjustFields = (gold: boolean): FieldConfig[] => [
    { name: "date", label: L("التاريخ", "Date"), type: "date", required: true, default: () => today() },
    { name: "branchId", label: L("الفرع", "Branch"), type: "select", required: true, optionsFrom: branchSpec },
    { name: "dir", label: L("التسوية", "The adjustment makes it"), type: "select", required: true, default: "owed", options: dirOptions },
    ...(gold
      ? [{ name: "karat", label: L("العيار", "Karat"), type: "select", required: true, options: [["18", "18"], ["21", "21"], ["24", "24"]] },
         { name: "weight", label: L("الوزن (جم)", "Weight (g)"), type: "weight", required: true, positive: true }] as FieldConfig[]
      : [{ name: "amount", label: L("المبلغ", "Amount"), type: "money", required: true, positive: true }] as FieldConfig[]),
    { name: "reason", label: L("السبب", "Reason"), type: "text", required: true, maxLength: 300, wide: true },
  ];
  const adjustPayload = (gold: boolean) => (v: Row) => ({
    date: v.date, branchId: v.branchId, unit: gold ? "gold" : "egp", owedToMerchant: v.dir !== "owing", reason: String(v.reason).trim(),
    ...(gold ? { karat: v.karat, weightMg: num(v.weight) } : { amountPiastres: num(v.amount) }),
  });

  return {
    id: "merchants",
    title: L("التجار", "Merchants"),
    unit: L("تاجر", "merchant"),
    keys: ["merchants/merchants"],
    views: [{
      id: "merchants", label: L("التجار", "Merchants"), keys: ["merchants/merchants"],
      create: [{ form: "createMerchant", label: L("إضافة تاجر", "Add merchant"), keys: ["merchants/merchants"] }],
      endpoint: "/merchants", query: { order: "newest" },
      search: { param: "search", placeholder: L("ابحث بالاسم أو التليفون أو الكود", "Search by name, phone or code") },
      chips: [
        { id: "all", label: L("الكل", "All") },
        { id: "active", label: L("النشطين", "Active"), query: { active: "yes" } },
        { id: "inactive", label: L("غير النشطين", "Inactive"), query: { active: "no" } },
        { id: "deleted", label: L("المحذوفين", "Deleted"), query: { deleted: "only" } },
      ],
      paging: { sizeParam: null },
      columns: [
        { key: "merchantCode", label: L("الكود", "Code"), render: (r) => <><Ltr>{code6(r.merchantCode)}</Ltr>{r.deletedAt && <> {deleted}</>}</> },
        { key: "merchantName", label: L("الاسم", "Name") },
        { key: "phone", label: L("التليفون", "Phone"), render: (r) => (r.phone ? <Ltr>{r.phone}</Ltr> : "") },
        { key: "isActive", label: L("الحالة", "Status"), render: (r) => <Status tone={r.isActive ? "good" : "off"}>{r.isActive ? L("نشط", "Active") : L("غير نشط", "Inactive")}</Status> },
        { key: "balanceMoney", label: L("الرصيد بالفلوس", "Balance in money"), className: "num", render: (r) => moneyOwed(r.balance.owedPiastres, tr) },
        { key: "balanceGold", label: L("الرصيد بالذهب", "Balance in gold"), className: "num", render: (r) => goldOwed(r.balance.owed21Mg, tr) },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    }],
    record: {
      title: (r) => `${L("تاجر رقم", "Merchant no.")} ${code6(r.merchantCode)}`,
      endpoint: (r) => `/merchants/${r.id}`,
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{L("التاجر ده محذوف.", "This merchant is deleted.")}</div>}
          <Section title={L("بيانات التاجر", "Merchant")}>
            <Kv k={L("الكود", "Code")}><Ltr>{code6(r.merchantCode)}</Ltr></Kv>
            <Kv k={L("الاسم", "Name")}>{r.merchantName}</Kv>
            <Kv k={L("التليفون", "Phone")}>{r.phone ? <Ltr>{r.phone}</Ltr> : ""}</Kv>
            <Kv k={L("العنوان", "Address")}>{r.address ?? ""}</Kv>
            <Kv k={L("الحالة", "Status")}><Status tone={r.isActive ? "good" : "off"}>{r.isActive ? L("نشط", "Active") : L("غير نشط", "Inactive")}</Status></Kv>
            <Kv k={L("تاريخ الإضافة", "Created")}>{stamp(r.createdAt)}</Kv>
            {r.deletedAt && <Kv k={L("تاريخ الحذف", "Deleted")}>{stamp(r.deletedAt)}</Kv>}
          </Section>
          {!r.deletedAt && <><StatementPanel merchantId={r.id} tr={tr} /><RulesPanel merchantId={r.id} tr={tr} /></>}
        </>
      ),
      actions: [
        { id: "pay", label: L("دفع لتاجر", "Pay merchant"), icon: "plus", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("pay", r); } },
        { id: "receive", label: L("استلام من تاجر", "Receive from merchant"), icon: "plus", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("receive", r); } },
        { id: "adjustMoney", label: L("تسوية بالفلوس", "Money adjustment"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("adjustMoney", r); } },
        { id: "adjustGold", label: L("تسوية بالذهب", "Gold adjustment"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("adjustGold", r); } },
        { id: "edit", label: L("تعديل", "Edit"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("editMerchant", r); } },
      ],
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => `/merchants/${r.id}`,
        // The backend refuses a merchant who has any document (merchantInUse): he is set inactive instead.
        confirm: (r) => ({ title: L(`حذف التاجر ${code6(r.merchantCode)}؟`, `Delete merchant ${code6(r.merchantCode)}?`), text: L("التاجر اللي عليه حركات مابيتحذفش؛ خليه غير نشط بدل كده.", "A merchant with documents cannot be deleted: set him inactive instead.") }),
      },
    },
    forms: {
      createMerchant: { title: L("تاجر جديد", "New merchant"), path: () => "/merchants", method: "POST", toPayload: merchantPayload, fields: merchantFields(true) },
      editMerchant: {
        title: (r) => L(`تعديل التاجر ${code6(r!.merchantCode)}`, `Edit merchant ${code6(r!.merchantCode)}`), path: (r) => `/merchants/${r!.id}`, method: "PATCH", toPayload: merchantPayload,
        load: (r) => ({ merchantCode: r!.merchantCode, merchantName: r!.merchantName, phone: r!.phone ?? "", address: r!.address ?? "", isActive: r!.isActive }),
        fields: merchantFields(false),
      },
      pay: { title: L("دفع لتاجر", "Pay a merchant"), path: (r) => `/merchants/${r!.id}/settlements`, method: "POST", toPayload: settlePayload("paid"), fields: settleFields() },
      receive: { title: L("استلام من تاجر", "Receive from a merchant"), path: (r) => `/merchants/${r!.id}/settlements`, method: "POST", toPayload: settlePayload("received"), fields: settleFields() },
      adjustMoney: { title: L("تسوية بالفلوس", "Money adjustment"), path: (r) => `/merchants/${r!.id}/adjustments`, method: "POST", toPayload: adjustPayload(false), fields: adjustFields(false) },
      adjustGold: { title: L("تسوية بالذهب", "Gold adjustment"), path: (r) => `/merchants/${r!.id}/adjustments`, method: "POST", toPayload: adjustPayload(true), fields: adjustFields(true) },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} />; }
