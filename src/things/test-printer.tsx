"use client";
// Test printer: setup/test-printer. Prints test labels (free text + a QR code) on a label printer with a size, orientation, layout and rotation
// the person can change until the printout is right. Admin and Super admin only (same gate as Settings); nothing is saved on the server,
// the settings are remembered in this browser. The rules are in printer-label-rules.ts (tested there); the print window is in components/printer-label.tsx.
import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, FileInput, Input, Seg, Textarea, useConfirm } from "@/components/ui";
import { PrinterLabelPreview, printPrinterLabels } from "@/components/ui/PrinterLabel";
import { toast } from "@/components/engine";
import { ApiFailure } from "@/lib/api";
import { dateTimeText } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { useAccess } from "./sales-access";
import { PRESETS, STATE_KEY, STORAGE_KEY, addLine, clampSettings, defaultState, profileFromSettings, sameProfile, settingsFromProfile, effectiveLevel, hasContent, labelList, loadState, logoFileError, logoInside, logoTooBigForQr, moveLine, pageSize, removeLine, rowToItem, saveState, updateLine, type ExtraLine, type LabelItem, type Settings } from "./printer-label-rules";
import { readLogo } from "./printer-logo";
import { fetchLabelSettings, resetLabelSettings, saveLabelSettings, type SavedLabelSettings } from "./label-settings";

type NumKey = "widthMm" | "heightMm" | "fontPt" | "paddingMm" | "gapMm" | "qrTopMm" | "qrSizeMm" | "copies" | "logoMm" | "logoPct";

