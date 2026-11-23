"use client";
import { Button, DataTable, Input, Td, Tr } from "@/components/ui";
// Purchase coding for one invoice, as a full page (forms.code). Port of gold-purchases-coding.js.
// Each line not yet coded gets one piece per unit of its quantity. One source (owner, 2026-11-04): a piece takes the item's weight and
// workmanship per gram, typed on the Items screen only; here they are read only and nothing is typed. The piece code is the system's.
// Save codes all open lines at once (POST /purchase-coding/invoices/{id}); an inactive or incomplete item is refused (itemInactive).
// Coding closes the invoice for editing, for everyone. Deleting the last live piece of a line opens it again (backend).
// Then the labels of the pieces just made are offered, and every coded piece can be printed again or deleted.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { dateText, milligramsText, piastresText, typedPiastres } from "@/lib/format";
import { comparePieceCodes, unitsBefore } from "@/lib/piece-code";
import { Icon, toast, useConfirm } from "@/components/engine";
import { revealFirstError } from "@/lib/submit-guard";
import { hasAction } from "@/lib/actions";
import { useSession } from "@/stores/session";
import { LabelsCard, labelOf } from "./purchases-labels";
import { itemsById } from "./gold-purchases-invoice";
import { itemProblem } from "./purchases-rules";

import { code6 as code6 } from "@/lib/code6";

const ROWS_SHOWN = 20;   // pieces drawn per line

