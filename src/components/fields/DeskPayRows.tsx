"use client";
// The Sales desk's one payment block (issue #35): the cash box, then a row for each bank payment with the way it is paid (instapay, bank transfer,
// Visa), the account and the amount, a button to add a row, and the live paid and remaining. The ways are the labels of the rows: they are not a second
// plan beside the money. Visa is the only way to pay when chosen, so choosing it hides the rest and the add button.
import type { Tr } from "@/lib/t";
import { piastresText } from "@/lib/format";
import { Button, Input } from "@/components/ui";
import { FieldError } from "./FieldError";
import { Select } from "./Select";

export type PayBank = { bankAccountId: string; amount: string; method: string };

type Props = {
  tr: Tr;
  cash: string; onCash: (v: string) => void;
  banks: PayBank[]; onBanks: (rows: PayBank[]) => void;
  accounts: [string, string][];
  /** The ways a bank row may be paid by, in the order offered. */
  methods: string[];
  methodLabel: (method: string) => string;
  /** A new row. */
  blank: () => PayBank;
  /** The payment's total (the quote's) and what the rows add up to, in piastres: the live remainder shows when the total is known. */
  total?: number; paid?: number;
  errors: Record<string, string>;
  disabled?: boolean;
};

export function DeskPayRows({ tr, cash, onCash, banks, onBanks, accounts, methods, methodLabel, blank, total, paid = 0, errors, disabled }: Props) {
  const { L } = tr;
  const visa = banks.some((b) => b.method === "visa");
  // Visa only where it can be alone: the one bank row, and no cash typed.
  const visaFits = banks.length === 1 && cash.trim() === "";
  const set = (i: number, patch: Partial<PayBank>) => onBanks(banks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const err = (k: string) => errors[k] && <FieldError>{errors[k]}</FieldError>;
  const left = total === undefined ? undefined : total - paid;
  return (
    <div id="payBlock" className="paylist">
      <div className="formgrid">
        <div className="field" data-k="cash" data-err={errors.cash ? "" : undefined}>
          <label htmlFor="f-cash">{L("النقدي", "Cash")}</label>
          <Input kind="money" id="f-cash" name="cash" dir="ltr" inputMode="decimal" autoComplete="off" maxLength={17} placeholder="0.00" value={cash} disabled={disabled || visa}
            aria-invalid={!!errors.cash} onChange={(e) => onCash(e.target.value)} />
          {err("cash")}
        </div>
      </div>
      <div id="banks">
        {banks.map((b, i) => (
          <div className="formgrid bank-row" data-bank={i} key={i}>
            <div className="field" data-k={`bank${i}Method`}>
              <label htmlFor={`bmt${i}-btn`}>{L("طريقة الدفع", "Paid by")}</label>
              <Select id={`bmt${i}`} name={`bmt${i}`} value={b.method} searchable={false} disabled={disabled}
                options={methods.filter((m) => m !== "visa" || visaFits || b.method === "visa").map((m) => [m, methodLabel(m)])}
                onChange={(v) => { if (v) set(i, { method: v }); }} />
            </div>
            <div className="field" data-k={`bank${i}Account`} data-err={errors[`bank${i}Account`] ? "" : undefined}>
              <label htmlFor={`ba${i}-btn`}>{i === 0 ? L("الحساب البنكي", "Bank account") : L(`الحساب البنكي ${i + 1}`, `Bank account ${i + 1}`)}</label>
              <Select id={`ba${i}`} name={`ba${i}`} value={b.bankAccountId} options={accounts} disabled={disabled} invalid={!!errors[`bank${i}Account`]} onChange={(v) => set(i, { bankAccountId: v })} />
              {err(`bank${i}Account`)}
            </div>
            <div className="field" data-k={`bank${i}Amount`} data-err={errors[`bank${i}Amount`] ? "" : undefined}>
              <label htmlFor={`bm${i}`}>{i === 0 ? L("المبلغ", "Amount") : L(`المبلغ ${i + 1}`, `Amount ${i + 1}`)}</label>
              <Input kind="money" id={`bm${i}`} data-bamt={i} dir="ltr" inputMode="decimal" autoComplete="off" maxLength={17} placeholder="0.00" value={b.amount} disabled={disabled}
                aria-invalid={!!errors[`bank${i}Amount`]} onChange={(e) => set(i, { amount: e.target.value })} />
              {err(`bank${i}Amount`)}
            </div>
            <div className="bank-rm">
              <Button size="sm" danger data-rmbank={i} disabled={disabled} aria-label={L(`حذف طريقة الدفع ${i + 1}`, `Remove payment method ${i + 1}`)} onClick={() => onBanks(banks.filter((_, j) => j !== i))}>{L("حذف", "Remove")}</Button>
            </div>
          </div>
        ))}
      </div>
      {visa
        ? <p className="help" id="pay-visa-alone">{L("الفيزا هي طريقة الدفع الوحيدة عند اختيارها.", "Visa is the only way to pay when it is chosen.")}</p>
        : <Button size="sm" data-addbank disabled={disabled} onClick={() => onBanks([...banks, blank()])}>{L("+ إضافة طريقة دفع", "+ Add a payment method")}</Button>}
      <div id="paySumErr">{err("sum")}</div>
      {total !== undefined && left !== undefined && (
        <div className="pay-sum" id="pay-live">
          <span className="help">{L("المدفوع", "Paid")}</span><b dir="ltr" id="paySum" data-summary>{piastresText(paid)}</b>
          <span className="help">{left < 0 ? L("زيادة", "Over") : L("المتبقي", "Remaining")}</span><b dir="ltr" id="payLeft" data-summary>{piastresText(Math.abs(left))}</b>
        </div>
      )}
    </div>
  );
}
