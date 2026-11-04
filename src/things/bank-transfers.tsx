"use client";
// التحويل بين حسابين: money/bank-transfers = bank-movements/{bank-transfers, bank-transfers-history}. Ported from docs/nav-preview/app/things/bank-transfers.js.
// Payload {branchId, date, fromAccountId, toAccountId, amount (integer piastres), note ('' when empty)}. Nothing refuses a transfer below zero.
import { useMemo } from "react";
import type { LookupSpec, MakeConfig, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { dateText, piastresText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Me } from "@/stores/ui";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { useAccess } from "./sales-access";
import { branchSpec, code6, dict } from "./money-shared";

const accountOptions: LookupSpec = { path: "/bank-accounts", value: "id", label: (r) => `${r.accountName} · ${code6(r.code)}`, query: { order: "newest" } };

export function buildConfig(tr: Tr, me?: Me | null): ThingConfig {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("bank-movements", `bankTransfers.${k}`, v);
  const { rep } = dict(tr);

  const history: ViewConfig = {
    id: "history", label: m("listTitle"), keys: ["bank-movements/bank-transfers-history"],
    create: [{ form: "create", label: m("add"), keys: ["bank-movements/bank-transfers"] }],
    endpoint: "/bank-transfers",
    search: { param: "search", placeholder: m("searchPlaceholder") },
    chips: [{ id: "all", label: rep("all") }, { id: "deleted", label: m("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
    filters: [
      { name: "fromDate", label: m("fromDate"), type: "date" },
      { name: "toDate", label: m("toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) },
    ],
    paging: { sizeParam: null },      // the list takes only `page`
    columns: [
      { key: "documentNumber", label: m("documentNumber"), render: (r) => <><Ltr>{code6(r.documentNumber)}</Ltr>{r.deletedAt && <> <span className="st off"><i />{m("deletedBadge")}</span></>}</> },
      { key: "branchName", label: m("branchName") },
      { key: "date", label: m("date"), type: "date" },
      { key: "fromAccountName", label: m("fromAccountName") },
      { key: "toAccountName", label: m("toAccountName") },
      { key: "note", label: m("note") },
      { key: "amount", label: m("amount"), type: "money" },
    ],
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    onRow: (row, h) => h.open(row),
  };

  return {
    id: "bank-transfers",
    title: m("title"),
    unit: L("تحويل", "transfer"),
    keys: ["bank-movements/bank-transfers", "bank-movements/bank-transfers-history"],
    views: [history],
    record: {
      title: (r) => `${m("recordNo")} ${code6(r.documentNumber)}`,
      endpoint: (r) => `/bank-transfers/${r.id}`,
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{m("deletedBadge")}</div>}
          <Section title={m("details")}>
            <Kv k={m("documentNumber")}><Ltr>{code6(r.documentNumber)}</Ltr></Kv><Kv k={m("branchName")}>{r.branchName}</Kv><Kv k={m("date")}><Ltr>{dateText(r.date)}</Ltr></Kv>
            <Kv k={m("fromAccountName")}>{r.fromAccountName}</Kv><Kv k={m("toAccountName")}>{r.toAccountName}</Kv><Kv k={m("amount")}><Ltr>{piastresText(r.amount)}</Ltr></Kv><Kv k={m("note")}>{r.note}</Kv>
          </Section>
          <div className="note">{m("fixedNote")}</div>
        </>
      ),
      // Delete undoes both sides at once (From balance rises, To falls); no balance check. Saved transfers are never edited.
      remove: { when: (r) => !r.deletedAt, path: (r) => `/bank-transfers/${r.id}`, confirm: (r) => ({ title: m("deleteTitle", { code: code6(r.documentNumber) }), text: m("deleteBody") }) },
    },
    forms: {
      create: {
        title: m("new"), path: () => "/bank-transfers", method: "POST",
        load: () => ({ branchId: me?.userType === "user" ? me.branchId ?? "" : "", date: today() }),
        toPayload: (v) => ({ branchId: v.branchId, date: v.date, fromAccountId: v.fromAccountId, toAccountId: v.toAccountId, amount: typedPiastres(v.amount), note: v.note ?? "" }),
        fields: [
          { name: "documentNumber", label: m("documentNumber"), type: "code", documentType: "bank_transfer", branchField: "branchId", dateField: "date", hint: m("autoHint") },
          { name: "branchId", label: m("branchId"), type: "select", required: true, optionsFrom: branchSpec },
          { name: "date", label: m("date"), type: "date", required: true },
          { name: "fromAccountId", label: m("fromAccountId"), type: "select", required: true, optionsFrom: accountOptions },
          // The same account is refused with its sameAccount text (the backend refuses it too).
          { name: "toAccountId", label: m("toAccountId"), type: "select", required: true, optionsFrom: accountOptions, validate: (v, all) => (v && v === all.fromAccountId ? m("sameAccount") : null) },
          { name: "amount", label: m("amount"), type: "text", required: true, maxLength: 17, placeholder: "0.00", validate: (v) => ((typedPiastres(v) ?? 0) > 0 ? null : m("amountInvalid")) },
          { name: "note", label: m("note"), type: "text", maxLength: 250 },   // optional here (required on a movement)
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