export default function Page() {
  const tr = useT(), { t, L } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("test-printer", k, v);
  const access = useAccess();
  const { data: me } = useMe();
  const [s, setS] = useState<Settings>(() => defaultState().settings);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [batch, setBatch] = useState<LabelItem[]>([]);
  const [batchName, setBatchName] = useState("");
  const [message, setMessage] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [logoMsg, setLogoMsg] = useState("");
  const [server, setServer] = useState<SavedLabelSettings | null | undefined>(undefined);   // undefined = still asking, null = could not ask
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const hadLocal = useRef(true);
  const [confirm, dialog] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Read after mount (the server render has no localStorage), so the first paint is the defaults.
  useEffect(() => {
    try {
      hadLocal.current = localStorage.getItem(STATE_KEY) !== null || localStorage.getItem(STORAGE_KEY) !== null;
      const st = loadState(localStorage.getItem(STATE_KEY), localStorage.getItem(STORAGE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setS(st.settings); setText(st.text); setCode(st.code); setBatch(st.batch); setBatchName(st.batchName);
    } catch { /* private mode: the defaults stay */ }
    setReady(true);
  }, []);
  // The look saved for the whole ERP. With nothing of its own in this browser the page starts from it (and only while the person has not changed anything yet).
  useEffect(() => {
    let live = true;
    fetchLabelSettings().then((r) => {
      if (!live) return;
      setServer(r);
      const p = r.profile;
      if (p && !hadLocal.current) setS((old) => (sameProfile(profileFromSettings(old), profileFromSettings(defaultState().settings)) ? settingsFromProfile(p) : old));
    }, () => { if (live) setServer(null); });
    return () => { live = false; };
  }, []);
  // Everything is saved about 300 ms after the last change. A full or blocked storage never breaks the page: one plain line says so.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      try {
        const out = saveState({ settings: s, text, code, batch, batchName });
        localStorage.setItem(STATE_KEY, out.json);
        setSaveNote(out.batchDropped ? m("batchNotSaved") : "");
      } catch { setSaveNote(m("saveFail")); }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, text, code, batch, batchName, ready]);

  const set = (patch: Partial<Settings>) => setS((old) => clampSettings({ ...old, ...patch }));
  const single: LabelItem = { text: text.trim(), code: code.trim() };
  const items = batch.length ? batch : hasContent(single) || s.lines.some((l) => l.text.trim()) ? [single] : [];
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
      // Column A is the free text, B the QR code content, C onward the extra lines
      const rows = (await readSheet(file)).map(rowToItem);
      const header = rows[0] && (rows[0].text.toLowerCase() === "free text" || rows[0].code.toLowerCase() === "qr");
      const got = (header ? rows.slice(1) : rows).filter(hasContent);
      if (!got.length) { setMessage(m("noLabels", { name: file.name })); return; }
      setBatch(got); setBatchName(file.name);
    } catch { setMessage(m("readFail", { name: file.name })); }
  }
  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoMsg("");
    const bad = logoFileError(file);
    if (bad) { setLogoMsg(m(bad)); return; }
    try { set({ logo: await readLogo(file) }); } catch { setLogoMsg(m("logoReadFail")); }
  }
  async function resetAll() {
    if (!(await confirm({ title: m("resetAllTitle"), text: m("resetAllText"), ok: m("resetAll"), cancel: t("common", "cancel"), danger: true }))) return;
    const d = defaultState();
    try { localStorage.removeItem(STATE_KEY); localStorage.removeItem(STORAGE_KEY); } catch { /* blocked: nothing stored to clear */ }
    setS(d.settings); setText(d.text); setCode(d.code); setBatch(d.batch); setBatchName(d.batchName); setDraft({}); setMessage(""); setLogoMsg("");
  }
  const errText = (e: unknown) => !(e instanceof ApiFailure) ? m("labelErrFail") : e.unreachable ? m("labelErrOffline") : e.status === 403 ? m("labelErrForbidden") : e.status === 413 ? m("labelErrTooBig") : m("labelErrFail");
  async function saveForAll() {
    setBusy(true); setSaveErr("");
    try { setServer(await saveLabelSettings(profileFromSettings(s))); toast(m("labelSavedToast")); } catch (e) { setSaveErr(errText(e)); }
    setBusy(false);
  }
  async function backToFactory() {
    if (!(await confirm({ title: m("labelFactoryTitle"), text: m("labelFactoryText"), ok: m("labelFactory"), cancel: t("common", "cancel"), danger: true }))) return;
    setBusy(true); setSaveErr("");
    try { await resetLabelSettings(); setServer({ profile: null, updatedAt: null, updatedByName: null }); toast(m("labelFactoryToast")); } catch (e) { setSaveErr(errText(e)); }
    setBusy(false);
  }
  const saved = server?.profile ?? null;
  const status = server === undefined ? "" : saveErr ? saveErr : server === null ? m("labelLoadFail") : !saved ? m("labelNothing")
    : !sameProfile(saved, profileFromSettings(s)) ? m("labelChanged")
    : server?.updatedByName ? m("labelSavedBy", { name: server.updatedByName, when: dateTimeText(server.updatedAt, tr.locale) }) : m("labelSavedOn", { when: dateTimeText(server?.updatedAt, tr.locale) });
  const clearBatch = () => { setBatch([]); setBatchName(""); setMessage(""); };
  const print = () => printPrinterLabels(s, toPrint, { title: m("windowTitle"), print: t("common", "print"), popup: m("popup"), rtl: tr.isAr });

  // A number box keeps what is typed until it loses focus; the preview follows every valid number (clamped), the box then shows the clamped value.
  const numBox = (id: string, label: string, value: number, apply: (n: number) => void, whole = false, help = "") => (
    <div className="field">
      <label htmlFor={`tp-${id}`}>{label}</label>
      <Input id={`tp-${id}`} kind="number" type="number" dir="ltr" inputMode="decimal" step={whole ? 1 : "any"} value={draft[id] ?? String(value)}
        onChange={(e) => { const v = e.target.value; setDraft({ ...draft, [id]: v }); if (v.trim() !== "" && Number.isFinite(Number(v))) apply(Number(v)); }}
        onBlur={() => setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)))} />
      {help && <div className="help">{help}</div>}
    </div>
  );
  const numField = (key: NumKey, label: string, help = "") => numBox(key, label, s[key], (n) => set({ [key]: n }), key === "copies", help);
  const setLines = (lines: ExtraLine[]) => { setDraft({}); set({ lines }); };
  const patchLine = (i: number, patch: Partial<ExtraLine>) => set({ lines: updateLine(s.lines, i, patch) });

  if (me && !(me.userType === "admin" || me.userType === "super_admin") || (access.canOpen && me && !access.canOpen(["administration/settings"]))) return <div className="empty"><strong>{L("غير مسموح لك بفتح هذه الصفحة.", "You are not allowed to open this page.")}</strong></div>;

  return (
    <div className="st-page" id="test-printer-page">
      <div className="head"><div><h1>{m("title")}</h1><div className="sub">{m("sub")}</div></div></div>
      {dialog}
      <div className="tp-page">
        <div className="tp-settings">
          <div className="tp-actions">
            <Button danger onClick={resetAll}>{m("resetAll")}</Button>
            {saveNote && <span className="help" role="status">{saveNote}</span>}
          </div>
          <div className="card tp-block">
            <h3>{m("size")}</h3>
            <div className="field"><span className="lbl" id="tp-presets-l">{m("presets")}</span>
              <div className="tp-actions" role="group" aria-labelledby="tp-presets-l">
                {PRESETS.map(([w, h]) => <Button key={`${w}x${h}`} variant={s.widthMm === w && s.heightMm === h ? "primary" : "quiet"} aria-pressed={s.widthMm === w && s.heightMm === h} onClick={() => set({ widthMm: w, heightMm: h })}>{`${w} × ${h}`}</Button>)}
              </div></div>
            <div className="tp-fields">{numField("widthMm", m("width"), m("widthHelp"))}{numField("heightMm", m("height"), m("heightHelp"))}</div>
            <div className="field"><span className="lbl" id="tp-orient-l">{m("orientation")}</span>
              <Seg label={m("orientation")} value={s.orientation} onChange={(v) => set({ orientation: v })} items={[{ id: "portrait", label: m("portrait") }, { id: "landscape", label: m("landscape") }]} />
              <div className="help">{m("orientationHelp")}</div></div>
            <div className="help" role="status">{m("printsAs", { w: page.w, h: page.h, orientation: orientationText })}</div>
          </div>

          <div className="card tp-block">
            <h3>{m("content")}</h3>
            <div className="field"><label htmlFor="tp-text">{m("text")}</label>
              <Textarea id="tp-text" rows={2} maxLength={200} dir="auto" disabled={batch.length > 0} placeholder={m("textPh")} value={text} onChange={(e) => setText(e.target.value)} /></div>
            <div className="tp-fields">{numField("fontPt", m("font"), m("fontHelp"))}</div>
            <div className="field"><span className="lbl">{m("align")}</span>
              <Seg label={m("align")} value={s.align} onChange={(v) => set({ align: v })} items={[{ id: "left", label: m("left") }, { id: "center", label: m("center") }, { id: "right", label: m("right") }]} />
              <div className="help">{m("alignHelp")}</div></div>
            <div className="tp-lines">
              {s.lines.map((l, i) => (
                <div className="tp-line" key={i} role="group" aria-label={m("lineN", { n: i + 1 })}>
                  <div className="field"><label htmlFor={`tp-line-${i}`}>{m("lineN", { n: i + 1 })}</label>
                    <Input id={`tp-line-${i}`} dir="auto" autoComplete="off" maxLength={200} placeholder={m("linePh")} value={l.text} onChange={(e) => patchLine(i, { text: e.target.value })} /></div>
                  <div className="tp-fields">
                    {numBox(`line-${i}-pt`, m("lineFont"), l.fontPt, (n) => patchLine(i, { fontPt: n }))}
                    <div className="field"><span className="lbl">{m("lineAlign")}</span>
                      <Seg label={m("lineAlign")} value={l.align} onChange={(v) => patchLine(i, { align: v })} items={[{ id: "inherit", label: m("inherit") }, { id: "left", label: m("left") }, { id: "center", label: m("center") }, { id: "right", label: m("right") }]} /></div>
                  </div>
                  <div className="tp-actions">
                    <Checkbox checked={l.bold} onChange={(v) => patchLine(i, { bold: v })}>{m("bold")}</Checkbox>
                    <Checkbox checked={l.keepBlank} onChange={(v) => patchLine(i, { keepBlank: v })}>{m("keepBlank")}</Checkbox>
                    <Button size="sm" disabled={i === 0} onClick={() => setLines(moveLine(s.lines, i, -1))}>{m("up")}</Button>
                    <Button size="sm" disabled={i === s.lines.length - 1} onClick={() => setLines(moveLine(s.lines, i, 1))}>{m("down")}</Button>
                    <Button size="sm" danger onClick={() => setLines(removeLine(s.lines, i))}>{m("remove")}</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="tp-actions">
              <Button onClick={() => setLines(addLine(s.lines, s.fontPt))}>{m("addLine")}</Button>
              <span className="help" role="status">{m("linesCount", { count: s.lines.length })}</span>
            </div>
            <div className="field"><span className="lbl">{m("placement")}</span>
              <Seg label={m("placement")} value={s.linesPlacement} onChange={(v) => set({ linesPlacement: v })} items={[{ id: "afterText", label: m("afterText") }, { id: "afterQr", label: m("afterQr") }]} />
              <div className="help">{m("linesHelp")}</div></div>
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
            <h3>{m("qrSection")}</h3>
            <div className="field"><label htmlFor="tp-code">{m("code")}</label>
              <Input id="tp-code" maxLength={500} dir="auto" autoComplete="off" disabled={batch.length > 0} placeholder={m("codePh")} value={code} onChange={(e) => setCode(e.target.value)} />
              <div className="help">{m("codeHelp")}</div></div>
            <div className="tp-fields">{numField("qrSizeMm", m("qrSize"), m("qrSizeHelp"))}{numField("qrTopMm", m("qrTop"), m("qrTopHelp"))}</div>
            <div className="field"><span className="lbl">{m("level")}</span>
              <Seg label={m("level")} value={effectiveLevel(s)} onChange={(v) => { if (!logoInside(s)) set({ level: v }); }} items={["L", "M", "Q", "H"].map((l) => ({ id: l as Settings["level"], label: l }))} />
              <div className="help">{m("levelHelp")}</div></div>
          </div>

          <div className="card tp-block">
            <h3>{m("logo")}</h3>
            <div className="tp-actions">
              <Button onClick={() => logoRef.current?.click()}>{s.logo ? m("logoChange") : m("logoUpload")}</Button>
              <FileInput ref={logoRef} accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" aria-label={m("logoUpload")} onChange={pickLogo} />
              {s.logo && <Button variant="plain" danger onClick={() => set({ logo: "" })}>{m("logoRemove")}</Button>}
            </div>
            {s.logo && <div className="tp-thumb"><img src={s.logo} alt={m("logo")} /></div>}
            <div className="help">{m("logoHint")}</div>
            {logoMsg && <div className="note warn" role="alert">{logoMsg}</div>}
            <div className="field"><span className="lbl">{m("logoPlace")}</span>
              <Seg label={m("logoPlace")} value={s.logoPlacement} onChange={(v) => set({ logoPlacement: v })} items={[{ id: "beside", label: m("logoBeside") }, { id: "inside", label: m("logoInside") }, { id: "none", label: m("logoNone") }]} />
              <div className="help">{m("logoPlaceHelp")}</div></div>
            {s.logoPlacement === "inside"
              ? numField("logoPct", m("logoPct"))
              : s.logoPlacement === "beside" && numField("logoMm", m("logoMm"))}
            {logoInside(s) && <div className="help" role="status">{m("logoLevelH")}</div>}
            {logoTooBigForQr(s) && <div className="note warn" role="alert">{m("logoTooBig30")}</div>}
          </div>

          <div className="card tp-block">
            <h3>{m("printing")}</h3>
            <div className="field"><span className="lbl">{m("rotate")}</span>
              <Seg label={m("rotate")} value={String(s.rotate)} onChange={(v) => set({ rotate: Number(v) as Settings["rotate"] })} items={["0", "90", "180", "270"].map((d) => ({ id: d, label: `${d}°` }))} />
              <div className="help">{m("rotateHelp")}</div></div>
            <div className="tp-fields">{numField("copies", m("copies"), m("copiesHelp"))}</div>
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
            <>
              <div className="tp-stage"><PrinterLabelPreview s={s} item={single} boxW={360} boxH={300} onOrder={(order) => set({ order })} /></div>
              <div className="help">{m("dragHint")}</div>
              <div className="field"><span className="lbl">{m("direction")}</span>
                <Seg label={m("direction")} value={s.direction} onChange={(v) => set({ direction: v })} items={[{ id: "side", label: m("side") }, { id: "stacked", label: m("stacked") }]} /></div>
              <div className="tp-fields">{numField("paddingMm", m("padding"), m("paddingHelp"))}{numField("gapMm", m("gap"), m("gapHelp"))}</div>
            </>
          )}
          <div className="tp-actions">
            <Button variant="primary" disabled={!toPrint.length} onClick={print}>{batch.length ? m("printN", { count: toPrint.length }) : t("common", "print")}</Button>
            {!toPrint.length && <span className="help">{m("nothing")}</span>}
          </div>
        </div>
      </div>
      <div className="formbar" id="tp-save-bar">
        <Button variant="primary" id="tp-save-all" disabled={busy || server === undefined} onClick={saveForAll}>{m("labelSave")}</Button>
        <Button danger disabled={busy || !saved} onClick={backToFactory}>{m("labelFactory")}</Button>
        {status && <span role="status" id="tp-save-status">{status}</span>}
      </div>
    </div>
  );
}
