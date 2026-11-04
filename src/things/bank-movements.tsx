"use client";
// الحركات البنكية: money/bank-movements = bank-movements/{bank-movements, bank-movements-history, bank-statement}. Ported from docs/nav-preview/app/things/bank-movements.js.
// Views: movements history (search + dates + deleted only), bank statement report (account required, branch, dates, accounting type).
// Writes: add movement, delete. A saved movement is never edited (no PATCH route). Skipped (queued jobs): statement print and Excel.
import { useMemo } from "react";
import type { Column, FilterConfig, LookupSpec, MakeConfig, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { dateText, piastresText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Me } from "@/stores/ui";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { useAccess } from "./sales-access";
import { branchSpec, code6, dict, foot } from "./money-shared";

const accountSpec: LookupSpec = { path: "/bank-accounts", value: "id", label: (r) => `${r.accountName} · ${r.bankName}` };
const accountOptions: LookupSpec = { path: "/bank-accounts", value: "id", label: (r) => `${r.accountName} · ${code6(r.code)}`, query: { order: "newest" } };

export function buildConfig(tr: Tr, me?: Me | null): ThingConfig {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("bank-movements", `bankMovements.${k}`, v);
  const s = (k: string) => t("bank-movements", `bankStatement.${k}`);
  const { rep } = dict(tr);
  const ALL = rep("all");
  const from = (): FilterConfig => ({ name: "fromDate", label: m("fromDate"), type: "date" });
  const to = (): FilterConfig => ({ name: "toDate", label: m("toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) });

  const history: ViewConfig = {
    id: "history", label: m("listTitle"), keys: ["bank-movements/bank-movements-history"],
    create: [{ form: "create", label: m("add"), keys: ["bank-movements/bank-movements"] }],
    endpoint: "/bank-movements",
    search: { param: "search", placeholder: m("searchPlaceholder") },
    chips: [{ id: "all", label: ALL }, { id: "deleted", label: m("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
    filters: [from(), to()],
    paging: { sizeParam: null },      // the list takes only `page`; its size is fixed
    columns: [
      { key: "documentNumber", label: m("documentNumber"), render: (r) => <><Ltr>{code6(r.documentNumber)}</Ltr>{r.deletedAt && <> <span className="st off"><i />{m("deletedBadge")}</span></>}</> },
      { key: "branchName", label: m("branchName") },
      { key: "bankAccountName", label: m("bankAccountName") },
      { key: "movementType", label: m("movementType"), type: "status", statuses: { deposit: [m("deposit"), "good"], withdraw: [m("withdraw"), "warn"] } },
      { key: "date", label: m("date"), type: "date" },
      { key: "note", label: m("note") },
      { key: "amount", label: m("amount"), type: "money" },
    ],
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    onRow: (row, h) => h.open(row),
  };

  const types = ["deposit", "withdraw", "transferIn", "transferOut", "expense", "expenseRefund", "salesInvoice", "reservation", "salesReturn"];
  const sc = (key: string, type?: Column["type"], extra: Partial<Column> = {}): Column => ({ key, label: s(`columns.${key}`), type, ...extra });
  const cols: Column[] = [
    sc("branch"), sc("date", "date"), sc("debit", "money"), sc("credit", "money"), sc("balance", "money"),
    sc("movementType", "status", { statuses: Object.fromEntries(types.map((k) => [k, [s(`types.${k}`), k.endsWith("In") || k === "deposit" ? "good" : "info"]])) as Column["statuses"] }),
    sc("note"), sc("number", undefined, { get: (r) => code6(r.number) }),
  ];
  const statement: ViewConfig = {
    id: "statement", label: s("title"), keys: ["bank-movements/bank-statement"],
    create: [],   // a report: no add button
    endpoint: "/reports/bank-statement", rowKey: "id", runLabel: rep("run"),
    filters: [
      { name: "bankAccountId", label: s("bankAccountId"), type: "select", optionsFrom: accountSpec, required: true, validate: (v) => (v ? null : s("accountRequired")) },
      { name: "branchId", label: s("branchId"), type: "select", optionsFrom: branchSpec, placeholder: ALL },
      from(), to(),
      { name: "accountingType", label: rep("accountingType"), type: "select", options: [["debit", rep("debit")], ["credit", rep("credit")]], placeholder: ALL },
    ],
    sort: { default: { key: "date", dir: "asc" } },
    paging: { sizes: [10, 25, 50, 100], size: 25 },
    columns: cols, onRow: false,
    answerExtra: (a) => (a ? `${s("balanceBefore")} ${piastresText(a.balanceBefore ?? 0)}` : ""),
    footer: (_rows, a) => foot(cols, rep("total"), a?.totals ? { debit: piastresText(a.totals.debit), credit: piastresText(a.totals.credit) } : {}),
  };

  // Payload {branchId, bankAccountId, movementType, date, amount (integer piastres), note}. documentNumber is given by the system.
  // The backend does not check that the account belongs to the branch; a withdrawal below zero is allowed.
  return {
    id: "bank-movements",
    title: m("title"),
    unit: L("حركة", "movement"),
    keys: ["bank-movements/bank-movements", "bank-movements/bank-movements-history", "bank-movements/bank-statement"],
    views: [history, statement],
    record: {
      title: (r) => `${m("recordNo")} ${code6(r.documentNumber)}`,
      endpoint: (r) => `/bank-movements/${r.id}`,
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{m("deletedBadge")}</div>}
          <Section title={m("details")}>
            <Kv k={m("documentNumber")}><Ltr>{code6(r.documentNumber)}</Ltr></Kv><Kv k={m("branchName")}>{r.branchName}</Kv><Kv k={m("bankAccountName")}>{r.bankAccountName}</Kv>
            <Kv k={m("movementType")}>{m(r.movementType)}</Kv><Kv k={m("date")}><Ltr>{dateText(r.date)}</Ltr></Kv><Kv k={m("amount")}><Ltr>{piastresText(r.amount)}</Ltr></Kv><Kv k={m("note")}>{r.note}</Kv>
          </Section>
          <div className="note">{m("fixedNote")}</div>
        </>
      ),
      // Delete is the whole undo: the balance is summed from live movements. No balance check.
      remove: { when: (r) => !r.deletedAt, path: (r) => `/bank-movements/${r.id}`, confirm: (r) => ({ title: m("deleteTitle", { code: code6(r.documentNumber) }), text: m("deleteBody") }) },
    },
    forms: {
      create: {
        title: m("new"), path: () => "/bank-movements", method: "POST",
        // A User starts on their own branch; date starts today.
        load: () => ({ branchId: me?.userType === "user" ? me.branchId ?? "" : "", date: today() }),
        toPayload: (v) => ({ branchId: v.branchId, bankAccountId: v.bankAccountId, movementType: v.movementType, date: v.date, amount: typedPiastres(v.amount), note: v.note }),
        fields: [
          { name: "documentNumber", label: m("documentNumber"), type: "code", documentType: "bank_movement", branchField: "branchId", dateField: "date", hint: m("autoHint") },
          { name: "branchId", label: m("branchId"), type: "select", required: true, optionsFrom: branchSpec },
          { name: "bankAccountId", label: m("bankAccountId"), type: "select", required: true, optionsFrom: accountOptions },
          { name: "movementType", label: m("movementType"), type: "select", required: true, options: [["withdraw", m("withdraw")], ["deposit", m("deposit")]] },
          { name: "date", label: m("date"), type: "date", required: true },
          // text, not money, so the field error is the dashboard's own amountInvalid (zero, signs, letters, over 2 decimals).
          { name: "amount", label: m("amount"), type: "text", required: true, maxLength: 17, placeholder: "0.00", validate: (v) => ((typedPiastres(v) ?? 0) > 0 ? null : m("amountInvalid")) },
          { name: "note", label: m("note"), type: "text", required: true, maxLength: 250 },
        ],
      },
    },
  };
}

export const makeConfig: MakeConfig = (tr) => buildConfig(tr);

export default function Page() {
  const { data: me } = useMe();
  const make = useMemo(() => (tr: Tr) => buildConfig(tr, me), [me]);
  return <ThingPage make={make} access={useAccess()} />;
}
