"use client";
// The gift invoice (backend #169, dashboard #7): a switch on the new invoice that reveals the recipient, and a print box on the
// invoice view. The printed invoice carries the recipient and never the real buyer or the seller; the buyer stays on the screens.
import { Button, SwitchInput } from "@/components/ui";
import { useState } from "react";
import type { Row } from "@/lib/engine-types";
import { latinNumber } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { revealFirstError } from "@/lib/submit-guard";
import { Section } from "@/components/engine";
import { TextBox, fe, sg } from "./sales-form-parts";
import { openPrint } from "./sales-invoices-print";

export type Recipient = { name: string; phone: string };
export type RecipientErrors = { name?: string; phone?: string };

// The same rules as the buyer: a name up to 100 characters, a phone of 8 to 15 digits (Arabic digits read as Latin).
export function checkRecipient(tr: Tr, r: Recipient): RecipientErrors {
  const name = r.name.trim(), phone = latinNumber(r.phone.trim());
  return {
    ...(name === "" ? { name: fe(tr, "required") } : name.length > 100 ? { name: fe(tr, "tooLong") } : {}),
    ...(phone === "" ? { phone: fe(tr, "required") } : /^\d{8,15}$/.test(phone) ? {} : { phone: sg(tr, "phoneInvalid") }),
  };
}

/** The gift switch of the new invoice; on, it asks for the recipient the print will show. */
export function GiftFields({ tr, on, onToggle, value, onChange, errors }: { tr: Tr; on: boolean; onToggle: (v: boolean) => void; value: Recipient; onChange: (v: Recipient) => void; errors: RecipientErrors }) {
  return (
    <div id="gift" style={{ marginTop: 16 }}>
      <label className="field check" data-k="isGift">
        <SwitchInput id="f-isGift" checked={on} onChange={onToggle} />
        <span><b>{sg(tr, "giftSwitch")}</b> <span className="help">{sg(tr, "giftSwitchHint")}</span></span>
      </label>
      {on && (
        <div className="formgrid" id="giftRecipient" style={{ marginTop: 8 }}>
          <TextBox name="giftRecipientPhone" label={`${sg(tr, "recipientPhone")} *`} value={value.phone} maxLength={15} ltr error={errors.phone} help={sg(tr, "phoneHint")} onChange={(phone) => onChange({ ...value, phone })} />
          <TextBox name="giftRecipientName" label={`${sg(tr, "recipientName")} *`} value={value.name} maxLength={100} error={errors.name} onChange={(name) => onChange({ ...value, name })} />
        </div>
      )}
    </div>
  );
}

/** On the invoice view: the recipient and the prices choice of one gift print (the recipient starts as the invoice's own). */
export function GiftPrintBox({ row, tr }: { row: Row; tr: Tr }) {
  const [rec, setRec] = useState<Recipient>({ name: row.giftRecipientName ?? "", phone: row.giftRecipientPhone ?? "" });
  const [prices, setPrices] = useState(false);
  const [errors, setErrors] = useState<RecipientErrors>({});
  const print = () => {
    const bad = checkRecipient(tr, rec);
    setErrors(bad);
    if (bad.name || bad.phone) { revealFirstError(); return; }
    // Straight from the click: the print window opens before the answer, so no pop-up blocker objects.
    openPrint(row.id, "gift", tr, { recipientName: rec.name.trim(), recipientPhone: latinNumber(rec.phone.trim()), showPrices: prices });
  };
  return (
    <Section title={sg(tr, "giftPrintTitle")} wide>
      <div id="giftPrint">
        <div className="formgrid">
          <TextBox name="printRecipientPhone" label={`${sg(tr, "recipientPhone")} *`} value={rec.phone} maxLength={15} ltr error={errors.phone} onChange={(phone) => setRec({ ...rec, phone })} />
          <TextBox name="printRecipientName" label={`${sg(tr, "recipientName")} *`} value={rec.name} maxLength={100} error={errors.name} onChange={(name) => setRec({ ...rec, name })} />
        </div>
        <label className="field check" style={{ marginTop: 8 }}>
          <SwitchInput id="f-showPrices" checked={prices} onChange={setPrices} />
          <span><b>{sg(tr, "showPrices")}</b> <span className="help">{sg(tr, "showPricesHint")}</span></span>
        </label>
        <Button variant="primary" id="print-gift" style={{ marginTop: 10 }} onClick={print}>{tr.t("gold-sales", "prints.layouts.gift")}</Button>
      </div>
    </Section>
  );
}
