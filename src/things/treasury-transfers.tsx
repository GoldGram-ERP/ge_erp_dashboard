"use client";
import { DataTable, Input, SortedTable, Status, Td, Tr as TRow } from "@/components/ui";
// تحويلات الخزن: money/transfers = treasuries/{treasury-transfers, in-transit}. Ported from docs/nav-preview/app/things/treasury-transfers.js.
// Views: transfers by box (incoming, sent, all) and status, the in-transit report. A row opens the transfer with its pieces, gold lines and state.
// State machine: sent -> accepted | refused | cancelled, final after that. Accept / refuse / cancel are the record's actions; Send is its own page.
import { useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { Column, MakeConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { dateTimeText, intText, milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { useAccess } from "./sales-access";
import { branchSpec, code6, dict, foot, goldNode } from "./money-shared";
import { SendTransferForm } from "./treasury-transfer-send";

const STATES = ["sent", "accepted", "refused", "cancelled"];
const TONE: Record<string, "info" | "good" | "warn" | "off"> = { sent: "info", accepted: "good", refused: "warn", cancelled: "off" };

// The box the list was last read for: the dashboard offers Accept / Refuse only in Incoming and Cancel only in Sent.
let lastBox = "incoming";
// One Idempotency-Key per action, kept while it is retried.
const keys = new Map<string, string>();

// Incoming check (screen only, nothing is sent): type or scan a piece code of this transfer to tick it.
function CheckBox({ r, m }: { r: Row; m: (k: string, v?: Record<string, string>) => string }) {
  const [note, setNote] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  if (!(lastBox === "incoming" && r.status === "sent" && r.pieces.length)) return null;
  const take = (raw: string) => {
    if (!raw) return;
    const code = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
    if (!/^[A-Za-z0-9 .]{1,20}$/.test(code)) return setNote(m("notOurCode"));
    const p = (r.pieces as Row[]).find((x) => x.pieceCode.toUpperCase() === code.toUpperCase());
    if (!p) return setNote(m("notInTransfer", { code }));
    const next = ticked.includes(p.pieceCode) ? ticked : [...ticked, p.pieceCode];
    setTicked(next);
    setNote(`${m("checked", { code: p.pieceCode })} ${m("checkedCount", { count: String(next.length), total: String(r.pieces.length) })}`);
  };
  return (
    <>
      <div className="field" data-k="chk">
        <label htmlFor="chk">{m("checkPiece")}</label>
        <Input id="chk" autoComplete="off" onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); const el = e.currentTarget; const v = el.value.trim(); el.value = ""; take(v); }} />
        <div className="help" id="chk-note" role="status" aria-live="polite">{note}</div>
      </div>
      <PieceTicks r={r} ticked={ticked} m={m} />
    </>
  );
}
function PieceTicks({ r, ticked, m }: { r: Row; ticked: string[]; m: (k: string) => string }) {
  if (!ticked.length) return null;
  return <div>{ticked.map((c) => <Status key={c} tone="good" data-checked={c}>{c} {m("checkedMark")}</Status>)}</div>;
}

