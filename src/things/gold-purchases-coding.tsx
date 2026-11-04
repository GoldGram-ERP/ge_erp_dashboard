"use client";
// Purchase coding for one invoice, as a full page (forms.code). Port of gold-purchases-coding.js.
// Each line not yet coded gets one row per unit of its quantity (weight + making charge per gram; the piece code is the system's).
// Save codes all open lines at once (POST /purchase-coding/invoices/{id}); a line's pieces must add up exactly to the line weight.
// Coding closes the invoice for editing, for everyone. Deleting the last live piece of a line opens it again (backend).
// Then the labels of the pieces just made are offered, and every coded piece can be printed again or deleted.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { dateText, milligramsInput, milligramsText, piastresText } from "@/lib/format";
import { Icon, toast, useConfirm } from "@/components/engine";
import { LabelsCard, labelOf } from "./purchases-labels";
import { autoRemainder, readCoding, remainingOf, type CodingLine } from "./purchases-rules";

const code6 = (n: unknown) => String(n).padStart(6, "0");
const SERVER = /^lines\.\d+\.pieces\.\d+\.(weight|makingChargePerGram)$/;
const sig = (n: number) => (n < 0 ? `-${milligramsText(-n)}` : milligramsText(n));
const ERR = { color: "var(--warn)", fontSize: 12.5, marginTop: 4 } as const;
const openLines = (coding: Row): CodingLine[] => (coding.lines as Row[]).filter((l) => !l.coded).map((l) => ({
  lineId: l.lineId, weight: l.weight, quantity: l.quantity,
  pieces: Array.from({ length: l.quantity }, () => ({ weight: l.quantity === 1 && l.weight > 0 ? milligramsInput(l.weight) : "", makingChargePerGram: "" })),
} as CodingLine & { quantity: number }));

