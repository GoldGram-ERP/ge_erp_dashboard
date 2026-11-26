"use client";
// Complete of a Buy draft (owner, 2026-11-26): we buy the draft's pieces from the customer. Nothing is typed per piece, as on the Coding page: the
// codes shown are the ones the pieces will probably get. The customer is paid the draft's saved total with the payment rows of the draft's page, and
// the backend (POST /sales-drafts/:id/complete-buy) pays, codes the pieces and puts them in stock in one step.
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
import { bankPaid, cashPaid, paymentErrors, sentBanks, type Bank } from "@/things/sales-invoices-math";
import { ErrBox } from "@/things/sales-form-parts";

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

  const lines = (draft.lines ?? []) as Row[];
  const offsets = unitsBefore(lines.map((l) => Number(l.quantity)));
  const total = Number(draft.totals?.total ?? 0);
  const codesOf = (i: number, quantity: number) => {
    if (!nextCode.data) return d("codesAuto");
    const from = nextCode.data.next + offsets[i];
    return quantity > 1 ? d("codes", { from, to: from + quantity - 1 }) : d("code", { code: from });
  };
  const refuse = (text: string) => { setMessage(text); revealFirstError(); };

  async function complete() {
    if (completing) return;
    setMessage(""); setLineErrors({});
    if (dirty) { refuse(d("saveFirst")); return; }
    const invalid = paymentErrors(cash, banks);
    onPayErrors(invalid);
    if (Object.keys(invalid).length) { revealFirstError(); return; }
    const paid = cashPaid(cash) + bankPaid(banks);
    if (paid !== total) { refuse(d("payMismatch", { total: piastresText(total), paid: piastresText(paid) })); return; }
    if (!(await ask({ title: d("confirmTitle"), text: d("confirmAsk", { total: piastresText(total), customer: String(draft.customerName), count: Number(draft.totals?.quantity ?? 0) }), ok: d("complete") }))) return;
    setCompleting(true);
    try {
      const saved = await api(`/sales-drafts/${draft.id}/complete-buy`, { method: "POST", saveKey: saveKey.current,
        body: { ...(cashPaid(cash) > 0 ? { cash: cashPaid(cash) } : {}), bankPayments: sentBanks(banks) } });
      saveKey.current = newSaveKey();
      qc.invalidateQueries({ queryKey: ["next-number", "piece_code"] });   // the numbers are used: the preview moves on
      toast(d("completed", { code: code6(saved.customerPiecePurchaseNumber) }));
      done(saved);
    } catch (err) {
      if (!keepsKey(err)) saveKey.current = newSaveKey();
      if (!(err instanceof ApiFailure)) { refuse(tr.L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
      const texts = backendFieldErrors(err.error, tr), byLine: Record<string, string> = {}, v = err.error.values ?? {};
      for (const [field, text] of Object.entries(texts)) { const m = /^lines\.(\d+)\.itemId$/.exec(field); if (m) byLine[m[1]] = text; }
      setLineErrors(byLine);
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
      <ul id="sd-buy-lines" className="tk-list">
        {lines.map((l, i) => (
          <li key={l.lineNumber} className="kv" data-buy-line={l.itemName}>
            <span>{l.itemName} · <Ltr>{l.karat}</Ltr> × <Ltr>{l.quantity}</Ltr>{lineErrors[i] && <ErrBox>{lineErrors[i]}</ErrBox>}</span>
            <b>{codesOf(i, Number(l.quantity))}</b>
          </li>
        ))}
      </ul>
      {nextCode.data && <div className="help">{d("preview")}</div>}
      <div className="kv"><span>{d("toPay")}</span><b id="sd-buy-topay" dir="ltr">{piastresText(total)}</b></div>
      {todayTotal !== undefined && <div className="help" id="sd-buy-today">{d("savedPrice", { total: piastresText(todayTotal) })}</div>}
      {message && <div className="note warn" role="alert" data-field-error id="sd-buymsg"><b>{message}</b></div>}
      <Button variant="primary" id="sd-complete-buy" aria-busy={completing} disabled={completing} onClick={() => void complete()}><Icon name="check" size={15} />{completing ? d("completing") : d("complete")}</Button>
    </div></div>
  );
}
