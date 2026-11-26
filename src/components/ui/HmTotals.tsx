"use client";
// The draft's amounts on the Hallmark kit: TotalsBar's cells and rules (src/things/payment-block.tsx) copied verbatim, drawn as a Group of Rows.
// The remaining (or over-paid) amount is the one row in the warn tone. Use inside a `.hallmark` root.
import type { ReactNode } from "react";
import { piastresInput, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { CopyButton } from "@/components/shell/copy-button";
import { Group, Row } from "@/components/hallmark";
import { sg } from "@/things/sales-form-parts";
import type { Bar } from "@/things/payment-block";

export function HmTotals({ tr, bar }: { tr: Tr; bar: Bar }) {
  const cell = (k: string, label: ReactNode, v: number, extra?: ReactNode, bad?: boolean) => (
    <Row key={k} label={label}>
      <span className="flex items-center justify-end gap-2" data-cell={k}>
        <b dir="ltr" data-summary className={`font-semibold tabular-nums ${bad ? "text-amber" : "text-label"}`}>{piastresText(v)}</b>{extra}
      </span>
    </Row>
  );
  return (
    <div id="tot" role="group" aria-label={sg(tr, "amounts")}>
      <Group title={sg(tr, "amounts")}>
        {cell("gold", sg(tr, "goldTotal"), bar.gold)}
        {cell("making", sg(tr, "makingTotal"), bar.making)}
        {cell("gross", sg(tr, "grossTotal"), bar.gross)}
        {cell("discount", sg(tr, "cashDiscount"), bar.discount, bar.discount > 0 ? <span className="meta" data-cell="makingLeft">{sg(tr, "makingLeft", { amount: piastresText(bar.makingLeft) })}</span> : null)}
        {cell("paid", sg(tr, "paid"), bar.paid)}
        {cell("left", bar.left < 0 ? sg(tr, "overPaid") : sg(tr, "leftToPay"), Math.abs(bar.left), bar.left > 0 ? <CopyButton className="one-copy" text={piastresInput(bar.left)} label={tr.L("انسخ المتبقي للدفع", "Copy the remaining")} /> : null, bar.left !== 0)}
      </Group>
    </div>
  );
}
