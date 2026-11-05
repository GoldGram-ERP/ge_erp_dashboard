"use client";
import { DataTable, Status, Td, Tr } from "@/components/ui";
// A piece's whole story (the lead, 2026-11-02): where it is now and what it was, then every sale and return, then every branch transfer. Read only; nothing here
// puts the piece on an invoice. Drawn inline (no side sheet). A number opens its record when the person's screens allow it.
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Row } from "@/lib/engine-types";
import { dateText, milligramsText, piastresText } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { Kv, Ltr, Section } from "@/components/engine";
import { code6 } from "./sales-form-parts";

type Col = { key: string; label: string; end?: boolean; draw: (r: Row) => ReactNode };

function History({ name, title, empty, cols, rows, keyOf }: { name: string; title: string; empty: string; cols: Col[]; rows: Row[]; keyOf: (r: Row) => string }) {
  return (
    <section data-history-section={name} aria-labelledby={`history-${name}`}>
      <h3 id={`history-${name}`} className="grp-title">{title}</h3>
      {rows.length === 0 ? <p data-history-empty className="hint">{empty}</p> : (
        <DataTable style={{ overflowX: "auto" }} head={cols.map((c) => ({ label: c.label, num: c.end }))}>
          {rows.map((r) => <Tr key={keyOf(r)} data-history-row>{cols.map((c) => <Td key={c.key} num={c.end}>{c.draw(r)}</Td>)}</Tr>)}
        </DataTable>
      )}
    </section>
  );
}

export function PieceStory({ r }: { r: Row }) {
  const tr = useT();
  const { data: me } = useMe();
  const t = (k: string, v?: Record<string, string>) => tr.t("gold-sales", `pieceLookUp.${k}`, v);
  const may = (...keys: string[]) => keys.some((k) => me?.screens.includes(k));
  const grams = (mg: unknown) => (mg === null || mg === undefined ? "—" : <Ltr>{milligramsText(mg)}</Ltr>);
  const money = (p: unknown) => <Ltr>{piastresText(p)}</Ltr>;
  const day = (d: unknown) => <Ltr>{dateText(d)}</Ltr>;
  const name = (s: unknown) => (s ? <span>{String(s)}</span> : "—");
  const link = (route: string | null, text: string) => (route ? <Link href={route} aria-label={t("openRecord", { number: text })}><Ltr>{text}</Ltr></Link> : <Ltr>{text}</Ltr>);

  if (r.kind === "customerPiece") {
    return (
      <div data-customer-piece>
        <div className="note">{t("notStock")}</div>
        <Section title={t("customerPieceTitle")}>
          <Kv k={t("pieceCode")}><Ltr>{r.pieceCode}</Ltr></Kv><Kv k={t("karat")}><Ltr>{r.karat}</Ltr></Kv><Kv k={t("weight")}>{grams(r.weight)}</Kv><Kv k={t("description")}>{r.description ?? ""}</Kv>
        </Section>
      </div>
    );
  }
  const state = ({ available: t("stateAvailable"), sold: t("stateSold"), inTransfer: t("stateTransfer") } as Record<string, string>)[r.state] ?? "";
  const sales: Col[] = [
    { key: "branch", label: t("branch"), draw: (x) => name(x.branchName) },
    { key: "pieceCode", label: t("pieceCode"), draw: (x) => <Ltr>{x.pieceCode}</Ltr> },
    { key: "documentNumber", label: t("invoiceOrReturnNumber"), draw: (x) => (
      <>{link(x.kind === "sale" ? (may("gold-sales/sales-invoices-list", "gold-sales/sales-invoices") ? `/sales/invoices?open=${x.id}` : null) : may("gold-sales/returns-list", "gold-sales/returns") ? `/sales/returns?open=${x.id}` : null, code6(x.documentNumber))}
        {x.kind === "return" && <> <Status tone="warn">{t("returnBadge")}</Status></>}{x.deleted && <> <Status tone="off">{t("deletedBadge")}</Status></>}</>) },
    { key: "date", label: t("saleOrReturnDate"), draw: (x) => day(x.date) },
    { key: "customerName", label: t("customerName"), draw: (x) => name(x.customerName) },
    { key: "itemName", label: t("itemName"), draw: (x) => name(x.itemName) },
    { key: "karat", label: t("karat"), draw: (x) => <Ltr>{x.karat}</Ltr> },
    { key: "weight", label: t("totalWeight"), end: true, draw: (x) => grams(x.weight) },
    { key: "weight21", label: t("weight21"), end: true, draw: (x) => grams(x.weight21) },
    { key: "price", label: t("price"), end: true, draw: (x) => money(x.price) },
  ];
  const transfers: Col[] = [
    { key: "documentNumber", label: t("transferNumber"), draw: (x) => link(may("treasuries/treasury-transfers") ? `/money/transfers?open=${x.id}` : null, code6(x.documentNumber)) },
    { key: "fromBranchName", label: t("fromBranch"), draw: (x) => name(x.fromBranchName) },
    { key: "toBranchName", label: t("toBranch"), draw: (x) => name(x.toBranchName) },
    { key: "transferredOn", label: t("transferredOn"), draw: (x) => day(x.transferredOn) },
    { key: "receivedOn", label: t("receivedOn"), draw: (x) => (x.receivedOn ? day(x.receivedOn) : <span className="hint">{t("notReceived")}</span>) },
    { key: "pieceCode", label: t("pieceCode"), draw: (x) => <Ltr>{x.pieceCode}</Ltr> },
    { key: "itemName", label: t("itemName"), draw: (x) => name(x.itemName) },
    { key: "karat", label: t("karat"), draw: (x) => <Ltr>{x.karat}</Ltr> },
    { key: "weight", label: t("totalWeight"), end: true, draw: (x) => grams(x.weight) },
    { key: "weight21", label: t("weight21"), end: true, draw: (x) => grams(x.weight21) },
  ];
  return (
    <div data-piece-history>
      <Section title={t("latestTitle")}>
        <Kv k={t("branch")}>{name(r.branchName)}</Kv><Kv k={t("pieceCode")}><Ltr>{r.pieceCode}</Ltr></Kv>
        <Kv k={t("purchaseInvoiceNumber")}><Ltr>{code6(r.purchaseInvoiceNumber)}</Ltr></Kv><Kv k={t("codedOrPurchasedOn")}>{day(r.codedOrPurchasedOn)}</Kv>
        <Kv k={t("itemName")}>{name(r.itemName)}</Kv><Kv k={t("karat")}><Ltr>{r.karat}</Ltr></Kv><Kv k={t("quantity")}><Ltr>{r.quantity}</Ltr></Kv>
        <Kv k={t("totalWeight")}>{grams(r.weight)}</Kv><Kv k={t("weight21")}>{grams(r.weight21)}</Kv><Kv k={t("state")}>{state}</Kv>
        <Kv k={t("goldPrice21k")}>{money(r.goldPrice21k)}</Kv>
        {r.state === "available" && r.livePrice !== null && r.livePrice !== undefined && <Kv k={t("livePrice")}>{money(r.livePrice)}</Kv>}
      </Section>
      <History name="sales" title={t("salesTitle")} empty={t("salesEmpty")} cols={sales} rows={r.sales ?? []} keyOf={(x) => `${x.kind}-${x.id}`} />
      <History name="transfers" title={t("transfersTitle")} empty={t("transfersEmpty")} cols={transfers} rows={r.transfers ?? []} keyOf={(x) => x.id} />
    </div>
  );
}