export function CodingForm({ row, tr }: CustomFormProps) {
  const { t } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("gold-accounts", `purchaseCoding.${k}`, v);
  const c = (k: string) => t("common", k);
  const [confirm, dialog] = useConfirm();
  const [coding, setCoding] = useState<Row | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<CodingLine[]>([]);
  const [made, setMade] = useState<Row[]>([]);
  const [shown, setShown] = useState<Row[]>([]);
  const [makingAll, setMakingAll] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [off, setOff] = useState<number[]>([]);
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const typed = useRef(new Set<string>());      // "line-piece" weight boxes typed by hand: never auto-filled again
  const saveKey = useRef(newSaveKey());

  const start = (data: Row) => { setCoding(data); setForm(openLines(data)); typed.current.clear(); };
  const read = async () => { const d = await api(`/purchase-coding/invoices/${row!.invoiceId}`); start(d); return d; };
  useEffect(() => {
    read().catch((e) => setLoadError(e instanceof ApiFailure && e.status === 404 ? m("invoiceNotFound") : tr.errorText(e instanceof ApiFailure ? e.error : { message: "unexpected" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nextCode = useQuery({ enabled: form.length > 0, retry: false, queryKey: ["next-number", "piece_code"], queryFn: () => api<{ next: number }>("/document-numbers/next", { query: { documentType: "piece_code" } }) });

  const fieldText = (name: string, key: string) => (key === "required" ? t("common", "fieldErrors.required") : key === "invalid" || !key ? (name.endsWith("weight") ? m("weightInvalid") : m("priceInvalid")) : key === "lineCoded" ? tr.errorText({ message: "lineCoded" }) : t("common", `fieldErrors.${key}`));

  if (loadError) return <div className="empty"><Icon name="alert" size={36} /><strong>{loadError}</strong></div>;
  if (!coding) return <div className="empty" aria-busy="true"><Icon name="refresh" size={28} /><span>{c("loading")}</span></div>;

  const touch = () => { saveKey.current = newSaveKey(); };   // what is typed after a Save is another Save
  const setPiece = (i: number, j: number, f: "weight" | "makingChargePerGram", v: string) => {
    touch();
    setForm((fs) => {
      const next = fs.map((l) => ({ ...l, pieces: l.pieces.map((p) => ({ ...p })) }));
      next[i].pieces[j][f] = v;
      if (f === "weight") {
        typed.current.add(`${i}-${j}`);
        const fill = autoRemainder(next[i].weight, next[i].pieces.map((p, k) => ({ weight: p.weight, typed: typed.current.has(`${i}-${k}`) })));   // the last open box takes what remains
        if (fill) next[i].pieces[fill.index].weight = fill.text;
      }
      return next;
    });
  };
  const setAll = (v: string) => { touch(); setMakingAll(v); setForm((fs) => fs.map((l) => ({ ...l, pieces: l.pieces.map((p) => ({ ...p, makingChargePerGram: v })) }))); };

  async function save() {
    if (busy) return;
    const r = readCoding(form);
    setBanner(""); setErrs({}); setOff([]);
    if (r.errors && Object.keys(r.errors).length) { setErrs(Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [k, fieldText(k, v)]))); setBanner(m("fixRows")); return; }
    if (r.off?.length) { setOff(r.off); setBanner(m("fixRows")); return; }
    setBusy(true);
    try {
      const sent = new Set(r.payload!.lines.map((l) => l.lineId));
      const data = await api(`/purchase-coding/invoices/${coding!.id}`, { method: "POST", body: r.payload, saveKey: saveKey.current });
      const pieces = (data.lines as Row[]).filter((l) => sent.has(l.lineId)).flatMap((l) => l.pieces as Row[]);
      setMade(pieces); setShown([]); saveKey.current = newSaveKey(); start(data); setMakingAll("");
      toast(`${tr.L("تم الحفظ", "Saved")}: ${m("labelCount", { count: pieces.length })}`);
    } catch (e) {
      if (!(e instanceof ApiFailure)) { setBanner(tr.errorText({ message: "serverUnreachable" })); return; }
      const own = e.error.message === "lineCoded" ? "lineCoded" : null;   // a line coded meanwhile has its own words
      const fields = (Array.isArray(e.error.fields) ? e.error.fields : []) as { field: string; message: string }[];
      const refused = Object.fromEntries(fields.filter((f) => SERVER.test(f.field)).map((f) => [f.field, fieldText(f.field, own ?? f.message)]));
      if (Object.keys(refused).length) setErrs(refused); else setBanner(tr.errorText(e.error));   // pieceCodeTaken, lineCoded ...
    } finally { setBusy(false); }
  }

  async function removePiece(p: Row) {
    if (!(await confirm({ title: m("deleteTitle", { code: p.pieceCode }), text: m("deleteBody"), ok: c("delete"), danger: true }))) return;
    try {
      await api(`/pieces/${p.id}`, { method: "DELETE" });   // pieceSold / pieceNotAvailable refuse
      toast(m("pieceDeleted"));
      await read(); setMade([]); setShown([]);   // a line left with no live piece is open again
    } catch (e) { toast(tr.errorText(e instanceof ApiFailure ? e.error : { message: "unexpected" }), { error: true }); }
  }

  const lines = coding.lines as Row[];
  const codedLines = lines.filter((l) => l.coded);
  const allPieces = codedLines.flatMap((l) => l.pieces as Row[]);
  const gram = m("gram");
  return (
    <>
      <div className="card"><div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{m("invoiceNo")} <span dir="ltr">{code6(coding.invoiceNumber)}</span> <span className="sub" dir="ltr">{dateText(coding.date)}</span></h3>
        <div className="actions"><button className="btn quiet" type="button" id="cd-pieces" onClick={() => window.location.assign(`/${tr.locale}/buy/purchases?view=pieces&invoiceNumber=${coding.invoiceNumber}`)}>{m("invoicePieces")}</button></div>
      </div></div>
      {made.length > 0 && <div id="cd-made"><LabelsCard tr={tr} title={m("madeLabels")} labels={made.map(labelOf)} /></div>}
      {form.length ? (
        <>
          <div className="card" id="cd-form">
            {banner && <div id="cd-alert"><div className="note warn" role="alert">{banner}</div></div>}
            <h3>{m("toCode")}</h3>
            <div className="formgrid"><div className="field"><label htmlFor="cd-all">{m("makingAll")}</label>
              <input id="cd-all" dir="ltr" inputMode="decimal" placeholder="0.00" maxLength={17} autoComplete="off" value={makingAll} onChange={(e) => setAll(e.target.value)} /></div></div>
          </div>
          {form.map((l, i) => {
            const open = lines.find((x) => x.lineId === l.lineId)!;
            const { remaining } = remainingOf(l.weight, l.pieces.map((p) => p.weight));
            return (
              <div className="card" data-line={i} key={l.lineId}>
                <h3>{m("lineNumber", { number: open.lineNumber })} · {open.itemName} <span className="sub" dir="ltr">{code6(open.itemCode)}</span></h3>
                <p className="sub">{m("lineQuantity", { count: open.quantity })} · {m("lineWeight")} <span dir="ltr">{milligramsText(l.weight)} {gram}</span></p>
                <p className="sub" data-remaining={i} style={off.includes(i) ? { color: "var(--warn)" } : undefined}>{m("remaining")} <span dir="ltr">{sig(remaining)} {gram}</span>{off.includes(i) ? ` · ${m("weightsDontAdd")}` : ""}</p>
                {l.pieces.map((p, j) => (
                  <div role="group" className="formgrid" key={j} style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 10, marginTop: 10 }} aria-label={m("pieceNumber", { number: j + 1 })}>
                    <div className="field"><label htmlFor={`pc-${i}-${j}`}>{m("pieceCode")}</label>
                      <input id={i === 0 && j === 0 ? "pc-next" : `pc-${i}-${j}`} disabled dir="ltr" style={{ textAlign: "start" }} readOnly value={i === 0 && j === 0 && nextCode.data ? String(nextCode.data.next) : m("codeAuto")} />
                      {i === 0 && j === 0 && !nextCode.data && <div className="help">{m("codeAuto")}</div>}</div>
                    <div className="field" data-k={`lines.${i}.pieces.${j}.weight`}><label htmlFor={`w-${i}-${j}`}>{m("weight")} *</label>
                      <input id={`w-${i}-${j}`} data-l={i} data-p={j} data-f="weight" dir="ltr" inputMode="decimal" placeholder="0.000" maxLength={17} value={p.weight} onChange={(e) => setPiece(i, j, "weight", e.target.value)} />
                      {errs[`lines.${i}.pieces.${j}.weight`] && <div className="err" role="alert" style={ERR}>{errs[`lines.${i}.pieces.${j}.weight`]}</div>}</div>
                    <div className="field" data-k={`lines.${i}.pieces.${j}.makingChargePerGram`}><label htmlFor={`m-${i}-${j}`}>{m("makingChargePerGram")} *</label>
                      <input id={`m-${i}-${j}`} data-l={i} data-p={j} data-f="makingChargePerGram" dir="ltr" inputMode="decimal" placeholder="0.00" maxLength={17} value={p.makingChargePerGram} onChange={(e) => setPiece(i, j, "makingChargePerGram", e.target.value)} />
                      {errs[`lines.${i}.pieces.${j}.makingChargePerGram`] && <div className="err" role="alert" style={ERR}>{errs[`lines.${i}.pieces.${j}.makingChargePerGram`]}</div>}</div>
                  </div>
                ))}
              </div>
            );
          })}
          <div className="formbar"><button className="btn primary" id="cd-save" disabled={busy} onClick={save}><Icon name="plus" />{c("save")}</button></div>
        </>
      ) : <div className="note">{m("allCoded")}</div>}
      {shown.length > 0 && <div id="cd-shown"><LabelsCard tr={tr} title={m("pieceLabel")} labels={shown.map(labelOf)} /></div>}
      {codedLines.length > 0 && (
        <div className="card"><h3>{m("codedLines")}</h3>
          {codedLines.map((line) => (
            <div style={{ marginBottom: 14 }} key={line.lineId}>
              <h3>{m("lineNumber", { number: line.lineNumber })} · {line.itemName} <span className="sub" dir="ltr">{code6(line.itemCode)}</span></h3>
              <div className="table"><table>
                <thead><tr><th>{m("pieceCode")}</th><th className="num">{m("weight")}</th><th className="num">{m("makingChargePerGram")}</th><th className="num">{m("weight21")}</th><th className="num">{m("totalWage")}</th><th>{m("actions")}</th></tr></thead>
                <tbody>{(line.pieces as Row[]).map((p) => (
                  <tr key={p.id} data-piece={p.pieceCode}>
                    <td className="id" dir="ltr">{p.pieceCode}</td><td className="num">{milligramsText(p.weight)}</td>
                    <td className="num">{p.makingChargePerGram == null ? "—" : piastresText(p.makingChargePerGram)}</td>
                    <td className="num">{p.weight21 == null ? "—" : milligramsText(p.weight21)}</td>
                    <td className="num">{p.totalWage == null ? "—" : piastresText(p.totalWage)}</td>
                    <td>
                      <button type="button" className="btn quiet sm" data-print-piece={p.id} aria-label={m("printPiece", { code: p.pieceCode })} onClick={() => { setShown([allPieces.find((x) => x.id === p.id)!]); setMade([]); }}><Icon name="print" size={15} />{c("print")}</button>{" "}
                      <button type="button" className="btn quiet sm danger" data-del-piece={p.id} aria-label={m("deletePiece", { code: p.pieceCode })} onClick={() => removePiece(p)}><Icon name="trash" size={15} />{c("delete")}</button>
                    </td>
                  </tr>))}</tbody>
              </table></div>
            </div>))}
        </div>
      )}
      {dialog}
    </>
  );
}
