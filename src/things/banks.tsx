"use client";
import { Status, Td } from "@/components/ui";
// البنوك: bank-accounts/banks, banks-list, bank-accounts, bank-accounts-list, bank-balances. Ported from docs/nav-preview/app/things/banks.js.
// Views: main banks, sub bank accounts, bank balances report (EGP). Writes: bank and account create/edit/delete.
import type { Column, FieldConfig, LookupSpec, MakeConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { latinNumber } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section, cellNode } from "@/components/engine";

import { code6 as code6 } from "@/lib/code6";
// Commission is an exact decimal text: always two decimals, no float.
const dec2 = (s: unknown) => { const [i, f = ""] = String(s).split("."); return `${i}.${(f + "00").slice(0, 2)}`; };
const COMMISSION = /^\d{1,10}(\.\d{1,2})?$/;
const branchSpec: LookupSpec = { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } };
const bankSpec: LookupSpec = { path: "/banks", value: "id", label: "bankName", query: { pageSize: undefined } };
const bankSpecNewest: LookupSpec = { path: "/banks", value: "id", label: "bankName", query: { order: "newest" } };
const isBank = (r: Row) => r.bankCode !== undefined;

export const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const b = (k: string, v?: Record<string, string>) => t("bank-accounts", `banks.${k}`, v);
  const a = (k: string, v?: Record<string, string>) => t("bank-accounts", `accounts.${k}`, v);
  const bb = (k: string) => t("bank-accounts", `bankBalances.${k}`);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");
  const deleted = (label: string) => <Status tone="off">{label}</Status>;

  const balanceCols: Column[] = [
    { key: "code", label: bb("columns.code"), get: (r) => code6(r.code) },
    { key: "accountName", label: bb("columns.accountName") },
    { key: "total", label: bb("columns.total"), type: "money" },
  ];

  const views: ViewConfig[] = [
    {
      id: "banks", label: b("listTitle"), keys: ["bank-accounts/banks", "bank-accounts/banks-list"],
      create: [{ form: "createBank", label: b("add"), keys: ["bank-accounts/banks"] }],
      endpoint: "/banks", query: { order: "newest" },
      search: { param: "search", placeholder: b("searchPlaceholder") },
      chips: [{ id: "all", label: ALL }, { id: "deleted", label: b("deletedOnly"), query: { deleted: "only" } }],
      paging: { sizeParam: null },
      columns: [
        { key: "bankCode", label: b("bankCode"), get: (r) => code6(r.bankCode), render: (r) => <><Ltr>{code6(r.bankCode)}</Ltr>{r.deletedAt && <> {deleted(b("deletedBadge"))}</>}</> },
        { key: "bankName", label: b("bankName") },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    },
    {
      id: "accounts", label: a("listTitle"), keys: ["bank-accounts/bank-accounts-list"],
      create: [{ form: "createAccount", label: a("add"), keys: ["bank-accounts/bank-accounts"] }],
      endpoint: "/bank-accounts", query: { order: "newest" },
      search: { param: "search", placeholder: a("searchPlaceholder") },
      chips: [{ id: "all", label: ALL }, { id: "deleted", label: a("deletedOnly"), query: { deleted: "only" } }],
      paging: { sizeParam: null },
      columns: [
        { key: "code", label: a("code"), render: (r) => <><Ltr>{code6(r.code)}</Ltr>{r.deletedAt && <> {deleted(a("deletedBadge"))}</>}</> },
        { key: "accountName", label: a("accountName") },
        { key: "bankName", label: a("bankId") },
        { key: "commission", label: a("commission"), render: (r) => (r.commission == null ? "" : <Ltr>{dec2(r.commission)}</Ltr>) },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    },
    {
      id: "balances", label: bb("title"), keys: ["bank-accounts/bank-balances"],
      create: [],   // a report: no add button
      endpoint: "/reports/bank-balances", rowKey: "bankAccountId", runLabel: rep("run"),
      filters: [
        { name: "branchId", label: bb("branchId"), type: "select", optionsFrom: branchSpec, placeholder: ALL },
        { name: "bankId", label: bb("bankId"), type: "select", optionsFrom: bankSpec, placeholder: ALL },
        { name: "fromDate", label: bb("fromDate"), type: "date" },
        { name: "untilDate", label: bb("untilDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("untilBeforeFrom") : null) },
      ],
      sort: { default: { key: "code", dir: "asc" } },
      paging: { sizes: [10, 25, 50, 100], size: 25 },
      columns: balanceCols,
      onRow: false,
      footer: (_rows, answer) => {
        const totals = answer?.totals;
        if (!totals) return null;
        return balanceCols.map((c, i) => {
          const v = ({ total: totals.total } as Record<string, unknown>)[c.key];
          return <Td key={c.key} num={["money", "weight", "int"].includes(c.type ?? "")}>{i === 0 ? rep("total") : v === undefined ? "" : cellNode({ key: "v", type: c.type }, { v }, tr)}</Td>;
        });
      },
    },
  ];

  const stamp = (x: unknown) => (x ? <Ltr>{String(x).slice(0, 19).replace("T", " ")}</Ltr> : "");
  const bankFields = (): FieldConfig[] => [
    { name: "bankCode", label: b("bankCode"), type: "code", documentType: "bank", hint: b("autoHint") },
    { name: "bankName", label: b("bankName"), type: "text", required: true, maxLength: 100 },   // backend: trim, 1..100, unique (bankNameTaken)
  ];
  // Commission: exact decimal TEXT (not piastres): up to 10 digits and at most 2 decimals; Arabic-Indic digits and ٫ are accepted. Blank sends null.
  const accountFields = (): FieldConfig[] => [
    { name: "code", label: a("code"), type: "code", documentType: "bank_account", hint: a("autoHint") },
    { name: "accountName", label: a("accountName"), type: "text", required: true, maxLength: 100 },
    { name: "bankId", label: a("bankId"), type: "select", required: true, optionsFrom: bankSpecNewest },   // live banks only
    { name: "commission", label: a("commission"), type: "text", maxLength: 13, placeholder: "0.00", validate: (v) => (v && !COMMISSION.test(latinNumber(v)) ? t("common", "fieldErrors.invalid") : null) },
  ];
  const accountPayload = (v: Row) => ({ accountName: v.accountName, bankId: v.bankId, commission: v.commission ? latinNumber(v.commission) : null });

  return {
    id: "banks",
    title: b("title"),
    unit: L("بنك", "bank"),
    keys: ["bank-accounts/banks", "bank-accounts/banks-list", "bank-accounts/bank-accounts", "bank-accounts/bank-accounts-list", "bank-accounts/bank-balances"],
    views: views.map((v) => (v.onRow === undefined ? { ...v, onRow: (row, h) => h.open(row) } : v)),
    record: {
      title: (r) => (isBank(r) ? `${b("recordNo")} ${code6(r.bankCode)}` : `${a("recordNo")} ${code6(r.code)}`),
      endpoint: (r) => (isBank(r) ? `/banks/${r.id}` : `/bank-accounts/${r.id}`),
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{b("deletedBadge")}</div>}
          <Section title={isBank(r) ? b("details") : a("details")}>
            {isBank(r)
              ? <><Kv k={b("bankCode")}><Ltr>{code6(r.bankCode)}</Ltr></Kv><Kv k={b("bankName")}>{r.bankName}</Kv></>
              : <><Kv k={a("code")}><Ltr>{code6(r.code)}</Ltr></Kv><Kv k={a("accountName")}>{r.accountName}</Kv><Kv k={a("bankId")}>{r.bankName}</Kv><Kv k={a("commission")}>{r.commission == null ? "" : <Ltr>{dec2(r.commission)}</Ltr>}</Kv></>}
            <Kv k={L("تاريخ الإضافة", "Created")}>{stamp(r.createdAt)}</Kv>
            <Kv k={L("آخر تعديل", "Updated")}>{stamp(r.updatedAt)}</Kv>
            {r.deletedAt && <Kv k={b("deleted")}>{stamp(r.deletedAt)}</Kv>}
          </Section>
        </>
      ),
      // Edit is not offered on a deleted record.
      actions: [{ id: "edit", label: L("تعديل", "Edit"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm(isBank(r) ? "editBank" : "editAccount", r); } }],
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => (isBank(r) ? `/banks/${r.id}` : `/bank-accounts/${r.id}`),
        // The backend refuses: a bank while live accounts belong to it (bankInUse), an account with any non-zero balance (bankAccountNotEmpty).
        confirm: (r) => (isBank(r)
          ? { title: b("deleteTitle", { code: code6(r.bankCode) }), text: b("deleteBody") }
          : { title: a("deleteTitle", { code: code6(r.code) }), text: `${a("deleteBody")} ${L("لا يمكن حذف حساب بنكي رصيده لا يساوي صفراً.", "A bank account whose balance is not zero cannot be deleted.")}` }),
      },
    },
    forms: {
      createBank: { title: b("new"), path: () => "/banks", method: "POST", fields: bankFields() },
      editBank: { title: (r) => b("editTitle", { code: code6(r!.bankCode) }), path: (r) => `/banks/${r!.id}`, method: "PATCH", load: (r) => ({ bankCode: r!.bankCode, bankName: r!.bankName }), fields: bankFields() },
      createAccount: { title: a("new"), path: () => "/bank-accounts", method: "POST", toPayload: accountPayload, fields: accountFields() },
      editAccount: {
        title: (r) => a("editTitle", { code: code6(r!.code) }), path: (r) => `/bank-accounts/${r!.id}`, method: "PATCH", toPayload: accountPayload,
        load: (r) => ({ code: r!.code, accountName: r!.accountName, bankId: r!.bankId, commission: r!.commission == null ? "" : dec2(r!.commission) }),
        fields: accountFields(),
      },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} />; }
