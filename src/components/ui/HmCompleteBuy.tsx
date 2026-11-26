"use client";
// Complete of a Buy draft on the Hallmark kit (owner, 2026-11-26): the logic of components/fields/CompleteBuyDraft.tsx (POST /sales-drafts/:id/complete-buy
// pays the customer the draft's saved total, codes the pieces and puts them in stock), drawn with the kit. The Complete pill itself rides in the page's ActionBar.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast, useConfirm } from "@/components/engine";
import { Button, Chip, Group, Icons, Row as ListRow } from "@/components/hallmark";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import { code6 } from "@/lib/code6";
import type { Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { milligramsText, piastresText } from "@/lib/format";
import { unitsBefore } from "@/lib/piece-code";
import { revealFirstError } from "@/lib/submit-guard";
import type { Tr } from "@/lib/t";
import { openLabelPrint } from "@/things/customer-pieces-form";
import { bankPaid, cashPaid, paymentErrors, sentBanks, type Bank } from "@/things/sales-invoices-math";

type Opts = { draft: Row | null; cash: string; banks: Bank[]; dirty: boolean; onPayErrors: (p: Record<string, string>) => void; done: (saved: Row) => void; stale: () => void };

export function useCompleteBuy(tr: Tr, { draft, cash, banks, dirty, onPayErrors, done, stale }: Opts) {
  const { L } = tr;
  const [ask, dialog] = useConfirm();
  const [message, setMessage] = useState("");
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [completing, setCompleting] = useState(false);
  const saveKey = useRef(newSaveKey());
  const qc = useQueryClient();
  const total = Number(draft?.totals?.total ?? 0);
  const refuse = (text: string) => { setMessage(text); revealFirstError(); };
  const mismatch = (t: number, p: number) => L(`الكاش والتحويل لازم يبقوا ${piastresText(t)} بالظبط، والمكتوب ${piastresText(p)}.`, `Cash and bank transfer must come to exactly ${piastresText(t)}; typed: ${piastresText(p)}.`);

  async function run() {
    if (!draft || completing) return;
    setMessage(""); setLineErrors({});
    if (dirty) { refuse(L("احفظ التعديلات الأول وبعدين كمّل.", "Save the changes first, then complete.")); return; }
    const invalid = paymentErrors(cash, banks);
    onPayErrors(invalid);
    if (Object.keys(invalid).length) { revealFirstError(); return; }
    const paid = cashPaid(cash) + bankPaid(banks);
    if (paid !== total) { refuse(mismatch(total, paid)); return; }
    const count = Number(draft.totals?.quantity ?? 0);
    if (!(await ask({ title: L("كمّل الشراء", "Complete the purchase"), text: L(`هتدفع ${piastresText(total)} لـ ${draft.customerName} وتدخّل ${count} قطعة المخزون؟`, `Pay ${piastresText(total)} to ${draft.customerName} and put ${count} pieces in stock?`), ok: L("كمّل", "Complete") }))) return;
    setCompleting(true);
    try {
      const saved = await api(`/sales-drafts/${draft.id}/complete-buy`, { method: "POST", saveKey: saveKey.current,
        body: { ...(cashPaid(cash) > 0 ? { cash: cashPaid(cash) } : {}), bankPayments: sentBanks(banks) } });
      saveKey.current = newSaveKey();
      void qc.invalidateQueries({ queryKey: ["next-number", "piece_code"] });   // the numbers are used: the preview moves on
      toast(L(`اتعملت فاتورة شراء رقم ${code6(saved.customerPiecePurchaseNumber)} والقطع دخلت المخزون`, `Purchase ${code6(saved.customerPiecePurchaseNumber)} made; the pieces are in stock`));
      done(saved);
    } catch (err) {
      if (!keepsKey(err)) saveKey.current = newSaveKey();
      if (!(err instanceof ApiFailure)) { refuse(L("حصل خطأ. حاول تاني.", "Something went wrong. Try again.")); return; }
      const texts = backendFieldErrors(err.error, tr), byLine: Record<string, string> = {}, v = err.error.values ?? {};
      for (const [field, text] of Object.entries(texts)) { const m = /^lines\.(\d+)\.itemId$/.exec(field); if (m) byLine[m[1]] = text; }
      setLineErrors(byLine);
      const payment = ((err.error.fields ?? []) as { field: string }[]).some((f) => f.field === "cash" || f.field === "bankPayments");
      if (payment && v.total !== undefined) refuse(mismatch(Number(v.total), Number(v.paid ?? 0)));
      else refuse(err.error.message === "invalidFields" ? (Object.values(texts)[0] ?? tr.errorText(err.error)) : tr.errorText(err.error));
      if (["draftCompleted", "draftLocked"].includes(err.error.message)) stale();
    } finally { setCompleting(false); }
  }
  return { run, completing, message, lineErrors, total, dialog };
}

/** The Complete section of an open Buy draft: each line with the codes its pieces will probably get, and what is paid to the customer. */
export function HmCompleteBuy({ tr, draft, state, todayTotal }: { tr: Tr; draft: Row; state: ReturnType<typeof useCompleteBuy>; todayTotal?: number }) {
  const { L } = tr;
  const nextCode = useQuery({ retry: false, queryKey: ["next-number", "piece_code"], queryFn: () => api<{ next: number }>("/document-numbers/next", { query: { documentType: "piece_code" } }) });
  const lines = (draft.lines ?? []) as Row[];
  const offsets = unitsBefore(lines.map((l) => Number(l.quantity)));
  const codesOf = (i: number, n: number) => {
    if (!nextCode.data) return L("الكود أوتوماتيك", "Code made automatically");
    const from = nextCode.data.next + offsets[i];
    return n > 1 ? L(`الأكواد من ${from} لـ ${from + n - 1}`, `Codes ${from} to ${from + n - 1}`) : L(`الكود ${from}`, `Code ${from}`);
  };
  return (
    <Group title={<span id="sec-complete-buy">{L("كمّل الشراء", "Complete the purchase")}</span>}>
      {state.dialog}
      <div className="meta px-3 py-2">{L("لما تكمّل، العميل بياخد فلوسه، وكل قطعة بتاخد كود وتدخل المخزون، وبعدها تطبع الملصقات.", "On Complete the customer is paid, each piece gets a code and goes into stock, then you print the labels.")}</div>
      {lines.map((l, i) => (
        <ListRow key={String(l.lineNumber ?? i)} label={<span data-buy-line={l.itemName}>{l.itemName} · <span dir="ltr">{l.karat}K × {l.quantity}</span></span>}>
          <span className="flex flex-col items-end gap-1"><Chip><span dir="ltr">{codesOf(i, Number(l.quantity))}</span></Chip>
            {state.lineErrors[i] && <span role="alert" className="text-meta font-medium text-danger">{state.lineErrors[i]}</span>}</span>
        </ListRow>
      ))}
      {nextCode.data && <div className="meta px-3 py-2">{L("الأكواد دي متوقعة، والأكواد الحقيقية بتظهر بعد ما تكمّل.", "These codes are expected; the real ones show after Complete.")}</div>}
      <ListRow label={L("المطلوب تدفعه للعميل", "To pay the customer")}><b id="sd-buy-topay" dir="ltr" className="block text-end tabular-nums">{piastresText(state.total)}</b></ListRow>
      {todayTotal !== undefined && <div className="meta px-3 py-2" id="sd-buy-today">{L(`الإتمام بيدفع السعر المحفوظ. سعر النهارده ${piastresText(todayTotal)}.`, `Complete pays the saved price. Today's price is ${piastresText(todayTotal)}.`)}</div>}
      {state.message && <p role="alert" data-field-error id="sd-buymsg" className="px-3 py-2 text-meta font-medium text-danger">{state.message}</p>}
    </Group>
  );
}

/** A completed Buy draft: the purchase number, and each piece now in stock with its code and its label to print. */
export function HmBoughtPieces({ tr, draft }: { tr: Tr; draft: Row }) {
  const { L } = tr;
  const pieces = (draft.boughtPieces ?? []) as Row[];
  const number = draft.customerPiecePurchaseNumber;
  return (
    <Group title={<span id="sd-bought">{number ? <>{L("فاتورة شراء", "Purchase")} <Chip tone="malachite"><span dir="ltr">{code6(number)}</span></Chip></> : L("فاتورة الشراء اللي اتعملت من المسودة دي اتمسحت.", "The purchase made from this draft was deleted.")}</span>}>
      {pieces.map((p) => (
        <ListRow key={String(p.code)} label={<span data-piece-code={p.code}><b dir="ltr">{p.code}</b> · {p.itemName} · <span dir="ltr">{p.karat}K · {milligramsText(p.weight)} g</span></span>}>
          <span className="flex justify-end"><Button size="sm" variant="soft" icon={<Icons.Printer aria-hidden />} data-print={p.code} onClick={() => { openLabelPrint(tr, p.label).catch(() => {}); }}>{L("اطبع الملصق", "Print the label")}</Button></span>
        </ListRow>
      ))}
    </Group>
  );
}
