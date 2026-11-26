"use client";
// The pieces of a Buy draft one by one (owner, 2026-11-26): each is new, or one we sold before, whose old code is typed or scanned as on the Returns page.
// An old piece comes back into stock under that code; the codes are checked here (GET /piece-look-up) and again by the backend.
import { useState } from "react";
import { Icon, Ltr } from "@/components/engine";
import { Button, Input, Seg } from "@/components/ui";
import { code6 } from "@/lib/code6";
import type { Tr } from "@/lib/t";
import type { PieceRow } from "@/things/buy-completion-rules";
import { PieceScanner } from "@/things/piece-scanner";
import { ErrBox } from "@/things/sales-form-parts";

/** What the person chose for one row. `found` is set once the code was looked up and fits the row. */
export type Pick = { ours: boolean; text: string; checking?: boolean; error?: string; found?: { code: string; invoice?: number; customer?: string } };
export const NEW_PICK: Pick = { ours: false, text: "" };

type Props = {
  tr: Tr; rows: PieceRow[]; picks: Record<string, Pick>; disabled: boolean;
  onChange: (key: string, pick: Pick) => void;
  /** Looks the code of a row up; `typed` when it was just scanned. */
  onCheck: (row: PieceRow, typed?: string) => void;
};

export function ReturnedBuyPieces({ tr, rows, picks, disabled, onChange, onCheck }: Props) {
  const d = (k: string, v?: Record<string, string | number>) => tr.t("gold-sales", `salesDesk.buyc.${k}`, v);
  const [scanning, setScanning] = useState<PieceRow | null>(null);
  return (
    <>
      <ul id="sd-buy-pieces" className="tk-list">
        {rows.map((row) => {
          const pick = picks[row.key] ?? NEW_PICK, label = d("pieceOf", { item: row.itemName, number: row.number, of: row.of });
          return (
            <li key={row.key} data-buy-piece={row.key}>
              <div className="kv"><span>{label} · <Ltr>{row.karat}</Ltr></span>
                <Seg label={label} value={pick.ours ? "ours" : "new"} onChange={(v) => { if (!disabled && !pick.checking) onChange(row.key, { ...NEW_PICK, ours: v === "ours" }); }}
                  items={[{ id: "new", label: d("new"), attrs: { "data-new": row.key } }, { id: "ours", label: d("ours"), attrs: { "data-ours": row.key } }]} /></div>
              {pick.ours && <div className="field tk-code" data-k={`returned-${row.key}`}>
                <div className="tk-codeRow">
                  <div className="field"><Input kind="code" id={`sd-old-${row.key}`} dir="ltr" maxLength={20} autoComplete="off" aria-label={d("oldCode")} placeholder={d("oldCode")} value={pick.text} disabled={disabled || pick.checking}
                    onChange={(e) => onChange(row.key, { ours: true, text: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onCheck(row); } }} /></div>
                  <Button data-check={row.key} aria-busy={pick.checking} disabled={disabled || pick.checking || !pick.text.trim()} onClick={() => onCheck(row)}>{d("check")}</Button>
                  <Button data-scan={row.key} aria-label={tr.t("gold-sales", "pieceLookUp.scanWithCamera")} disabled={disabled} onClick={() => setScanning(row)}><Icon name="camera" /></Button>
                </div>
                {pick.found && <div className="help" role="status">{pick.found.invoice === undefined ? d("foundNoSale", { code: pick.found.code }) : d("found", { code: pick.found.code, invoice: code6(pick.found.invoice), customer: pick.found.customer || "—" })}</div>}
                {pick.error && <ErrBox>{pick.error}</ErrBox>}
              </div>}
            </li>
          );
        })}
      </ul>
      {scanning && <PieceScanner label={d("oldCode")} onClose={() => setScanning(null)} onCode={(c) => { const row = scanning; setScanning(null); onCheck(row, c); }} />}
    </>
  );
}
