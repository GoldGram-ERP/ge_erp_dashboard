"use client";
// Complete of a Buy draft (owner, 2026-11-26): we buy the draft's pieces from the customer. A new piece needs nothing typed, as on the Coding page: the
// codes shown are the ones the pieces will probably get. Some or all may be pieces we sold before ("with pieces from our sales"): their old codes are
// entered, and they come back into stock as a sales return. The customer is paid the draft's saved total either way, with the payment rows of the draft's
// page, and the backend (POST /sales-drafts/:id/complete-buy) pays, codes the new pieces and puts all of them in stock in one step.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon, Ltr, toast, useConfirm } from "@/components/engine";
import { Button } from "@/components/ui";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import { code6 } from "@/lib/code6";
import type { Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { piastresText } from "@/lib/format";
import { unitsBefore } from "@/lib/piece-code";
import { revealFirstError } from "@/lib/submit-guard";
import type { Tr } from "@/lib/t";
import { oldPieceProblem, pieceRows, saleOf, splitAmounts, type BuyLine, type PieceRow } from "@/things/buy-completion-rules";
import { bankPaid, cashPaid, paymentErrors, sentBanks, type Bank } from "@/things/sales-invoices-math";
import { ErrBox, readPieceCode } from "@/things/sales-form-parts";
import { NEW_PICK, ReturnedBuyPieces, type Pick } from "./ReturnedBuyPieces";

type Props = {
  tr: Tr; draft: Row; cash: string; banks: Bank[];
  /** Changes on the page not saved yet: what is completed is what was saved. */
  dirty: boolean;
  /** Today's price of the same pieces, when it is not the saved one. */
  todayTotal?: number;
  /** The payment boxes that are not valid, by the keys of the payment block. */
  onPayErrors: (errors: Record<string, string>) => void;
  done: (saved: Row) => void;
  /** The draft changed under us (completed, locked): read it again. */
  stale: () => void;
};

export function CompleteBuySection({ tr, draft, cash, banks, dirty, todayTotal, onPayErrors, done, stale }: Props) {
  const d = (k: string, v?: Record<string, string | number>) => tr.t("gold-sales", `salesDesk.buyc.${k}`, v);
  const [ask, dialog] = useConfirm();
  const [message, setMessage] = useState("");
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [completing, setCompleting] = useState(false);
  const saveKey = useRef(newSaveKey());
  const qc = useQueryClient();
  const nextCode = useQuery({ retry: false, queryKey: ["next-number", "piece_code"], queryFn: () => api<{ next: number }>("/document-numbers/next", { query: { documentType: "piece_code" } }) });
  const [mixed, setMixed] = useState(false);   // choosing, piece by piece, which are new and which are ours
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const put = (key: string, pick: Pick) => { setPicks((p) => ({ ...p, [key]: pick })); setMessage(""); saveKey.current = newSaveKey(); };

  const lines = (draft.lines ?? []) as Row[];
  const rows = pieceRows(lines as unknown as BuyLine[]);
  const ours = mixed ? rows.filter((r) => picks[r.key]?.ours) : [];
  const split = splitAmounts(lines as unknown as BuyLine[], ours);
  const offsets = unitsBefore(split.newQuantities);
  const total = Number(draft.totals?.total ?? 0);
  const codesOf = (i: number, quantity: number) => {
    if (quantity === 0) return d("noneNew");
    if (!nextCode.data) return d("codesAuto");
    const from = nextCode.data.next + offsets[i];
    return quantity > 1 ? d("codes", { from, to: from + quantity - 1 }) : d("code", { code: from });
  };
  const refuse = (text: string) => { setMessage(text); revealFirstError(); };

  /** Looks the old code of a row up and keeps what was found, or why it cannot stand for the row; the pick kept is handed back. */
  async function check(row: PieceRow, typed?: string): Promise<Pick> {
    const text = typed ?? picks[row.key]?.text ?? "", fail = (error: string): Pick => { const pick = { ours: true, text, error }; put(row.key, pick); return pick; };
    const read = readPieceCode(tr, text);
    if (read.code === undefined) return fail(text.trim() ? read.error : d("problem.empty"));
    if (rows.some((r) => r.key !== row.key && picks[r.key]?.found?.code.toLowerCase() === read.code.toLowerCase())) return fail(d("problem.duplicate"));
    put(row.key, { ours: true, text, checking: true });
    try {
      const found = await api("/piece-look-up", { query: { pieceCode: read.code } });
      const problem = oldPieceProblem(found, row, String(draft.branchName));
      if (problem) return fail(d(`problem.${problem}`, { item: row.itemName }));
      const sale = saleOf(found);
      const pick: Pick = { ours: true, text, found: { code: String(found.pieceCode), invoice: sale?.documentNumber, customer: sale?.customerName ?? undefined } };
      put(row.key, pick);
      return pick;
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 404) return fail(d("problem.notFound"));
      return fail(err instanceof ApiFailure ? tr.errorText(err.error) : tr.L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."));
    }
  }

  async function complete() {
    if (completing) return;
    setMessage(""); setLineErrors({});
    if (dirty) { refuse(d("saveFirst")); return; }
    // Every row marked as ours needs a code that was looked up and fits; one typed and not yet checked is checked now.
    if (mixed && !ours.length) { refuse(d("chooseOurs")); return; }
    const returned: { row: PieceRow; pieceCode: string }[] = [];
    for (const row of ours) {
      const pick = picks[row.key]?.found ? picks[row.key] : await check(row);
      if (pick.found) returned.push({ row, pieceCode: pick.found.code });
    }
    if (returned.length !== ours.length) { revealFirstError(); return; }
    if (new Set(returned.map((r) => r.pieceCode.toLowerCase())).size !== returned.length) { refuse(d("problem.duplicate")); return; }
    const invalid = paymentErrors(cash, banks);
    onPayErrors(invalid);
    if (Object.keys(invalid).length) { revealFirstError(); return; }
    const paid = cashPaid(cash) + bankPaid(banks);
    if (paid !== total) { refuse(d("payMismatch", { total: piastresText(total), paid: piastresText(paid) })); return; }
    const asked = { total: piastresText(total), customer: String(draft.customerName), count: Number(draft.totals?.quantity ?? 0), old: returned.length };
    if (!(await ask({ title: d("confirmTitle"), text: d(returned.length ? "confirmMixed" : "confirmAsk", asked), ok: d("complete") }))) return;
    setCompleting(true);
    try {
      const saved = await api(`/sales-drafts/${draft.id}/complete-buy`, { method: "POST", saveKey: saveKey.current,
        body: { ...(cashPaid(cash) > 0 ? { cash: cashPaid(cash) } : {}), bankPayments: sentBanks(banks), ...(returned.length ? { returnedPieces: returned.map((r) => ({ lineNumber: r.row.lineNumber, pieceCode: r.pieceCode })) } : {}) } });
      saveKey.current = newSaveKey();
      qc.invalidateQueries({ queryKey: ["next-number", "piece_code"] });   // the numbers are used: the preview moves on
      toast(saved.customerPiecePurchaseNumber ? d("completed", { code: code6(saved.customerPiecePurchaseNumber) }) : d("completedReturn", { code: code6(saved.salesReturnNumber) }));
      done(saved);
    } catch (err) {
      if (!keepsKey(err)) saveKey.current = newSaveKey();
      if (!(err instanceof ApiFailure)) { refuse(tr.L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
      const texts = backendFieldErrors(err.error, tr), byLine: Record<string, string> = {}, v = err.error.values ?? {};
      for (const [field, text] of Object.entries(texts)) { const m = /^lines\.(\d+)\.itemId$/.exec(field); if (m) byLine[m[1]] = text; }
      setLineErrors(byLine);
      // A refusal of one of the old pieces is shown on its row.
      for (const f of (err.error.fields ?? []) as { field: string }[]) {
        const at = /^returnedPieces\.(\d+)\./.exec(f.field), sent = at ? returned[Number(at[1])] : undefined;
        if (sent) put(sent.row.key, { ours: true, text: sent.pieceCode, error: tr.errorText(err.error) });
      }
      const payment = ((err.error.fields ?? []) as { field: string }[]).some((f) => f.field === "cash" || f.field === "bankPayments");
      if (payment && v.total !== undefined) refuse(d("payMismatch", { total: piastresText(Number(v.total)), paid: piastresText(Number(v.paid ?? 0)) }));
      else refuse(err.error.message === "invalidFields" ? (Object.values(texts)[0] ?? tr.errorText(err.error)) : tr.errorText(err.error));
      if (["draftCompleted", "draftLocked"].includes(err.error.message)) stale();
    } finally { setCompleting(false); }
  }

  return (
    <div className="grp-block wide" id="sec-complete-buy"><h3 className="grp-title">{d("title")}</h3><div className="tk-card">
      {dialog}
      <div className="help">{d("intro")}</div>
      {mixed && <><div className="help">{d("mixedHelp")}</div>
        <ReturnedBuyPieces tr={tr} rows={rows} picks={picks} disabled={completing} onChange={(key, pick) => put(key, pick.ours ? pick : NEW_PICK)} onCheck={(row, typed) => void check(row, typed)} /></>}
      <ul id="sd-buy-lines" className="tk-list">
        {lines.map((l, i) => (
          <li key={l.lineNumber} className="kv" data-buy-line={l.itemName}>
            <span>{l.itemName} · <Ltr>{l.karat}</Ltr> × <Ltr>{split.newQuantities[i]}</Ltr>{lineErrors[i] && <ErrBox>{lineErrors[i]}</ErrBox>}</span>
            <b>{codesOf(i, split.newQuantities[i])}</b>
          </li>
        ))}
      </ul>
      {nextCode.data && <div className="help">{d("preview")}</div>}
      {mixed && <><div className="kv"><span>{d("returnedAmount")}</span><b id="sd-buy-returned" dir="ltr">{piastresText(split.returned)}</b></div>
        <div className="kv"><span>{d("newAmount")}</span><b id="sd-buy-new" dir="ltr">{piastresText(split.bought)}</b></div></>}
      <div className="kv"><span>{d("toPay")}</span><b id="sd-buy-topay" dir="ltr">{piastresText(total)}</b></div>
      {todayTotal !== undefined && <div className="help" id="sd-buy-today">{d("savedPrice", { total: piastresText(todayTotal) })}</div>}
      {message && <div className="note warn" role="alert" data-field-error id="sd-buymsg"><b>{message}</b></div>}
      <div className="row">
        <Button variant="primary" id="sd-complete-buy" aria-busy={completing} disabled={completing} onClick={() => void complete()}><Icon name="check" size={15} />{completing ? d("completing") : mixed ? d("complete") : d("completeAllNew")}</Button>
        <Button id="sd-buy-mode" disabled={completing} onClick={() => { setMixed((m) => !m); setPicks({}); setMessage(""); setLineErrors({}); saveKey.current = newSaveKey(); }}>{mixed ? d("backAllNew") : d("withOurs")}</Button>
      </div>
    </div></div>
  );
}
