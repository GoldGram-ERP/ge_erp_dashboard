"use client";
// The step of adding pieces to a reservation (issue #36, backend #190). A reservation holds items and counts; here its pieces are added, a few at a time,
// and a piece added leaves stock at once. The list on the screen is the whole set the reservation holds after the Save (PUT /reservations/:id/pieces):
// a piece added is held, one taken off is released. Every line shows how many of its pieces are held; when all are, the invoice can be made from the
// reservation without scanning. A piece is typed, scanned with the camera, and checked against the reservation's lines before it is listed.
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { code6 } from "@/lib/code6";
import { latinNumber } from "@/lib/format";
import { Button, DataTable, Icon, Input, Td, Tr, toast } from "@/components/ui";
import { PieceScanner } from "@/things/piece-scanner";
import { FieldError } from "./FieldError";

const PIECE_CODE = /^[A-Za-z0-9 .]{1,20}$/;   // the backend's pattern for a piece code
type Held = { pieceCode: string; itemName: string; karat: string };

export function ReservationPiecesForm({ row, close, reload, tr }: CustomFormProps) {
  const { L, errorText } = tr;
  const [made, setMade] = useState<Row | null>(null);
  const [gone, setGone] = useState(false);
  const [list, setList] = useState<Held[]>([]);
  const [pc, setPc] = useState("");
  const [pcErr, setPcErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [general, setGeneral] = useState("");
  const [changed, setChanged] = useState(false);
  const saveKey = useRef(newSaveKey());

  const load = async () => {
    try {
      const r: Row = await api(`/reservations/${row?.id}`);
      setMade(r); setGone(Boolean(r.deletedAt));
      const nameOf = new Map((r.lines as Row[]).map((l) => [`${l.itemId}`, String(l.itemName)]));
      setList((r.pieces as Row[]).map((p) => ({ pieceCode: String(p.pieceCode), itemName: nameOf.get(String(p.itemId)) ?? "", karat: String(p.karat) })));
      setChanged(false);
    } catch (e) { setGone(e instanceof ApiFailure && e.status === 404); }
  };
  useEffect(() => { void load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const lines: Row[] = made?.lines ?? [];
  const fills = (ln: Row, p: { itemName: string; karat: string }) => ln.itemName === p.itemName && ln.karat === p.karat;
  const heldOf = (ln: Row) => list.filter((p) => fills(ln, p));
  const total = lines.reduce((s, l) => s + Number(l.quantity), 0);
  const complete = lines.length > 0 && lines.every((l) => heldOf(l).length === l.quantity) && list.length === total;
  const open = Boolean(made) && !gone && !made?.salesInvoiceId;

  const reasonText = (reason: string) => ({
    unknown: L("لا توجد قطعة بهذا الكود.", "No piece has this code."),
    sold: L("هذه القطعة مباعة.", "This piece is sold."),
    inTransfer: L("هذه القطعة في تحويل بين الخزائن.", "This piece is in a transfer."),
    otherBranch: L("هذه القطعة في فرع آخر.", "This piece is in another branch."),
    heldByOther: L("هذه القطعة محجوزة على حجز آخر.", "This piece is held by another reservation."),
    noLine: L("هذه القطعة ليست من أصناف الحجز.", "This piece is not one of the reservation's items."),
    tooMany: L("اكتمل عدد هذا الصنف في الحجز.", "This item is already full on the reservation."),
    duplicate: L("هذه القطعة مضافة مرتين.", "This piece is listed twice."),
  } as Record<string, string>)[reason] ?? L("لا يمكن حجز هذه القطعة.", "This piece cannot be held.");

  const addPiece = async (scanned?: string) => {
    const typed = latinNumber((scanned ?? pc).trim());
    if (!typed || adding || !made) return;
    if (!PIECE_CODE.test(typed)) { setPcErr(L("هذا ليس كود قطعة.", "This is not a piece code.")); return; }
    if (list.some((p) => p.pieceCode.toLowerCase() === typed.toLowerCase())) { setPcErr(reasonText("duplicate")); return; }
    setAdding(true); setPcErr("");
    try {
      const piece: Row | undefined = await api("/piece-look-up", { query: { pieceCode: typed } }).catch((e) => (e instanceof ApiFailure && e.status === 404 ? undefined : Promise.reject(e)));
      if (!piece || piece.kind !== "piece") { setPcErr(reasonText("unknown")); return; }
      if (piece.sold) { setPcErr(reasonText("sold")); return; }
      const ln = lines.find((l) => fills(l, piece as { itemName: string; karat: string }));
      if (!ln) { setPcErr(reasonText("noLine")); return; }
      if (heldOf(ln).length >= ln.quantity) { setPcErr(reasonText("tooMany")); return; }
      setList((ls) => [...ls, { pieceCode: String(piece.pieceCode), itemName: String(piece.itemName), karat: String(piece.karat) }]);
      setPc(""); setChanged(true); setGeneral(""); saveKey.current = newSaveKey();
    } catch { setPcErr(L("تعذر البحث عن القطعة. حاول مرة أخرى.", "Could not look the piece up. Try again.")); }
    finally { setAdding(false); document.getElementById("rp-code")?.focus(); }
  };

  const save = async () => {
    if (saving || !open) return;
    setSaving(true); setGeneral("");
    try {
      await api(`/reservations/${row?.id}/pieces`, { method: "PUT", body: { pieceCodes: list.map((p) => p.pieceCode) }, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(complete ? L("تم حفظ القطع. الحجز مكتمل.", "Pieces saved. The reservation is complete.") : L("تم حفظ القطع.", "Pieces saved."));
      reload();
    } catch (e) {
      if (!(e instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); }
      else {
        if (!(e.status === 0 || e.status >= 500 || e.error.message === "saveInProgress")) saveKey.current = newSaveKey();
        const v = e.error.values ?? {};
        if (e.error.message === "pieceNotForReservation") setGeneral(`${list[Number(v.index)]?.pieceCode ?? ""}: ${reasonText(String(v.reason))}`);
        else setGeneral(errorText(e.error));
        if (e.error.message === "reservationInvoiced") void load();
      }
    } finally { setSaving(false); }
  };

  if (!made && !gone) return <p className="help" role="status">{tr.t("common", "loading")}</p>;
  if (gone) return <div className="note warn" role="alert">{L("هذا الحجز غير موجود.", "This reservation does not exist.")}</div>;
  return (
    <>
      <div className="card" id="rp-head">
        <h3>{L("إضافة قطع إلى الحجز", "Add pieces to the reservation")} · {code6(made!.reservationNumber)}</h3>
        <p className="help">{made!.customerName} · <bdi>{made!.customerPhone}</bdi></p>
        {made!.salesInvoiceId && <div className="note warn" role="alert">{L("أُنشئت فاتورة من هذا الحجز، فلا تُعدَّل قطعه.", "An invoice was made from this reservation, so its pieces are not changed.")}</div>}
        <p className="help" id="rp-help">{L("القطعة المضافة تخرج من المخزون فوراً، ويمكن إضافة القطع على دفعات. عند اكتمال كل الأصناف يمكن إنشاء الفاتورة بدون إدخال قطع.", "A piece added leaves stock at once, and pieces can be added in batches. When every item is full the invoice can be made without entering pieces.")}</p>
      </div>

      <div className="card" id="rp-lines">
        <DataTable fixedOrder bodyId="rp-fill" head={[L("الصنف", "Item"), L("العيار", "Karat"), { label: L("المحجوز", "Held"), num: true }]}>
          {lines.map((ln, i) => (
            <Tr key={i}><Td>{ln.itemName}</Td><Td dir="ltr">{ln.karat}</Td>
              <Td num><b data-full={heldOf(ln).length === ln.quantity ? "" : undefined}>{heldOf(ln).length} / {ln.quantity}</b></Td></Tr>
          ))}
        </DataTable>
        <p className="help" id="rp-total"><b>{list.length} / {total}</b> {complete && <>· {L("الحجز مكتمل", "complete")}</>}</p>
      </div>

      {open && (
        <div className="card" id="rp-add">
          <div className="field" data-k="pieceCode" data-err={pcErr ? "" : undefined}>
            <label htmlFor="rp-code">{L("كود القطعة", "Piece code")}</label>
            <Input id="rp-code" dir="ltr" maxLength={20} autoComplete="off" placeholder={L("اكتب الكود أو امسحه ثم Enter", "Type or scan the code, then Enter")} value={pc}
              onChange={(e) => { setPc(e.target.value); setPcErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addPiece(); } }} />
            <div className="formbar">
              <Button id="rp-scan" onClick={() => setScanning(true)}><Icon name="camera" />{tr.t("gold-sales", "pieceLookUp.scanWithCamera")}</Button>
              <Button id="rp-addpiece" disabled={adding} onClick={() => void addPiece()}><Icon name="plus" />{L("إضافة", "Add")}</Button>
            </div>
            {scanning && <PieceScanner label={L("كود القطعة", "Piece code")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setPc(c); setPcErr(""); void addPiece(c); }} />}
            {pcErr && <FieldError>{pcErr}</FieldError>}
          </div>
        </div>
      )}

      <div className="card" id="rp-list">
        <h3>{L("القطع", "Pieces")} <small>{list.length}</small></h3>
        {list.length === 0 ? <p className="help">{L("لا توجد قطع على هذا الحجز بعد.", "No pieces on this reservation yet.")}</p> : (
          <DataTable fixedOrder bodyId="rp-pieces" head={["#", L("كود القطعة", "Piece code"), L("الصنف", "Item"), L("العيار", "Karat"), ""]}>
            {list.map((p, i) => (
              <Tr key={p.pieceCode} data-piece={p.pieceCode}><Td num>{i + 1}</Td><Td dir="ltr"><b>{p.pieceCode}</b></Td><Td>{p.itemName}</Td><Td dir="ltr">{p.karat}</Td>
                <Td>{open && <Button size="sm" danger data-rm={i} aria-label={L(`إزالة القطعة ${p.pieceCode}`, `Remove piece ${p.pieceCode}`)} onClick={() => { setList((ls) => ls.filter((_, j) => j !== i)); setChanged(true); saveKey.current = newSaveKey(); }}><Icon name="trash" size={15} />{L("إزالة", "Remove")}</Button>}</Td></Tr>
            ))}
          </DataTable>
        )}
      </div>

      {general && <div className="note warn" role="alert" data-field-error><b>{general}</b></div>}
      <div className="formbar">
        {open && <Button variant="primary" id="rp-save" disabled={saving || !changed} onClick={() => void save()}>{saving ? L("جارٍ الحفظ…", "Saving…") : L("حفظ القطع", "Save pieces")}</Button>}
        <Button id="rp-close" onClick={close}>{L("إغلاق", "Close")}</Button>
      </div>
    </>
  );
}
