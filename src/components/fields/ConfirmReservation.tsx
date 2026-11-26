"use client";
// Confirm of a reservation draft (owner, 2026-11-26): an accountant, an Admin or the Super admin turns it into a real reservation, from its row on
// the desk or from the draft's own page. One question, one call (POST /sales-drafts/:id/confirm-reservation); the backend makes the reservation.
import { useRef, useState, type SyntheticEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, toast, useConfirm } from "@/components/engine";
import { Button } from "@/components/ui";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import { code6 } from "@/lib/code6";
import type { Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { canConfirmReservation } from "@/things/sales-desk-rules";

/** Asks, then confirms. `done` gets the draft as saved (reserved); `failed` the refusal's text. Render `dialog` once. */
export function useConfirmReservation(tr: Tr, { done, failed }: { done: (draft: Row) => void; failed: (text: string, code?: string) => void }) {
  const d = (k: string, v?: Record<string, string | number>) => tr.t("gold-sales", `salesDesk.rsv.${k}`, v);
  const [ask, dialog] = useConfirm();
  const [confirming, setConfirming] = useState(false);
  const saveKey = useRef(newSaveKey());
  async function run(draft: Row) {
    if (confirming) return;
    if (!(await ask({ title: d("confirmTitle"), text: d("confirmAsk", { number: draft.draftNumber }), ok: d("confirm") }))) return;
    setConfirming(true);
    try {
      const saved = await api(`/sales-drafts/${draft.id}/confirm-reservation`, { method: "POST", saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(d("confirmed", { code: code6(saved.reservationNumber) }));
      done(saved);
    } catch (err) {
      if (!keepsKey(err)) saveKey.current = newSaveKey();
      if (!(err instanceof ApiFailure)) { failed(tr.L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
      failed(Object.values(backendFieldErrors(err.error, tr))[0] ?? tr.errorText(err.error), err.error.message);
    } finally { setConfirming(false); }
  }
  return { run, confirming, dialog };
}

/** The button in a draft's row on the desk. Its clicks and keys, the dialog's too, stay inside it: the row would open the draft. */
export function ConfirmReservationButton({ row, tr }: { row: Row; tr: Tr }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const reload = () => void qc.invalidateQueries({ queryKey: ["thing", "sales-desk"] });
  const { run, confirming, dialog } = useConfirmReservation(tr, { done: reload, failed: (text) => { toast(text, { error: true }); reload(); } });
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  if (!canConfirmReservation(me, row)) return null;
  return (
    <span onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      <Button size="sm" variant="primary" data-confirm-reservation={row.draftNumber} aria-busy={confirming} disabled={confirming} onClick={() => void run(row)}>
        <Icon name="check" size={14} />{tr.t("gold-sales", "salesDesk.rsv.confirm")}
      </Button>
      {dialog}
    </span>
  );
}
