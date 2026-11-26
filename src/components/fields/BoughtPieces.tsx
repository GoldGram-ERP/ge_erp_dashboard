"use client";
// A completed Buy draft (owner, 2026-11-26): the purchase it made, each piece now in stock with its code, and their labels, as the Coding page
// prints them. The pieces travel with the draft, so a desk user without the Returned pieces screen sees and prints them too.
import { Icon, Ltr } from "@/components/engine";
import { Button, CopyButton } from "@/components/ui";
import { Link as NavLink } from "@/i18n/navigation";
import { code6 } from "@/lib/code6";
import type { Row } from "@/lib/engine-types";
import { milligramsText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { canOpen } from "@/nav/tree";
import { openLabelPrint } from "@/things/customer-pieces-form";
import { LabelsCard } from "@/things/purchases-labels";

export function BoughtPieces({ tr, draft, me }: { tr: Tr; draft: Row; me: { screens: string[] } | null | undefined }) {
  const d = (k: string, v?: Record<string, string | number>) => tr.t("gold-sales", `salesDesk.buyc.${k}`, v);
  const cp = (k: string, v?: Record<string, string>) => tr.t("gold-accounts", `customerPieces.${k}`, v);
  const pieces = (draft.boughtPieces ?? []) as Row[];
  const number = draft.customerPiecePurchaseNumber;
  return (
    <>
      <div className="tk-card" id="sd-bought" role="status">
        <b>{number ? d("completed", { code: code6(number) }) : d("deleted")}</b>
        {pieces.length > 0 && <>
          <div className="help">{d("pieces")}</div>
          <ul id="sd-bought-pieces" className="tk-list">
            {pieces.map((p) => (
              <li key={p.code} className="kv" data-piece-code={p.code}>
                <span className="st-row"><b dir="ltr">{p.code}</b><CopyButton text={String(p.code)} /> {p.itemName} · <Ltr>{p.karat}</Ltr> · <Ltr>{milligramsText(p.weight)}</Ltr></span>
                <Button size="sm" data-print={p.code} aria-label={cp("reprintCode", { code: p.code })} onClick={() => { openLabelPrint(tr, p.label).catch(() => {}); }}><Icon name="print" size={14} />{cp("printLabel")}</Button>
              </li>
            ))}
          </ul>
          {number && canOpen(me, ["gold-accounts/purchase-coding"]) && <NavLink href={`/sales/returns?view=returned-pieces&open=${pieces[0].id}`} className="btn primary">{d("open")}</NavLink>}
        </>}
      </div>
      {pieces.length > 0 && <LabelsCard tr={tr} title={tr.t("gold-accounts", "purchaseCoding.madeLabels")} labels={pieces.map((p) => ({ ...p.label, itemName: p.itemName, tagPrice: 0 }))} />}
    </>
  );
}
