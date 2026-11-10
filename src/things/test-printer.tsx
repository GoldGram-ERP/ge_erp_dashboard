"use client";
// Test printer: setup/test-printer. Prints test labels (free text + a QR code) on a label printer with a size, orientation, layout and rotation
// the person can change until the printout is right. Admin and Super admin only (same gate as Settings); nothing is saved on the server,
// the settings are remembered in this browser. The rules are in printer-label-rules.ts (tested there); the print window is in components/printer-label.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox, FileInput, Input, Seg, Textarea, useConfirm } from "@/components/ui";
import { PrinterLabelPreview, printPrinterLabels } from "@/components/ui/PrinterLabel";
import { toast } from "@/components/engine";
import { ApiFailure } from "@/lib/api";
import { dateTimeText } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { useAccess } from "./sales-access";
import { CROSSES, PRESETS, STATE_KEY, STORAGE_KEY, addLine, applyProfile, clampSettings, defaultState, lookKey, profileFromSettings, syncChoice, hasContent, labelList, loadState, logoFileError, logoInside, logoTooBigForQr, moveLine, pageSize, removeLine, rowToItem, saveState, updateLine, type Cross, type ExtraLine, type LabelItem, type Part, type Settings } from "./printer-label-rules";
import { readLogo } from "./printer-logo";
import { fetchLabelSettings, resetLabelSettings, saveLabelSettings } from "./label-settings";

const SYNC_KEY = "test-printer-sync-v1", LOOK_QUERY = ["label-settings"];

