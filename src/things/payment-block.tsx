"use client";
// The money parts every screen that takes or pays money shares (owner, 2026-11-05): one cash box plus any number of bank rows
// (Sales invoice, Reservation, Sales return, Expense, Expense refund), the totals bar of Sales and Reservation, and the line price breakdown.
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import type { Row } from "@/lib/engine-types";
import { milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { Icon, Kv, Ltr } from "@/components/engine";
import { Choice, ErrBox, TextBox, fe, sg } from "./sales-form-parts";
import { bankPaid, cashPaid, linePriceOf, type Bank } from "./sales-invoices-math";

export const accountOptions = (rows: Row[]): [string, string][] => rows.map((a) => [a.id, `${a.accountName} · ${a.bankName}`]);
export const blankBank = (): Bank => ({ bankAccountId: "", amount: "" });

/** A paymentErrors code -> its text. sumText: what the screen says when nothing is paid ("sum" required). */
export function payErrorTexts(tr: Tr, codes: Record<string, string>, sumText?: string): Record<string, string> {
  return Object.fromEntries(Object.entries(codes).map(([k, code]) => [k,
    k === "sum" && code === "required" ? sumText ?? fe(tr, "required") : code === "invalid" && k !== "sum" && !k.endsWith("Account") ? sg(tr, "amountInvalid") : fe(tr, code)]));
}
/** The errors of a form without the payment block's own (they go stale once a row moves). */
export const withoutPayErrors = (errs: Record<string, string>) => Object.fromEntries(Object.entries(errs).filter(([k]) => !/^(cash|sum|bank\d+(Account|Amount))$/.test(k)));

type BlockProps = {
  tr: Tr; cash: string; onCash: (v: string) => void; banks: Bank[]; onBanks: (b: Bank[]) => void; accounts: [string, string][];
  errors: Record<string, string>; cashName?: string; cashLabel?: string; sumLabel?: string; before?: ReactNode;
};
/** Cash box, the bank rows (account + amount, remove per row, "Add another bank account") and, when sumLabel is given, the live sum. */
export function PaymentBlock({ tr, cash, onCash, banks, onBanks, accounts, errors, cashName = "cash", cashLabel, sumLabel, before }: BlockProps) {
  const set = (i: number, patch: Partial<Bank>) => onBanks(banks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const err = (k: string) => errors[k] && <ErrBox>{errors[k]}</ErrBox>;
  return (
    <div id="payBlock">
      <div className="formgrid">{before}
        <TextBox name={cashName} label={cashLabel ?? sg(tr, "cash")} value={cash} maxLength={17} ltr error={errors.cash} onChange={onCash} />
      </div>
      <div id="banks" style={{ marginTop: 12 }}>
        {banks.map((b, i) => (
          <div className="formgrid bank-row" data-bank={i} key={i}>
            <div className="field" data-k={`bank${i}Account`} data-err={errors[`bank${i}Account`] ? "" : undefined}>
              <label htmlFor={`ba${i}`}>{i === 0 ? sg(tr, "bankAccount") : sg(tr, "bankAccountN", { number: i + 1 })}</label>
              <Choice tr={tr} id={`ba${i}`} options={accounts} value={b.bankAccountId} onChange={(v) => set(i, { bankAccountId: v })} />{err(`bank${i}Account`)}
            </div>
            <div className="field" data-k={`bank${i}Amount`} data-err={errors[`bank${i}Amount`] ? "" : undefined}>
              <label htmlFor={`bm${i}`}>{i === 0 ? sg(tr, "bankAmount") : sg(tr, "bankAmountN", { number: i + 1 })}</label>
              <input id={`bm${i}`} data-bamt={i} dir="ltr" inputMode="decimal" autoComplete="off" maxLength={17} placeholder="0.00" value={b.amount} style={{ textAlign: "end" }} aria-invalid={!!errors[`bank${i}Amount`]} onChange={(e) => set(i, { amount: e.target.value })} />{err(`bank${i}Amount`)}
            </div>
            <div className="bank-rm"><button type="button" className="btn quiet sm danger" data-rmbank={i} aria-label={sg(tr, "removeBankRow", { number: i + 1 })} onClick={() => onBanks(banks.filter((_, j) => j !== i))}><Icon name="trash" size={15} />{sg(tr, "remove")}</button></div>
          </div>
        ))}
      </div>
      <button type="button" className="btn quiet sm" data-addbank onClick={() => onBanks([...banks, blankBank()])}><Icon name="plus" size={15} />{banks.length ? sg(tr, "addBankRow") : sg(tr, "addBank")}</button>
      <div id="paySumErr">{err("sum")}</div>
      {sumLabel && <div className="pay-sum"><span className="help">{sumLabel}</span><b dir="ltr" id="paySum" data-summary>{piastresText(cashPaid(cash) + bankPaid(banks))}</b></div>}
    </div>
  );
}

export type Bar = { gold: number; making: number; gross: number; discount: number; makingLeft: number; paid: number; left: number };
/** The bar's numbers of a saved invoice or reservation (its totals). */
export const savedBar = (t: Row): Bar => ({ gold: t.goldTotal, making: t.makingTotal, gross: t.grossTotal, discount: t.discount ?? 0, makingLeft: t.makingTotal - (t.discount ?? 0), paid: t.paid, left: t.total - t.paid });

/** Sales and Reservation, new and saved: without workmanship, workmanship, with workmanship, cash discount, paid, remaining. Wraps to 3 + 3 on a narrow screen. */
export function TotalsBar({ tr, bar }: { tr: Tr; bar: Bar }) {
  const cell = (k: string, label: string, v: number, extra?: ReactNode, bad?: boolean) => (
    <div className="tb-cell" data-cell={k}><div className="help">{label}</div><b dir="ltr" data-summary style={bad ? { color: "var(--warn)" } : undefined}>{piastresText(v)}</b>{extra}</div>
  );
  return (
    <div id="tot" className="totals-bar" role="group" aria-label={sg(tr, "amounts")}>
      {cell("gold", sg(tr, "goldTotal"), bar.gold)}
      {cell("making", sg(tr, "makingTotal"), bar.making)}
      {cell("gross", sg(tr, "grossTotal"), bar.gross)}
      {cell("discount", sg(tr, "cashDiscount"), bar.discount, bar.discount > 0 ? <div className="help" data-cell="makingLeft">{sg(tr, "makingLeft", { amount: piastresText(bar.makingLeft) })}</div> : null)}
      {cell("paid", sg(tr, "paid"), bar.paid)}
      {cell("left", bar.left < 0 ? sg(tr, "overPaid") : sg(tr, "leftToPay"), Math.abs(bar.left), null, bar.left !== 0)}
    </div>
  );
}

// The breakdown of one line: perGram = the karat's gram price (null when unknown), workPerGram = workmanship per gram, all piastres.
export type Parts = { perGram: number | bigint | null; weightMg: number; workPerGram: number | bigint; count: number };
/** The breakdown's sentences: the gold and the workmanship of one piece, then times the count. None when it does not give
 *  exactly the price shown (the server's), so the screen never explains a number it does not show. */
export function breakdownLines(tr: Tr, p: Parts, price: number): string[] {
  const w = milligramsText(p.weightMg), money = (x: bigint) => piastresText(Number(x));
  if (p.perGram === null) return [];
  const l = linePriceOf(BigInt(p.perGram), BigInt(p.weightMg), BigInt(p.workPerGram), p.count);
  if (l.line !== BigInt(price)) return [];
  return [
    sg(tr, "howGold", { perGram: money(BigInt(p.perGram)), weight: w, gold: money(l.pieceGold) }),
    sg(tr, "howMaking", { work: money(BigInt(p.workPerGram)), weight: w, making: money(l.pieceMaking) }),
    sg(tr, "howLine", { gold: money(l.pieceGold), making: money(l.pieceMaking), count: p.count, line: money(l.line) }),
  ];
}
/** A read-only line price: hovering shows the breakdown (title), a tap or Enter opens it under the line (aria-expanded). */
export function PriceButton({ tr, id, price, parts, open, onToggle }: { tr: Tr; id: string; price: number; parts: Parts; open: boolean; onToggle: () => void }) {
  const lines = breakdownLines(tr, parts, price);
  if (!lines.length) return <span dir="ltr">{piastresText(price)}</span>;
  return (
    <button type="button" className="price-btn" data-price={id} dir="ltr" aria-expanded={open} aria-controls={`how-${id}`} title={lines.join("\n")}
      aria-label={sg(tr, "howPrice", { price: piastresText(price) })} onClick={onToggle} onKeyDown={(e) => { if (e.key === "Escape" && open) onToggle(); }}>{piastresText(price)}</button>
  );
}
export function Breakdown({ tr, id, parts, price }: { tr: Tr; id: string; parts: Parts; price: number }) {
  return <div className="breakdown" id={`how-${id}`}>{breakdownLines(tr, parts, price).map((s, i) => <div key={i}>{s}</div>)}</div>;
}

/** The account name of each bank row of a saved document (for the record's enrich). */
export const bankNamesOf = (rows: Row[] | undefined): Promise<string[]> => Promise.all((rows ?? []).map((p) => api(`/bank-accounts/${p.bankAccountId}`).then((a) => a.accountName as string).catch(() => "")));
/** A saved document's bank rows, in the order typed. */
export const BankKvs = ({ tr, rows, names }: { tr: Tr; rows: Row[] | undefined; names: string[] | undefined }) => <>{(rows ?? []).map((p, i) => <div key={i} data-saved-bank={i}>
  <Kv k={i === 0 ? sg(tr, "bankAccount") : sg(tr, "bankAccountN", { number: i + 1 })}>{names?.[i] ?? ""}</Kv>
  <Kv k={i === 0 ? sg(tr, "bankAmount") : sg(tr, "bankAmountN", { number: i + 1 })}><Ltr>{piastresText(p.amount)}</Ltr></Kv></div>)}</>;
