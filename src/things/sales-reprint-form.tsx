"use client";
// Reprint label (sales/pieces form): one piece code, or a range of numeric codes, a template and a layout.
// POST /reprint-label (Idempotency-Key) records one "reprint" activity row and answers the labels; nothing else changes.
// Ported from docs/nav-preview/app/things/sales-reprint-form.js. Labels as the dashboard prints them: "tag" = 30 x 10 mm per page, "a4" = 5 x 13 labels of 38.1 x 21.2 mm.
// The QR symbol is a real, scannable QR code of the piece code (src/lib/qr.ts); the Code 128 bars stay a labelled box (shortcut: draw them with JsBarcode when a barcode label is needed).
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { latinNumber } from "@/lib/format";
import { toast } from "@/components/engine";
import { Button, Input } from "@/components/ui";
import { Choice, ErrBox, TextBox, fe, pieceChoices, readPieceCode } from "./sales-form-parts";
import { LAYOUT_KEY, Sheet } from "./label-sheet";
import { printLabels } from "./label-print";

export function ReprintForm({ tr }: CustomFormProps) {
  const { t, L } = tr;
  const rl = (k: string) => t("gold-sales", `reprintLabel.${k}`);
  const pc = (k: string, v?: Record<string, string>) => t("gold-accounts", `purchaseCoding.${k}`, v);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [layout, setLayout] = useState<"tag" | "a4">("tag");
  const [code, setCode] = useState("");
  const [fromCode, setFromCode] = useState("");
  const [toCode, setToCode] = useState("");
  const [choices, setChoices] = useState<Row[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [labels, setLabels] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  const touch = () => { saveKey.current = newSaveKey(); };

  useEffect(() => {
    setLayout(localStorage.getItem(LAYOUT_KEY) === "a4" ? "a4" : "tag");
    api("/reprint-label/templates").then((r) => { const items: Row[] = r.items ?? []; setTemplates(items); setTemplateId(items[0]?.id ?? ""); }).catch(() => { /* the list stays empty: the field says required */ });
  }, []);
  useEffect(() => {
    if (code.trim().length < 2) return;
    const h = setTimeout(() => { pieceChoices(code, { state: "available" }).then(setChoices).catch(() => { /* a convenience */ }); }, 250);
    return () => clearTimeout(h);
  }, [code]);

  async function submit() {
    if (saving) return;
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    const e: Record<string, string> = {}, from = fromCode.trim(), to = toCode.trim();
    if (!templateId) e.labelTemplateId = fe(tr, "required");
    let body: Row | undefined;
    if (code.trim()) { const r = readPieceCode(tr, code); if (r.error) e.pieceCode = r.error; else body = { pieceCode: r.code }; }       // the piece code wins when both are filled
    else if (from) {
      const f = /^\d{1,12}$/.test(latinNumber(from)) ? Number(latinNumber(from)) : undefined;
      const e2 = to === "" ? f : /^\d{1,12}$/.test(latinNumber(to)) ? Number(latinNumber(to)) : undefined;
      if (f === undefined) e.fromCode = fe(tr, "required");
      if (to !== "" && e2 === undefined) e.toCode = fe(tr, "invalid");
      else if (f !== undefined && e2 !== undefined && (e2 < f || e2 - f >= 500)) e.toCode = fe(tr, "invalid");        // 500 codes at most, in order (the backend refuses too)
      if (f !== undefined && e2 !== undefined && !e.toCode) body = { fromCode: f, ...(to !== "" ? { toCode: e2 } : {}) };
    } else { e.pieceCode = fe(tr, "required"); e.fromCode = fe(tr, "required"); }
    setErrs(e);
    if (Object.keys(e).length || !body) return;
    setSaving(true); setBanner("");
    try {
      const r = await api("/reprint-label", { method: "POST", body: { ...body, labelTemplateId: templateId, layout }, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      localStorage.setItem(LAYOUT_KEY, r.layout ?? layout);
      setLabels((r.pieces ?? []).map((p: Row) => ({ pieceCode: p.pieceCode, labelKind: p.labelKind, itemName: p.itemName, categoryName: p.categoryName, karat: p.karat, weight: p.weight, tagPrice: p.tagPrice })));
    } catch (err) {
      const texts = err instanceof ApiFailure ? backendFieldErrors(err.error, tr) : {};
      const named = Object.fromEntries(Object.entries(texts).filter(([k]) => ["pieceCode", "fromCode", "toCode", "labelTemplateId", "layout"].includes(k)));
      if (Object.keys(named).length) setErrs(named as Record<string, string>);
      else setBanner(err instanceof ApiFailure ? (err.status === 404 ? `${rl("notFoundTitle")}. ${rl("notFoundBody")}` : tr.errorText(err.error)) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."));
    } finally { setSaving(false); }
  }
  const pickLayout = (v: string) => { touch(); const l = v === "a4" ? "a4" : "tag"; setLayout(l); localStorage.setItem(LAYOUT_KEY, l); };
  const print = () => { if (labels) printLabels(tr, labels, layout); };
  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;

  return (
    <>
      <form id="rp" className="card" noValidate aria-busy={saving} onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
        <div id="banners">{banner && <div className="note warn" role="alert"><b>{banner}</b></div>}</div>
        <div className="formgrid" id="grid">
          <div className="field" data-k="pieceCode"><label htmlFor="pc">{rl("pieceCode")}</label>
            <Input id="pc" dir="ltr" list="pcl" maxLength={40} autoComplete="off" style={{ fontFamily: "monospace" }} value={code} onChange={(ev) => { touch(); setCode(ev.target.value); }} />
            <datalist id="pcl">{choices.map((p) => <option key={p.pieceCode} value={p.pieceCode}>{`${p.itemName ?? ""} · ${p.karat ?? ""}`}</option>)}</datalist>{err("pieceCode")}</div>
          <div className="field wide"><div className="help">{rl("orRange")}</div></div>
          <TextBox name="fromCode" label={rl("fromCode")} value={fromCode} maxLength={12} ltr error={errs.fromCode} onChange={(v) => { touch(); setFromCode(v); }} />
          <TextBox name="toCode" label={rl("toCode")} value={toCode} maxLength={12} ltr error={errs.toCode} onChange={(v) => { touch(); setToCode(v); }} />
          <div className="field" data-k="labelTemplateId"><label htmlFor="labelTemplateId">{rl("labelTemplate")} *</label>
            <Choice tr={tr} id="labelTemplateId" searchable={false} options={templates.map((x) => [x.id, x.name])} value={templateId} onChange={(v) => { touch(); setTemplateId(v); }} />{err("labelTemplateId")}</div>
          <div className="field" data-k="layout"><label htmlFor="layout">{rl("layout")} *</label>
            <Choice tr={tr} id="layout" searchable={false} options={[["tag", pc("layoutTag")], ["a4", pc("layoutA4")]]} value={layout} onChange={pickLayout} />{err("layout")}</div>
        </div>
        <div className="formbar"><Button type="submit" variant="primary" id="go" disabled={saving}>{rl("print")}</Button></div>
      </form>
      {labels && (
        <div id="result" style={{ marginTop: 14 }}>
          <div className="card">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{rl("print")} <span className="sub">{pc("labelCount", { count: String(labels.length) })}</span></h3>
              <Button variant="primary" data-print onClick={print}>{t("common", "print")}</Button>
            </div>
            <div data-labels data-print-labels style={{ display: "flex", flexWrap: "wrap", gap: 10, maxHeight: "60vh", overflow: "auto", background: "var(--bg)", padding: 12, borderRadius: 10 }}>
              <Sheet labels={labels} layout={layout} tr={tr} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