type Tab = "label" | Part;
type NumKey = "widthMm" | "heightMm" | "fontPt" | "paddingMm" | "gapMm" | "qrSizeMm" | "copies" | "logoMm" | "logoPct" | "textWidthMm";

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
  const qc = useQueryClient();
  // The look saved for the whole ERP, read again whenever this tab is looked at and every 30 s, never from a cache: what another Admin saves shows here.
  const look = useQuery({ queryKey: LOOK_QUERY, queryFn: ({ signal }) => fetchLabelSettings(signal), staleTime: 0, gcTime: 0, refetchOnMount: "always", refetchOnWindowFocus: "always", refetchInterval: 30_000, retry: 1 });
  const server = look.data ?? (look.isError ? null : undefined);   // undefined = still asking, null = could not ask
  const [newer, setNewer] = useState<{ name: string | null; at: string | null } | null>(null);   // somebody saved a newer look while this page has unsaved changes
  const sync = useRef<{ aligned: string | null; base: string | null }>({ aligned: null, base: null });   // the look this page last matched, and when that look was saved
  const sRef = useRef(s);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("label");
  const [at, setAt] = useState(0);   // which Excel label the canvas shows
  const [saveErr, setSaveErr] = useState("");
  const [confirm, dialog] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Read after mount (the server render has no localStorage), so the first paint is the defaults.
  useEffect(() => {
    try {
      try { const o = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null"); if (o && typeof o === "object") sync.current = { aligned: typeof o.aligned === "string" ? o.aligned : null, base: typeof o.base === "string" ? o.base : null }; } catch { /* nothing remembered */ }
      const st = loadState(localStorage.getItem(STATE_KEY), localStorage.getItem(STORAGE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setS(st.settings); setText(st.text); setCode(st.code); setBatch(st.batch); setBatchName(st.batchName);
    } catch { /* private mode: the defaults stay */ }
    setReady(true);
  }, []);
  const profile = useMemo(() => profileFromSettings(s), [s]);
  const styleKey = useMemo(() => lookKey(profile), [profile]);
  const saved = server?.profile ?? null;
  const savedKey = useMemo(() => lookKey(saved), [saved]);
  useEffect(() => { sRef.current = s; });
  // Remember which saved look this page matches (so later it can tell its own unsaved changes from an old copy) and write it down for the next visit.
  const align = (key: string, at: string | null) => {
    sync.current = { aligned: key, base: at };
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync.current)); } catch { /* not remembered */ }
  };
  const showSaved = () => {
    if (!saved) return;
    const next = applyProfile(sRef.current, saved);
    setS(next); setDraft({}); setNewer(null);
    align(lookKey(profileFromSettings(next)), server?.updatedAt ?? null);
  };
  // When the saved look is read: show it (nothing of this person's own to lose), keep the person's own changes, or say a newer one exists (owner, 2026-11-10).
  useEffect(() => {
    if (!ready || !server) return;
    const mine = lookKey(profileFromSettings(sRef.current));
    if (!sync.current.aligned && !savedKey) { align(mine, null); return; }
    const what = syncChoice({ serverKey: savedKey, serverAt: server.updatedAt, styleKey: mine, aligned: sync.current.aligned, base: sync.current.base });
    if (what === "server") showSaved();
    else if (what === "same") { align(mine, server.updatedAt); setNewer(null); }
    else if (what === "ask") setNewer({ name: server.updatedByName, at: server.updatedAt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, savedKey, server?.updatedAt]);
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
      setBatch(got); setBatchName(file.name); setAt(0);
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
    try { const r = await saveLabelSettings(profile); qc.setQueryData(LOOK_QUERY, r); align(styleKey, r.updatedAt); setNewer(null); toast(m("labelSavedToast")); } catch (e) { setSaveErr(errText(e)); }
    setBusy(false);
  }
  async function backToFactory() {
    if (!(await confirm({ title: m("labelFactoryTitle"), text: m("labelFactoryText"), ok: m("labelFactory"), cancel: t("common", "cancel"), danger: true }))) return;
    setBusy(true); setSaveErr("");
    try { await resetLabelSettings(); qc.setQueryData(LOOK_QUERY, { profile: null, updatedAt: null, updatedByName: null }); setNewer(null); toast(m("labelFactoryToast")); } catch (e) { setSaveErr(errText(e)); }
    setBusy(false);
  }
  const status = server === undefined ? "" : saveErr ? saveErr : server === null ? m("labelLoadFail") : !saved ? m("labelNothing")
    : savedKey !== styleKey ? m("labelChanged")
    : server?.updatedByName ? m("labelSavedBy", { name: server.updatedByName, when: dateTimeText(server.updatedAt, tr.locale) }) : m("labelSavedOn", { when: dateTimeText(server?.updatedAt, tr.locale) });
  const clearBatch = () => { setBatch([]); setBatchName(""); setMessage(""); setAt(0); };
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

  const tabs: { id: Tab; label: string }[] = [{ id: "label", label: m("tabLabel") }, { id: "text", label: m("content") }, { id: "logo", label: m("logo") }, { id: "qr", label: m("qrSection") }];
  const pickPart = (p: Part) => setTab(p);
  // Where one part sits across the row: top / middle / bottom side by side, start / middle / end stacked (like flex align-self).
  const placeSeg = (part: Part) => {
    const side = s.direction === "side", names: Record<Cross, string> = side ? { start: m("placeTop"), center: m("placeMiddle"), end: m("placeBottom") } : { start: m("placeStart"), center: m("placeMiddle"), end: m("placeEnd") };
    return <div className="field"><span className="lbl">{m("crossPlace")}</span>
      <Seg label={m("crossPlace")} value={s.cross[part]} onChange={(v) => set({ cross: { ...s.cross, [part]: v } })} items={CROSSES.map((c) => ({ id: c, label: names[c] }))} /></div>;
  };
  const dir = (label: string, control: React.ReactNode) => <div className="tp-dir"><span className="lbl">{label}</span>{control}</div>;
  // With nothing typed yet the canvas shows sample content, so there is always something to see and drag; printing uses only what was typed.
  const shownItem = batch.length ? batch[Math.min(at, batch.length - 1)] : { text: single.text || m("sampleText"), code: single.code || "GE-SAMPLE-0001" };

  return (
    <div className="st-page" id="test-printer-page">
      <div className="head"><div><h1>{m("title")}</h1><div className="sub">{m("sub")}</div></div></div>
      {dialog}
      <div className="tp-designer">
        <div className="card tp-canvas">
          <div className="tp-stage"><PrinterLabelPreview s={s} item={shownItem} selected={tab === "label" ? null : tab} onPick={pickPart} onOrder={(order) => set({ order })} onPlace={(part, c) => set({ cross: { ...s.cross, [part]: c } })} onResize={(patch) => { setDraft({}); set(patch); }} /></div>
          <div className="tp-bar">
            <span className="help" dir="ltr">{m("pageBox", { w: page.w, h: page.h })}</span>
            {batch.length > 0 && (
              <span className="tp-actions">
                <Button size="sm" disabled={at === 0} aria-label={m("prev")} onClick={() => setAt(at - 1)}>‹</Button>
                <span className="help" role="status">{m("batchOf", { n: Math.min(at, batch.length - 1) + 1, count: batch.length })}</span>
                <Button size="sm" disabled={at >= batch.length - 1} aria-label={m("next")} onClick={() => setAt(at + 1)}>›</Button>
              </span>
            )}
          </div>
          <div className="help">{m("dragHint")}</div>
          {/* Every choice of direction or place lives here, beside the label it changes; the panel on the right only holds what is typed or uploaded. */}
          <div className="tp-dirs">
            {dir(m("orientation"), <Seg label={m("orientation")} value={s.orientation} onChange={(v) => set({ orientation: v })} items={[{ id: "portrait", label: m("portrait") }, { id: "landscape", label: m("landscape") }]} />)}
            {dir(m("rotate"), <Seg label={m("rotate")} value={String(s.rotate)} onChange={(v) => set({ rotate: Number(v) as Settings["rotate"] })} items={["0", "90", "180", "270"].map((d) => ({ id: d, label: `${d}°` }))} />)}
            {dir(m("direction"), <Seg label={m("direction")} value={s.direction} onChange={(v) => set({ direction: v })} items={[{ id: "side", label: m("side") }, { id: "stacked", label: m("stacked") }]} />)}
            {dir(m("spread"), <Seg label={m("spread")} value={s.spread} onChange={(v) => set({ spread: v })} items={[{ id: "together", label: m("spreadTogether") }, { id: "edges", label: m("spreadEdges") }, { id: "even", label: m("spreadEven") }]} />)}
            {dir(m("align"), <Seg label={m("align")} value={s.align} onChange={(v) => set({ align: v })} items={[{ id: "left", label: m("left") }, { id: "center", label: m("center") }, { id: "right", label: m("right") }]} />)}
            {s.lines.length > 0 && dir(m("placement"), <Seg label={m("placement")} value={s.linesPlacement} onChange={(v) => set({ linesPlacement: v })} items={[{ id: "afterText", label: m("afterText") }, { id: "afterQr", label: m("afterQr") }]} />)}
            {s.logo && dir(m("logoPlace"), <Seg label={m("logoPlace")} value={s.logoPlacement} onChange={(v) => set({ logoPlacement: v })} items={[{ id: "beside", label: m("logoBeside") }, { id: "inside", label: m("logoInside") }, { id: "none", label: m("logoNone") }]} />)}
          </div>
          <div className="tp-actions">
            <Button variant="primary" disabled={!toPrint.length} onClick={print}>{batch.length ? m("printN", { count: toPrint.length }) : t("common", "print")}</Button>
            {!toPrint.length && <span className="help">{m("nothing")}</span>}
          </div>
        </div>

        <div className="card tp-inspector">
          <figure className="tp-pure"><PrinterLabelPreview s={s} item={shownItem} boxW={240} boxH={120} /><figcaption className="help">{m("asPrinted")}</figcaption></figure>
          <Seg label={m("inspector")} value={tab} onChange={(v) => setTab(v)} items={tabs} />
          {tab === "label" && <>
            <div className="field"><span className="lbl" id="tp-presets-l">{m("presets")}</span>
              <div className="tp-actions" role="group" aria-labelledby="tp-presets-l">
                {PRESETS.map(([w, h]) => <Button key={`${w}x${h}`} variant={s.widthMm === w && s.heightMm === h ? "primary" : "quiet"} aria-pressed={s.widthMm === w && s.heightMm === h} onClick={() => set({ widthMm: w, heightMm: h })}>{`${w} × ${h}`}</Button>)}
              </div></div>
            <div className="tp-fields">{numField("widthMm", m("width"))}{numField("heightMm", m("height"))}</div>
            <div className="tp-fields">{numField("paddingMm", m("padding"))}{numField("gapMm", m("gap"))}{numField("copies", m("copies"))}</div>
            <div className="tp-actions">
              <Button onClick={() => fileRef.current?.click()}>{m("import")}</Button>
              <FileInput ref={fileRef} accept=".xlsx" aria-label={m("import")} onChange={importFile} />
              {batch.length > 0 && <Button variant="plain" onClick={clearBatch}>{m("clear")}</Button>}
            </div>
            <div className="help">{m("importHint")}</div>
            {batch.length > 0 && <div className="help" role="status">{m("loaded", { count: batch.length, name: batchName })}</div>}
            {message && <div className="note warn" role="alert">{message}</div>}
            <div className="tp-actions">
              <Button danger onClick={resetAll}>{m("resetAll")}</Button>
              {saveNote && <span className="help" role="status">{saveNote}</span>}
            </div>
          </>}
          {tab === "text" && <>
            <div className="field"><label htmlFor="tp-text">{m("text")}</label>
              <Textarea id="tp-text" rows={2} maxLength={200} dir="auto" disabled={batch.length > 0} placeholder={m("textPh")} value={text} onChange={(e) => setText(e.target.value)} /></div>
            <div className="tp-fields">{numField("fontPt", m("font"))}{numField("textWidthMm", m("textWidth"))}</div>
            {placeSeg("text")}
            <div className="tp-lines">
              {s.lines.map((l, i) => (
                <div className="tp-line" key={i} role="group" aria-label={m("lineN", { n: i + 1 })}>
                  <div className="field"><label htmlFor={`tp-line-${i}`}>{m("lineN", { n: i + 1 })}</label>
                    <Input id={`tp-line-${i}`} dir="auto" autoComplete="off" maxLength={200} placeholder={m("linePh")} value={l.text} onChange={(e) => patchLine(i, { text: e.target.value })} /></div>
                  <div className="tp-fields">
                    {numBox(`line-${i}-pt`, m("lineFont"), l.fontPt, (n) => patchLine(i, { fontPt: n }))}
                  </div>
                  <div className="tp-actions">
                    <Checkbox checked={l.bold} onChange={(v) => patchLine(i, { bold: v })}>{m("bold")}</Checkbox>
                    <Button size="sm" danger onClick={() => setLines(removeLine(s.lines, i))}>{m("remove")}</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="tp-actions">
              <Button onClick={() => setLines(addLine(s.lines, s.fontPt))}>{m("addLine")}</Button>
              <span className="help" role="status">{m("linesCount", { count: s.lines.length })}</span>
            </div>
          </>}
          {tab === "logo" && <>
            <div className="tp-actions">
              <Button onClick={() => logoRef.current?.click()}>{s.logo ? m("logoChange") : m("logoUpload")}</Button>
              <FileInput ref={logoRef} accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" aria-label={m("logoUpload")} onChange={pickLogo} />
              {s.logo && <Button variant="plain" danger onClick={() => set({ logo: "" })}>{m("logoRemove")}</Button>}
            </div>
            {s.logo && <div className="tp-thumb"><img src={s.logo} alt={m("logo")} /></div>}
            {s.logo && s.logoPlacement === "beside" && placeSeg("logo")}
            <div className="help">{m("logoHint")}</div>
            {logoMsg && <div className="note warn" role="alert">{logoMsg}</div>}
            {s.logoPlacement === "inside"
              ? numField("logoPct", m("logoPct"))
              : s.logoPlacement === "beside" && numField("logoMm", m("logoMm"))}
            {logoInside(s) && <div className="help" role="status">{m("logoLevelH")}</div>}
            {logoTooBigForQr(s) && <div className="note warn" role="alert">{m("logoTooBig30")}</div>}
          </>}
          {tab === "qr" && <>
            <div className="field"><label htmlFor="tp-code">{m("code")}</label>
              <Input id="tp-code" maxLength={500} dir="auto" autoComplete="off" disabled={batch.length > 0} placeholder={m("codePh")} value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <div className="tp-fields">{numField("qrSizeMm", m("qrSize"))}</div>
            {placeSeg("qr")}
          </>}
        </div>
      </div>
      <div className="formbar" id="tp-save-bar">
        <Button variant="primary" id="tp-save-all" disabled={busy || server === undefined} onClick={saveForAll}>{m("labelSave")}</Button>
        <Button danger disabled={busy || !saved} onClick={backToFactory}>{m("labelFactory")}</Button>
        {status && <span role="status" id="tp-save-status">{status}</span>}
        {newer && <>
          <span role="status" id="tp-newer">{newer.name ? m("labelNewer", { name: newer.name, when: dateTimeText(newer.at, tr.locale) }) : m("labelNewerAnon", { when: dateTimeText(newer.at, tr.locale) })}</span>
          <Button id="tp-load-newer" onClick={showSaved}>{m("labelLoadNewer")}</Button>
        </>}
      </div>
    </div>
  );
}