export function CodingForm({ row, tr }: CustomFormProps) {
  const { t } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("gold-accounts", `purchaseCoding.${k}`, v);
  const c = (k: string) => t("common", k);
  const [confirm, dialog] = useConfirm();
  const qc = useQueryClient();
  const [coding, setCoding] = useState<Row | null>(null);
  const [items, setItems] = useState<Map<string, Row>>(new Map());
  const [loadError, setLoadError] = useState("");
  const [made, setMade] = useState<Row[]>([]);
  const [shown, setShown] = useState<Row[]>([]);
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const saveKey = useRef(newSaveKey());

  // The pieces of each line in code order: 74, 75, 76, 77 (the backend sends them so; this keeps the page right whatever arrives).
  const ordered = (d: Row): Row => ({ ...d, lines: (d.lines as Row[]).map((l) => ({ ...l, pieces: [...((l.pieces ?? []) as Row[])].sort((a, b) => comparePieceCodes(a.pieceCode, b.pieceCode)) })) });
  const start = (data: Row) => {
    setCoding(ordered(data));
    itemsById((data.lines as Row[]).filter((l) => !l.coded).map((l) => l.itemId)).then(setItems).catch(() => {});
  };
  const read = async () => { const d = await api(`/purchase-coding/invoices/${row!.invoiceId}`); start(d); return d; };
  useEffect(() => {
    read().catch((e) => setLoadError(e instanceof ApiFailure && e.status === 404 ? m("invoiceNotFound") : tr.errorText(e instanceof ApiFailure ? e.error : { message: "unexpected" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openLines = ((coding?.lines ?? []) as Row[]).filter((l) => !l.coded);
  // The code each unit will probably get: the next code, then one more for every unit, line after line (all units count, drawn or not).
  const offsets = unitsBefore(openLines.map((l) => Number(l.quantity)));
  const nextCode = useQuery({ enabled: openLines.length > 0, retry: false, queryKey: ["next-number", "piece_code"], queryFn: () => api<{ next: number }>("/document-numbers/next", { query: { documentType: "piece_code" } }) });

  if (loadError) return <div className="empty"><Icon name="alert" size={36} /><strong>{loadError}</strong></div>;
  if (!coding) return <div className="empty" aria-busy="true"><Icon name="refresh" size={28} /><span>{c("loading")}</span></div>;

  async function save() {
    if (busy) return;
    setBanner("");
    setBusy(true);
    try {
      // Nothing typed: each unit is one piece, and the backend gives it the item's weight and workmanship and the next code.
      const body = { lines: openLines.map((l) => ({ lineId: l.lineId, pieces: Array.from({ length: l.quantity }, () => ({})) })) };
      const sent = new Set(body.lines.map((l) => l.lineId));
      const data = await api(`/purchase-coding/invoices/${coding!.id}`, { method: "POST", body, saveKey: saveKey.current });
      const pieces = (data.lines as Row[]).filter((l) => sent.has(l.lineId)).flatMap((l) => l.pieces as Row[]).sort((a, b) => comparePieceCodes(a.pieceCode, b.pieceCode));
      setMade(pieces); setShown([]); saveKey.current = newSaveKey(); start(data);
      qc.invalidateQueries({ queryKey: ["next-number", "piece_code"] });   // the numbers are used: the preview moves on
      toast(`${tr.L("تم الحفظ", "Saved")}: ${m("labelCount", { count: pieces.length })}`);
    } catch (e) {
      setBanner(tr.errorText(e instanceof ApiFailure ? e.error : { message: "serverUnreachable" })); revealFirstError();   // itemInactive, lineCoded, pieceCodeTaken ...
      if (e instanceof ApiFailure && e.error.message === "itemInactive") itemsById(openLines.map((l) => l.itemId), true).then(setItems).catch(() => {});   // re-read the items: the refused line then says why
    } finally { setBusy(false); }
  }

  async function removePiece(p: Row) {
    if (!(await confirm({ title: m("deleteTitle", { code: p.pieceCode }), text: m("deleteBody"), ok: c("delete"), danger: true }))) return;
    try {
      await api(`/pieces/${p.id}`, { method: "DELETE" });   // pieceSold / pieceNotAvailable refuse
      toast(m("pieceDeleted"));
      await read(); setMade([]); setShown([]); qc.invalidateQueries({ queryKey: ["next-number", "piece_code"] });   // a line left with no live piece is open again
    } catch (e) { toast(tr.errorText(e instanceof ApiFailure ? e.error : { message: "unexpected" }), { error: true }); }
  }

  const lines = coding.lines as Row[];
  const codedLines = lines.filter((l) => l.coded);
  const allPieces = codedLines.flatMap((l) => l.pieces as Row[]);
  const gram = m("gram");
  return (
    <>
      <div className="card"><div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{m("invoiceNo")} <span dir="ltr">{code6(coding.invoiceNumber)}</span> <span className="sub" dir="ltr">{dateText(coding.date)}</span></h3>
        <div className="actions"><Button id="cd-pieces" onClick={() => window.location.assign(`/${tr.locale}/buy/purchases?view=pieces&invoiceNumber=${coding.invoiceNumber}`)}>{m("invoicePieces")}</Button></div>
      </div></div>
      {made.length > 0 && <div id="cd-made"><LabelsCard tr={tr} title={m("madeLabels")} labels={made.map(labelOf)} /></div>}
      {openLines.length ? (
        <>
          <div className="card" id="cd-form">
            {banner && <div id="cd-alert"><div className="note warn" role="alert" data-field-error>{banner}</div></div>}
            <h3>{m("toCode")}</h3>
            <p className="help" style={{ margin: 0 }}>{m("fromItem")}</p>
          </div>
          {openLines.map((open, i) => {
            const it = items.get(open.itemId);
            const problem = it && itemProblem(it);
            const label = `${code6(open.itemCode)} · ${open.itemName}`;
            const weight = it?.weight ? milligramsText(it.weight) : "";
            const making = it?.workmanshipValue ? piastresText(typedPiastres(it.workmanshipValue)) : "";
            return (
              <div className="card" data-line={i} key={open.lineId}>
                <h3>{m("lineNumber", { number: open.lineNumber })} · {open.itemName} <span className="sub" dir="ltr">{code6(open.itemCode)}</span></h3>
                <p className="sub">{m("lineQuantity", { count: open.quantity })} · {m("lineWeight")} <span dir="ltr">{milligramsText(open.weight)} {gram}</span></p>
                {problem && <div className="note warn" role="alert" data-field-error data-item-problem={i}>{t("gold-accounts", `purchaseInvoices.${problem === "inactive" ? "itemInactive" : "itemIncomplete"}`, { item: label })}</div>}
                {/* Every unit is the same piece; past ROWS_SHOWN a line (up to 100,000 units) says so in one sentence instead of drawing thousands of boxes. */}
                {Array.from({ length: Math.min(open.quantity, ROWS_SHOWN) }, (_, j) => (
                  <div role="group" className="formgrid" key={j} style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 10, marginTop: 10 }} aria-label={m("pieceNumber", { number: j + 1 })}>
                    <div className="field"><label htmlFor={i === 0 && j === 0 ? "pc-next" : `pc-${i}-${j}`}>{m("pieceCode")}</label>
                      <Input id={i === 0 && j === 0 ? "pc-next" : `pc-${i}-${j}`} disabled dir="ltr" style={{ textAlign: "start" }} readOnly value={nextCode.data ? String(nextCode.data.next + offsets[i] + j) : m("codeAuto")} />
                      {!nextCode.data && <div className="help">{m("codeAuto")}</div>}</div>
                    <div className="field"><label htmlFor={`w-${i}-${j}`}>{m("weight")}</label>
                      <Input id={`w-${i}-${j}`} data-f="weight" dir="ltr" readOnly placeholder="—" value={weight} /></div>
                    <div className="field"><label htmlFor={`m-${i}-${j}`}>{m("makingChargePerGram")}</label>
                      <Input id={`m-${i}-${j}`} data-f="makingChargePerGram" dir="ltr" readOnly placeholder="—" value={making} /></div>
                  </div>
                ))}
                {open.quantity > ROWS_SHOWN && <p className="help" data-more={i}>{nextCode.data ? m("moreUnitsTo", { count: open.quantity - ROWS_SHOWN, last: nextCode.data.next + offsets[i] + open.quantity - 1 }) : m("moreUnits", { count: open.quantity - ROWS_SHOWN })}</p>}
              </div>
            );
          })}
          <div className="formbar"><Button variant="primary" id="cd-save" disabled={busy} onClick={save}><Icon name="plus" />{c("save")}</Button></div>
        </>
      ) : <div className="note">{m("allCoded")}</div>}
      {shown.length > 0 && <div id="cd-shown"><LabelsCard tr={tr} title={m("pieceLabel")} labels={shown.map(labelOf)} /></div>}
      {codedLines.length > 0 && (
        <div className="card"><h3>{m("codedLines")}</h3>
          {codedLines.map((line) => (
            <div style={{ marginBottom: 14 }} key={line.lineId}>
              <h3>{m("lineNumber", { number: line.lineNumber })} · {line.itemName} <span className="sub" dir="ltr">{code6(line.itemCode)}</span></h3>
              <DataTable fixedOrder head={[m("pieceCode"), { label: m("weight"), num: true }, { label: m("makingChargePerGram"), num: true }, { label: m("weight21"), num: true }, { label: m("totalWage"), num: true }, m("actions")]}>
                {(line.pieces as Row[]).map((p) => (
                  <Tr key={p.id} data-piece={p.pieceCode}>
                    <Td className="id" dir="ltr">{p.pieceCode}</Td><Td num>{milligramsText(p.weight)}</Td>
                    <Td num>{p.makingChargePerGram == null ? "—" : piastresText(p.makingChargePerGram)}</Td>
                    <Td num>{p.weight21 == null ? "—" : milligramsText(p.weight21)}</Td>
                    <Td num>{p.totalWage == null ? "—" : piastresText(p.totalWage)}</Td>
                    <Td>
                      <Button size="sm" data-print-piece={p.id} aria-label={m("printPiece", { code: p.pieceCode })} onClick={() => { setShown([allPieces.find((x) => x.id === p.id)!]); setMade([]); }}><Icon name="print" size={15} />{c("print")}</Button>{" "}
                      {hasAction(useSession.getState().me, "delete-records") && <Button size="sm" danger data-del-piece={p.id} aria-label={m("deletePiece", { code: p.pieceCode })} onClick={() => removePiece(p)}><Icon name="trash" size={15} />{c("delete")}</Button>}
                    </Td>
                  </Tr>))}
              </DataTable>
            </div>))}
        </div>
      )}
      {dialog}
    </>
  );
}
