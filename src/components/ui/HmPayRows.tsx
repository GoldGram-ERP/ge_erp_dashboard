"use client";
// The Sales desk's payment block drawn on the Hallmark kit (owner, 2026-11-25). The rules are DeskPayRows' (src/components/fields/DeskPayRows.tsx),
// copied verbatim: cash, then one row per bank payment (way, account for a bank transfer only, amount), add a row, the live paid and remaining.
// Visa is the only way to pay when chosen, so choosing it hides the rest and the add button. Use inside a `.hallmark` root.
import type { Tr } from "@/lib/t";
import { piastresInput, piastresText } from "@/lib/format";
import { CopyButton } from "@/components/shell/copy-button";
import { Button, Field, Group, Icons, Input, Row, Select } from "@/components/hallmark";
import { lineTakesAccount, methodsLeftFor } from "@/things/sales-desk-rules";
import { bankRest, cashRest } from "@/things/sales-invoices-math";
import type { PayBank } from "@/components/fields/DeskPayRows";

type Props = {
  tr: Tr;
  cash: string; onCash: (v: string) => void;
  banks: PayBank[]; onBanks: (rows: PayBank[]) => void;
  accounts: [string, string][];
  methods: string[];
  methodLabel: (method: string) => string;
  blank: () => PayBank;
  total?: number; paid?: number;
  errors: Record<string, string>;
  disabled?: boolean;
};

export function HmPayRows({ tr, cash, onCash, banks, onBanks, accounts, methods, methodLabel, blank, total, paid = 0, errors, disabled }: Props) {
  const { L } = tr;
  const visa = banks.some((b) => b.method === "visa");
  // Visa only where it can be alone: the one bank row, and no cash typed.
  const visaFits = banks.length === 1 && cash.trim() === "";
  const set = (i: number, patch: Partial<PayBank>) => onBanks(banks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const left = total === undefined ? undefined : total - paid;
  const money = "!w-36 text-end tabular-nums";
  return (
    <div id="payBlock" className="grid gap-3">
      <div data-k="cash" data-err={errors.cash ? "" : undefined}>
        <Field label={L("النقدي", "Cash")} htmlFor="f-cash" error={errors.cash}>
          <div className="flex flex-wrap items-center gap-2">
            <Input id="f-cash" name="cash" dir="ltr" inputMode="decimal" autoComplete="off" maxLength={17} placeholder="0.00" value={cash} disabled={disabled || visa}
              aria-invalid={!!errors.cash} className={money} onChange={(e) => onCash(e.target.value)} />
            {total !== undefined && !visa && <Button size="sm" variant="soft" data-fillcash disabled={disabled} onClick={() => onCash(cashRest(total, banks))}>{L("الكل", "All")}</Button>}
          </div>
        </Field>
      </div>
      <div id="banks" className="grid gap-3">
        {banks.map((b, i) => (
          <div className="flex flex-wrap items-end gap-3" data-bank={i} key={i}>
            <div className="w-44 max-w-full" data-k={`bank${i}Method`}>
              <Field label={L("طريقة الدفع", "Paid by")} htmlFor={`bmt${i}-btn`}>
                <Select id={`bmt${i}-btn`} value={b.method} disabled={disabled}
                  options={methodsLeftFor(i, banks, methods).filter((m) => m !== "visa" || visaFits || b.method === "visa").map((m) => ({ value: m, label: methodLabel(m) }))}
                  onChange={(v) => { if (v) set(i, lineTakesAccount(v) ? { method: v } : { method: v, bankAccountId: "" }); }} />
              </Field>
            </div>
            {lineTakesAccount(b.method) && (
              <div className="w-56 max-w-full" data-k={`bank${i}Account`} data-err={errors[`bank${i}Account`] ? "" : undefined}>
                <Field label={i === 0 ? L("الحساب البنكي", "Bank account") : L(`الحساب البنكي ${i + 1}`, `Bank account ${i + 1}`)} htmlFor={`ba${i}-btn`} error={errors[`bank${i}Account`]}>
                  <Select id={`ba${i}-btn`} value={b.bankAccountId} options={accounts.map(([v, t]) => ({ value: v, label: t }))} disabled={disabled} invalid={!!errors[`bank${i}Account`]} placeholder={L("اختار", "Choose")} onChange={(v) => set(i, { bankAccountId: v })} />
                </Field>
              </div>
            )}
            <div data-k={`bank${i}Amount`} data-err={errors[`bank${i}Amount`] ? "" : undefined}>
              <Field label={i === 0 ? L("المبلغ", "Amount") : L(`المبلغ ${i + 1}`, `Amount ${i + 1}`)} htmlFor={`bm${i}`} error={errors[`bank${i}Amount`]}>
                <div className="flex flex-wrap items-center gap-2">
                  <Input id={`bm${i}`} data-bamt={i} dir="ltr" inputMode="decimal" autoComplete="off" maxLength={17} placeholder="0.00" value={b.amount} disabled={disabled}
                    aria-invalid={!!errors[`bank${i}Amount`]} className={money} onChange={(e) => set(i, { amount: e.target.value })} />
                  {total !== undefined && <Button size="sm" variant="soft" data-fillbank={i} disabled={disabled} onClick={() => set(i, { amount: bankRest(total, cash, banks, i) })}>{L("كمّل الباقي", "Fill the rest")}</Button>}
                  <Button size="sm" variant="quiet" iconOnly icon={<Icons.Trash2 aria-hidden />} data-rmbank={i} disabled={disabled} label={L(`حذف طريقة الدفع ${i + 1}`, `Remove payment method ${i + 1}`)} onClick={() => onBanks(banks.filter((_, j) => j !== i))} />
                </div>
              </Field>
            </div>
          </div>
        ))}
      </div>
      {visa
        ? <p className="meta" id="pay-visa-alone">{L("الفيزا هي طريقة الدفع الوحيدة عند اختيارها.", "Visa is the only way to pay when it is chosen.")}</p>
        : <div><Button size="sm" variant="soft" icon={<Icons.Plus aria-hidden />} data-addbank disabled={disabled} onClick={() => onBanks([...banks, blank()])}>{L("إضافة طريقة دفع", "Add a payment method")}</Button></div>}
      <div id="paySumErr">{errors.sum && <p role="alert" className="text-meta font-medium text-danger">{errors.sum}</p>}</div>
      {total !== undefined && left !== undefined && (
        <div id="pay-live"><Group>
          <Row label={L("المدفوع", "Paid")}><b dir="ltr" id="paySum" data-summary className="block text-end font-semibold tabular-nums">{piastresText(paid)}</b></Row>
          <Row label={left < 0 ? L("زيادة", "Over") : L("المتبقي", "Remaining")}>
            <span className="flex items-center justify-end gap-2">
              <b dir="ltr" id="payLeft" data-summary className={`font-semibold tabular-nums ${left < 0 ? "text-danger" : ""}`}>{piastresText(Math.abs(left))}</b>
              {left > 0 && <CopyButton className="one-copy" text={piastresInput(left)} label={L("انسخ المتبقي للدفع", "Copy the remaining")} />}
            </span>
          </Row>
        </Group></div>
      )}
    </div>
  );
}