export const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("treasury-transfers", k, v);
  const { rep, tr: trr } = dict(tr);
  const ALL = rep("all");
  const statuses: Column["statuses"] = Object.fromEntries(STATES.map((s) => [s, [m(`status.${s}`), TONE[s]]]));
  const place = (x: Row) => <>{x.treasuryName} <span className="mute">· {x.branchName}</span></>;

  // The boxes of the dashboard: Incoming (waiting for me: box=incoming and status=sent) and Sent (box=sent). "All" and the status
  // and date filters are accepted by the API though the dashboard does not offer them.
  const list: ViewConfig = {
    id: "list", label: m("title"), keys: ["treasuries/treasury-transfers"],
    load: (query, { signal } = {}) => { lastBox = String(query.box ?? "incoming"); return api("/treasury-transfers", { query, signal }); },
    rowKey: "id",
    chips: [
      { id: "incoming", label: m("incoming"), query: { box: "incoming", status: "sent" } },
      { id: "sent", label: m("sent"), query: { box: "sent" } },
      { id: "all", label: ALL, query: { box: "all" } },
    ],
    filters: [
      { name: "status", label: L("الحالة", "Status"), type: "select", options: STATES.map((s) => [s, m(`status.${s}`)] as [string, string]), placeholder: ALL },
      { name: "fromDate", label: trr("fromDate"), type: "date" },
      { name: "toDate", label: trr("toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) },
    ],
    paging: { sizeParam: null, sizes: [20], size: 20 },
    serverSort: { on: true, columns: { sentAt: "sentAt", documentNumber: "documentNumber", status: "status" } },   // the backend takes sort/dir for this list (ge_erp_backend 0.1.23); see ViewConfig.serverSort
    columns: [
      { key: "documentNumber", label: L("رقم التحويل", "Transfer no."), render: (r) => <Ltr>{code6(r.documentNumber)}</Ltr> },
      { key: "status", label: L("الحالة", "Status"), type: "status", statuses },
      { key: "from", label: trr("columns.from"), render: (r) => place(r.from) },
      { key: "to", label: trr("columns.to"), render: (r) => place(r.to) },
      { key: "pieceCount", label: trr("columns.pieceCount"), type: "int" },
      { key: "pieceWeightMg", label: trr("columns.pieceWeight"), type: "weight" },
      { key: "gold", label: trr("columns.gold"), className: "num", render: (r) => goldNode(r.gold) },
      { key: "amountPiastres", label: trr("columns.cash"), type: "money" },
      { key: "sentAt", label: trr("columns.sentAt"), type: "datetime" },
    ],
  };

  // In transit: the sent transfers not yet settled, with their age. Every row at once.
  const ic = (key: string, type?: Column["type"], extra: Partial<Column> = {}): Column => ({ key, label: trr(`columns.${key === "pieceWeightMg" ? "pieceWeight" : key === "amountPiastres" ? "cash" : key}`), type, ...extra });
  const itCols: Column[] = [
    ic("documentNumber", undefined, { render: (r) => <Ltr>{code6(r.documentNumber)}</Ltr> }),
    ic("from", undefined, { render: (r) => place(r.from) }),
    ic("to", undefined, { render: (r) => place(r.to) }),
    ic("sentAt", "datetime"),
    ic("ageDays", "int", { render: (r) => trr("days", { count: String(r.ageDays) }) }),
    ic("pieceCount", "int"),
    ic("pieceWeightMg", "weight"),
    ic("gold", undefined, { className: "num", render: (r) => goldNode(r.gold) }),
    ic("amountPiastres", "money"),
  ];
  const inTransit: ViewConfig = {
    id: "in-transit", label: t("treasury-reports", "inTransit.title"), keys: ["treasuries/in-transit"],
    endpoint: "/reports/in-transit", rowKey: "id", runLabel: rep("run"),
    filters: [
      { name: "branchId", label: trr("branch"), type: "select", optionsFrom: branchSpec, placeholder: ALL },
      { name: "olderThanDays", label: trr("olderThanDays"), type: "number", min: 0, help: trr("daysInvalid") },
    ],
    paging: false, columns: itCols,
    footer: (_rows, a) => foot(itCols, rep("total"), a?.totals ? { pieceCount: intText(a.totals.pieceCount), pieceWeightMg: milligramsText(a.totals.pieceWeightMg), amountPiastres: piastresText(a.totals.amountPiastres) } : {}),
  };

  // accept / refuse: the server says canAccept (handles the TO treasury, and is not the sender: four eyes, even an Admin);
  // cancel: the server says canCancel (the sender or an Admin). No confirmation dialog, as in the dashboard.
  async function settle(r: Row, action: "accept" | "cancel", h: { reload: () => void; close: () => void; toast: (s: string) => void }) {
    const k = `${r.id}:${action}`;
    if (!keys.has(k)) keys.set(k, newSaveKey());
    try {
      const a = await api(`/treasury-transfers/${r.id}/${action}`, { method: "POST", body: {}, saveKey: keys.get(k) });
      keys.delete(k);
      h.toast(m(`done.${a?.status ?? { accept: "accepted", cancel: "cancelled" }[action]}`, { number: code6(r.documentNumber) }));
      h.close(); h.reload();
    } catch (e) {
      if (!(e instanceof ApiFailure) || (!e.unreachable && e.error.message !== "saveInProgress")) keys.delete(k);   // a refusal is final
      if (e instanceof ApiFailure && e.error.message === "transferNotPending") { h.close(); h.reload(); }   // someone settled it: show the new state
      throw e;
    }
  }
  const canAnswer = (r: Row) => r.status === "sent" && r.canAccept && lastBox !== "sent";

  return {
    id: "transfers",
    title: m("title"),
    unit: L("تحويل", "transfer"),
    keys: ["treasuries/treasury-transfers", "treasuries/in-transit"],
    views: [list, inTransit].map((v) => ({ ...v, onRow: (row: Row, h: { open: (r: Row) => void }) => h.open(row) })),
    // Send is its own page; after it the Sent box opens.
    create: [{ form: "send", label: m("send"), keys: ["treasuries/treasury-transfers"] }],
    record: {
      title: (r) => m("transferNo", { number: code6(r.documentNumber ?? "") }),
      endpoint: (r) => `/treasury-transfers/${r.id}`,
      render: (r) => (
        <>
          <Section title={m("transferNo", { number: code6(r.documentNumber) })}>
            <Kv k={L("الحالة", "Status")}><span className={`st ${TONE[r.status] ?? "off"}`}><i />{m(`status.${r.status}`)}</span></Kv>
            <Kv k={m("from")}>{place(r.from)}</Kv><Kv k={m("to")}>{place(r.to)}</Kv>
            <Kv k={trr("columns.sentAt")}><Ltr>{dateTimeText(r.sentAt)}</Ltr></Kv><Kv k={m("sentBy")}>{r.sentByName}</Kv>
            {r.settledAt && <Kv k={m("settledBy")}>{r.settledByName ?? ""} <span className="mute" dir="ltr">{dateTimeText(r.settledAt)}</span></Kv>}
            {r.refuseReason && <Kv k={m("refuseReason")}><bdi dir="auto">{r.refuseReason}</bdi></Kv>}
          </Section>
          <Section title={L("المحتويات", "Contents")}>
            <Kv k={trr("columns.pieceCount")}><Ltr>{intText(r.pieceCount)}</Ltr></Kv>
            <Kv k={trr("columns.pieceWeight")}><Ltr>{milligramsText(r.pieceWeightMg)}</Ltr></Kv>
            <Kv k={m("amount")}><Ltr>{piastresText(r.amountPiastres)}</Ltr></Kv>
          </Section>
          {r.pieces.length > 0 && (
            <Section title={m("piecesList")}>
              <SortedTable tableId="transfer-pieces" rows={r.pieces as Row[]} rowKey={(p) => p.pieceCode} rowProps={(p) => ({ "data-pc": p.pieceCode })} cols={[
                { key: "code", label: m("pieceCode"), kind: "text", get: (p) => p.pieceCode, show: (p) => p.pieceCode, ltr: true },
                { key: "item", label: L("الصنف", "Item"), kind: "text", get: (p) => p.itemName, show: (p) => p.itemName },
                { key: "karat", label: m("karat"), kind: "text", get: (p) => p.karat, show: (p) => p.karat, ltr: true },
                { key: "weight", label: m("weightGrams"), kind: "number", get: (p) => p.weightMg, show: (p) => milligramsText(p.weightMg), num: true }]} />
            </Section>
          )}
          {r.gold.length > 0 && <Section title={m("bulkGold")}>{(r.gold as Row[]).map((g) => <Kv key={g.karat} k={`${g.karat}K`}><Ltr>{milligramsText(g.weightMg)}</Ltr></Kv>)}</Section>}
          <CheckBox r={r} m={m} />
          {r.status === "sent" && lastBox === "incoming" && !r.canAccept && <div className="note">{m("cannotAccept")}</div>}
        </>
      ),
      actions: [
        { id: "accept", label: m("accept"), when: canAnswer, run: (r, h) => settle(r, "accept", h) },
        // Refuse asks for the reason first (1..500 characters) in its own form.
        { id: "refuse", label: m("refuse"), danger: true, when: canAnswer, run: (r, h) => { h.close(); h.openForm("refuse", r); } },
        { id: "cancel", label: m("cancel"), danger: true, when: (r) => r.status === "sent" && r.canCancel && lastBox !== "incoming", run: (r, h) => settle(r, "cancel", h) },
      ],
    },
    forms: {
      send: { display: "page", title: m("sendTitle"), fields: [], path: () => "/treasury-transfers", custom: SendTransferForm },
      refuse: {
        title: m("refuse"), method: "POST", path: (r) => `/treasury-transfers/${r!.id}/refuse`,
        toPayload: (v) => ({ reason: String(v.reason).trim() }),
        fields: [{ name: "reason", label: m("refuseReason"), type: "textarea", required: true, maxLength: 500, wide: true }],
      },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
