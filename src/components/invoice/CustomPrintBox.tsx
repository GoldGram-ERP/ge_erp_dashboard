"use client";
// The custom print of a sales invoice (owner, 2026-11-23): on an invoice of more than one piece, a button that opens a dialog to pick the
// pieces that go on the printed copy, and whether it prints as the normal invoice or as a gift (the gift rules of GiftPrintBox: a recipient
// name and phone, the buyer never printed, prices only when asked). The A5 layout draws it; the backend recomputes the totals for the chosen pieces.
import { useState } from "react";
import { Button, Checkbox, Modal, Toggle } from "@/components/ui";
import { Section } from "@/components/engine";
import type { Row } from "@/lib/engine-types";
import { milligramsText } from "@/lib/format";
import { PHONE_LENGTH } from "@/lib/phone";
import type { Tr } from "@/lib/t";
import { revealFirstError } from "@/lib/submit-guard";
import { TextBox, sg } from "@/things/sales-form-parts";
import { checkRecipient, printedPhone, type Recipient, type RecipientErrors } from "@/things/sales-gift";
import { openPrint } from "@/things/sales-invoices-print";
import { printLines, toggled } from "@/things/sales-print-rules";

export function CustomPrintBox({ row, tr }: { row: Row; tr: Tr }) {
  const { L } = tr;
  const [open, setOpen] = useState(false);
  return (
    <Section title={L("طباعة مخصّصة", "Custom print")} wide>
      <p className="quiet-note">{L("اختر القطع اللي تظهر في الفاتورة المطبوعة، وطباعتها كفاتورة عادية أو كهدية.", "Pick the pieces that appear on the printed invoice, as a normal invoice or as a gift.")}</p>
      <Button id="print-custom" onClick={() => setOpen(true)}>{L("طباعة مخصّصة", "Custom print")}</Button>
      {open && <CustomPrintDialog row={row} tr={tr} onClose={() => setOpen(false)} />}
    </Section>
  );
}

function CustomPrintDialog({ row, tr, onClose }: { row: Row; tr: Tr; onClose: () => void }) {
  const { L } = tr;
  const lines = (row.lines ?? []) as Row[];
  const all = lines.map((l) => Number(l.lineNumber));
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set(all));
  const [gift, setGift] = useState(false);
  const [rec, setRec] = useState<Recipient>({ name: row.giftRecipientName ?? "", phone: row.giftRecipientPhone ?? "" });
  const [prices, setPrices] = useState(false);
  const [errors, setErrors] = useState<RecipientErrors>({});
  const [none, setNone] = useState(false);

  const print = () => {
    const picked = printLines(all, chosen);
    setNone(picked === null);
    if (picked === null) return;
    if (gift) {
      const bad = checkRecipient(tr, rec, row.giftRecipientPhone);
      setErrors(bad);
      if (bad.name || bad.phone) { revealFirstError(); return; }
    }
    // Straight from the click: the print window opens before the answer, so no pop-up blocker objects.
    const recipientPhone = printedPhone(rec, row.giftRecipientPhone);
    openPrint(row.id, gift ? "gift" : "a4", tr, {
      ...(picked ? { lines: picked } : {}),
      ...(gift ? { recipientName: rec.name.trim(), ...(recipientPhone !== undefined ? { recipientPhone } : {}), showPrices: prices } : {}),
    });
    onClose();
  };

  return (
    <Modal className="wide" title={L("طباعة مخصّصة", "Custom print")} titleId="custom-print-title" onClose={onClose}>
      <div className="cp">
        <div className="cp-bar">
          <b>{L("القطع", "Pieces")}</b>
          <span>
            <Button size="sm" onClick={() => { setChosen(new Set(all)); setNone(false); }}>{L("تحديد الكل", "Select all")}</Button>
            <Button size="sm" onClick={() => setChosen(new Set())}>{L("إلغاء التحديد", "Clear")}</Button>
          </span>
        </div>
        <ul className="cp-list">
          {lines.map((l) => {
            const n = Number(l.lineNumber);
            return (
              <li key={n}>
                <Checkbox checked={chosen.has(n)} onChange={() => { setChosen((c) => toggled(c, n)); setNone(false); }}>
                  <b>{l.itemName}</b> · {l.karat} · <span dir="ltr">{milligramsText(l.weight)}</span> · <span dir="ltr">{l.pieceCode}</span>
                </Checkbox>
              </li>
            );
          })}
        </ul>
        {none && <p className="note warn" role="alert">{L("اختر قطعة واحدة على الأقل.", "Pick at least one piece.")}</p>}

        <div className="cp-kind" role="group" aria-label={L("نوع الفاتورة", "Invoice type")}>
          <Button variant={gift ? "quiet" : "primary"} aria-pressed={!gift} onClick={() => setGift(false)}>{L("فاتورة عادية", "Normal invoice")}</Button>
          <Button variant={gift ? "primary" : "quiet"} aria-pressed={gift} onClick={() => setGift(true)}>{L("فاتورة هدية", "Gift invoice")}</Button>
        </div>
        {gift && (
          <div className="cp-gift">
            <div className="formgrid">
              <TextBox name="customRecipientPhone" label={`${sg(tr, "recipientPhone")} *`} value={rec.phone} maxLength={PHONE_LENGTH} ltr error={errors.phone} onChange={(phone) => setRec({ ...rec, phone })} />
              <TextBox name="customRecipientName" label={`${sg(tr, "recipientName")} *`} value={rec.name} maxLength={100} error={errors.name} onChange={(name) => setRec({ ...rec, name })} />
            </div>
            <Toggle checked={prices} onChange={setPrices}><b>{sg(tr, "showPrices")}</b> <span className="help">{sg(tr, "showPricesHint")}</span></Toggle>
          </div>
        )}

        <div className="cp-actions">
          <Button variant="primary" id="custom-print-go" onClick={print}>{L("طباعة", "Print")}</Button>
          <Button onClick={onClose}>{L("إلغاء", "Cancel")}</Button>
        </div>
      </div>
    </Modal>
  );
}
