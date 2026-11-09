"use client";
// Test printer: setup/test-printer. Prints test labels (free text + a QR code) on a label printer with a size, orientation, layout and rotation
// the person can change until the printout is right. Admin and Super admin only (same gate as Settings); nothing is saved on the server,
// the settings are remembered in this browser. The rules are in printer-label-rules.ts (tested there); the print window is in components/printer-label.tsx.
import { useEffect, useRef, useState } from "react";
import { Button, FileInput, Input, Seg, Textarea } from "@/components/ui";
import { PrinterLabelPreview, printPrinterLabels } from "@/components/ui/PrinterLabel";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { useAccess } from "./sales-access";
import { DEFAULTS, PRESETS, STORAGE_KEY, clampSettings, labelList, pageSize, parseSettings, type LabelItem, type Settings } from "./printer-label-rules";

type NumKey = "widthMm" | "heightMm" | "fontPt" | "paddingMm" | "gapMm" | "qrTopMm" | "qrSizeMm" | "copies";

export default function Page() {
  const tr = useT(), { t, L } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("test-printer", k, v);
  const access = useAccess();
  const { data: me } = useMe();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [batch, setBatch] = useState<LabelItem[]>([]);
  const [batchName, setBatchName] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Read after mount (the server render has no localStorage), so the first paint is the defaults.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { setS(parseSettings(localStorage.getItem(STORAGE_KEY))); } catch { /* private mode: the defaults stay */ } setReady(true); }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* not remembered */ } }, [s, ready]);

  const set = (patch: Partial<Settings>) => setS((old) => clampSettings({ ...old, ...patch }));
  const single: LabelItem = { text: text.trim(), code: code.trim() };
  const items = batch.length ? batch : single.text || single.code ? [single] : [];
  const toPrint = labelList(items, s.copies);
  const page = pageSize(s);
  const orientationText = s.orientation === "landscape" ? m("landscape") : m("portrait");

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage("");
    try {
      const { readSheet } = await import("read-excel-file/universal");
      // Column A is the free text, column B is the QR code content
      const rows = (await readSheet(file)).map((row) => ({ text: String(row[0] ?? "").trim(), code: String(row[1] ?? "").trim() }));
      const header = rows[0] && (rows[0].text.toLowerCase() === "free text" || rows[0].code.toLowerCase() === "qr");
      const got = (header ? rows.slice(1) : rows).filter((r) => r.text || r.code);
      if (!got.length) { setMessage(m("noLabels", { name: file.name })); return; }
      setBatch(got); setBatchName(file.name);
    } catch { setMessage(m("readFail", { name: file.name })); }
  }
  const clearBatch = () => { setBatch([]); setBatchName(""); setMessage(""); };
  const print = () => printPrinterLabels(s, toPrint, { title: m("windowTitle"), print: t("common", "print"), popup: m("popup"), rtl: tr.isAr });

  // A number box keeps what is typed until it loses focus; the preview follows every valid number (clamped), the box then shows the clamped value.
  const numField = (key: NumKey, label: string, step = 1) => (
    <div className="field">
      <label htmlFor={`tp-${key}`}>{label}</label>
      <Input id={`tp-${key}`} kind="number" type="number" dir="ltr" inputMode="decimal" step={step} value={draft[key] ?? String(s[key])}
        onChange={(e) => { const v = e.target.value; setDraft({ ...draft, [key]: v }); if (v.trim() !== "" && Number.isFinite(Number(v))) set({ [key]: Number(v) }); }}
        onBlur={() => setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== key)))} />
    </div>
  );

  if (me && !(me.userType === "admin" || me.userType === "super_admin") || (access.canOpen && me && !access.canOpen(["administration/settings"]))) return <div className="empty"><strong>{L("غير مسموح لك بفتح هذه الصفحة.", "You are not allowed to open this page.")}</strong></div>;

  return (
    <div className="st-page" id="test-printer-page">
      <div className="head"><div><h1>{m("title")}</h1><div className="sub">{m("sub")}</div></div></div>
      <div className="tp-page">
        <div className="tp-settings">
          <div className="card tp-block">
            <h3>{m("content")}</h3>
            <div className="field"><label htmlFor="tp-text">{m("text")}</label>
              <Textarea id="tp-text" rows={2} maxLength={200} dir="auto" disabled={batch.length > 0} placeholder={m("textPh")} value={text} onChange={(e) => setText(e.target.value)} /></div>
            <div className="field"><label htmlFor="tp-code">{m("code")}</label>
              <Input id="tp-code" maxLength={500} dir="auto" autoComplete="off" disabled={batch.length > 0} placeholder={m("codePh")} value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <div className="tp-actions">
              <Button onClick={() => fileRef.current?.click()}>{m("import")}</Button>
              <FileInput ref={fileRef} accept=".xlsx" aria-label={m("import")} onChange={importFile} />
              {batch.length > 0 && <Button variant="plain" onClick={clearBatch}>{m("clear")}</Button>}
            </div>
            <div className="help">{m("importHint")}</div>
            {batch.length > 0 && <div className="help" role="status">{m("loaded", { count: batch.length, name: batchName })}</div>}
            {message && <div className="note warn" role="alert">{message}</div>}
          </div>

          <div className="card tp-block">
            <h3>{m("size")}</h3>
            <div className="field"><span className="lbl" id="tp-presets-l">{m("presets")}</span>
              <div className="tp-actions" role="group" aria-labelledby="tp-presets-l">
                {PRESETS.map(([w, h]) => <Button key={`${w}x${h}`} variant={s.widthMm === w && s.heightMm === h ? "primary" : "quiet"} aria-pressed={s.widthMm === w && s.heightMm === h} onClick={() => set({ widthMm: w, heightMm: h })}>{`${w} × ${h}`}</Button>)}
              </div></div>
            <div className="tp-fields">{numField("widthMm", m("width"), 0.5)}{numField("heightMm", m("height"), 0.5)}</div>
            <div className="field"><span className="lbl" id="tp-orient-l">{m("orientation")}</span>
              <Seg label={m("orientation")} value={s.orientation} onChange={(v) => set({ orientation: v })} items={[{ id: "portrait", label: m("portrait") }, { id: "landscape", label: m("landscape") }]} /></div>
            <div className="help" role="status">{m("printsAs", { w: page.w, h: page.h, orientation: orientationText })}</div>
          </div>

          <div className="card tp-block">
            <h3>{m("layout")}</h3>
            <div className="field"><span className="lbl">{m("direction")}</span>
              <Seg label={m("direction")} value={s.direction} onChange={(v) => set({ direction: v })} items={[{ id: "stacked", label: m("stacked") }, { id: "side", label: m("side") }]} /></div>
            <div className="field"><span className="lbl">{m("order")}</span>
              <Seg label={m("order")} value={s.swap ? "qr" : "text"} onChange={(v) => set({ swap: v === "qr" })} items={[{ id: "text", label: m("textFirst") }, { id: "qr", label: m("qrFirst") }]} /></div>
            <div className="field"><span className="lbl">{m("rotate")}</span>
              <Seg label={m("rotate")} value={String(s.rotate)} onChange={(v) => set({ rotate: Number(v) as Settings["rotate"] })} items={["0", "90", "180", "270"].map((d) => ({ id: d, label: `${d}°` }))} />
              <div className="help">{m("rotateHelp")}</div></div>
            <div className="field"><span className="lbl">{m("align")}</span>
              <Seg label={m("align")} value={s.align} onChange={(v) => set({ align: v })} items={[{ id: "left", label: m("left") }, { id: "center", label: m("center") }, { id: "right", label: m("right") }]} /></div>
            <div className="field"><span className="lbl">{m("level")}</span>
              <Seg label={m("level")} value={s.level} onChange={(v) => set({ level: v })} items={["L", "M", "Q", "H"].map((l) => ({ id: l as Settings["level"], label: l }))} /></div>
            <div className="tp-fields">
              {numField("fontPt", m("font"))}{numField("paddingMm", m("padding"), 0.5)}{numField("gapMm", m("gap"), 0.5)}
              {numField("qrTopMm", m("qrTop"), 0.5)}{numField("qrSizeMm", m("qrSize"), 0.5)}{numField("copies", m("copies"))}
            </div>
            <div className="tp-actions"><Button variant="plain" onClick={() => { setS(DEFAULTS); setDraft({}); }}>{m("reset")}</Button></div>
          </div>
        </div>

        <div className="card tp-preview">
          <h3>{batch.length ? m("previewAll", { count: batch.length }) : m("preview")}</h3>
          <div className="help" dir="ltr">{m("pageBox", { w: page.w, h: page.h })}</div>
          {batch.length ? (
            <div className="tp-batch">
              {batch.map((item, i) => <figure key={i}><PrinterLabelPreview s={s} item={item} boxW={110} boxH={110} /><figcaption>{i + 1}</figcaption></figure>)}
            </div>
          ) : (
            <div className="tp-stage"><PrinterLabelPreview s={s} item={single} boxW={360} boxH={300} /></div>
          )}
          <div className="tp-actions">
            <Button variant="primary" disabled={!toPrint.length} onClick={print}>{batch.length ? m("printN", { count: toPrint.length }) : t("common", "print")}</Button>
            {!toPrint.length && <span className="help">{m("nothing")}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
