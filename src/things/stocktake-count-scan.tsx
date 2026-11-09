"use client";
// The page of one stock count: details, scan box (typed / hand scanner + Enter / camera), scanned pieces, Save and close, Delete.
// Open = scan more; Save closes it for good; Delete only marks it. Ported from docs/nav-preview/app/things/stocktake-count-scan.js.
// Writes: POST /stock-counts/:id/scan, POST /stock-counts/:id/save (one key per attempt, renewed after a failure), DELETE /stock-counts/:id.
// The live board (stocktake-count-board.tsx) sits under the scan box: the last scan big, the summary, the breakdowns, the pieces.
// Refusals (alreadyCounted, pieceOutsideCount, pieceNotInBranch, inTransit, pieceNotFound, countClosed) show in the last-scan card; the typed text stays.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { Row } from "@/lib/engine-types";
import { Disclosure, Button, Input, TextButton } from "@/components/ui";
import { Icon, Kv, Ltr, Section, ToastHost, toast, useConfirm } from "@/components/engine";
import { FieldError } from "@/components/fields/FieldError";
import { revealFirstError } from "@/lib/submit-guard";
import { useT } from "@/lib/t";
import { Breakdown, MissingPreview, PieceLists, ScanFeedback, Summary, useLive, type BoardPiece, type LastScan, type Live } from "./stocktake-count-board";
import { CopyButton } from "@/components/shell/copy-button";
import { CameraBox } from "./stocktake-count-camera";
import { code6, nameOf } from "./stocktake-shared";

// The dashboard's readPieceCode: trim, Arabic-Indic and Persian digits to Latin, must be 1..20 of letters, digits, space, dot.
export function readPieceCode(raw: string): { code?: string; problem?: "arabicLayout" | "notOurs" } {
  const code = String(raw).trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  if (/^[A-Za-z0-9 .]{1,20}$/.test(code)) return { code };
  return { problem: /[؀-ۿ]/.test(code) ? "arabicLayout" : "notOurs" };
}

const gone = (e: unknown) => e instanceof ApiFailure && e.status === 404;

export function ScanPage({ id, onClose }: { id: string; onClose: () => void }) {
  const tr = useT();
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("gold-stocktake", `stockCount.${k}`, v);
  const [confirm, dialog] = useConfirm();
  const [data, setData] = useState<Row | null>(null);
  const [names, setNames] = useState<{ branch: string; category: string; item: string }>({ branch: "", category: "", item: "" });
  const [loadErr, setLoadErr] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [camera, setCamera] = useState(false);
  const [camNote, setCamNote] = useState("");
  const [online, setOnline] = useState(true);
  const saveKey = useRef(newSaveKey());
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [last, setLast] = useState<LastScan | null>(null);
  const [refused, setRefused] = useState<LastScan[]>([]);
  const qc = useQueryClient();
  const open = data?.status === "open" && !data.deletedAt;
  const live = useLive(id, !!open);
  const board = live.data as Live | undefined;
  const fresh = () => qc.invalidateQueries({ queryKey: ["stock-count", id] });

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  const leaveGone = useCallback(() => { toast(m("notFound"), { error: true }); onClose(); }, [onClose]);   // eslint-disable-line react-hooks/exhaustive-deps
  const failText = (e: ApiFailure, fallback: string) => { const x = tr.errorText(e.error); return x === tr.errorText({ message: "unexpected" }) ? tr.errorText({ message: fallback }) : x; };
  const generic = L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.");

  const load = useCallback(async (first: boolean) => {
    try {
      const d = await api(`/stock-counts/${id}`);
      const [branch, category, item] = await Promise.all([nameOf("/branches", d.branchId, "branchName"), nameOf("/categories", d.categoryId, "categoryName"), nameOf("/items", d.itemId, "itemName")]);
      setNames({ branch, category, item }); setLoadErr(""); setData(d);
      if (first && d.status === "open" && !d.deletedAt) setTimeout(() => input.current?.focus(), 0);
    } catch (e) {
      if (gone(e)) return leaveGone();
      setLoadErr(e instanceof ApiFailure ? tr.errorText(e.error) : t("common", "couldNotLoad"));
    }
  }, [id, leaveGone]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(true); }, [load]);
  useEffect(() => { if (data && !open) setCamera(false); }, [data, open]);
  // Saved or deleted on another device: the board says so first; read the count again.
  useEffect(() => { if (board && data && board.status !== data.status) load(false); }, [board?.status]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function scanCode(raw: string) {
    if (!raw.trim()) { setProblem("empty"); revealFirstError(); return; }
    if (!navigator.onLine) { setProblem("offline"); revealFirstError(); return; }
    const r = readPieceCode(raw);
    setProblem(r.problem ?? "");
    if (r.problem) revealFirstError();
    if (!r.code || busy.current) return;
    busy.current = true; setScanning(true);
    try {
      const answer = await api(`/stock-counts/${id}/scan`, { method: "POST", body: { pieceCode: r.code } });
      setData(answer);
      setLast({ at: Date.now(), code: r.code, kind: "ok", piece: answer.piece as BoardPiece });
      navigator.vibrate?.(30);
      setCode(""); input.current?.focus();
      fresh();
    } catch (e) {
      if (gone(e)) return leaveGone();
      if (!(e instanceof ApiFailure) || e.status !== 409) { toast(e instanceof ApiFailure ? tr.errorText(e.error) : generic, { error: true }); return; }
      navigator.vibrate?.([60, 60, 60]);
      if (e.error?.message === "alreadyCounted") {
        // Show when and by whom it was counted: the counted list, searched by the code.
        const found = await api(`/stock-counts/${id}/pieces`, { query: { list: "counted", search: r.code } }).catch(() => null);
        const piece = (found?.items as BoardPiece[] | undefined)?.find((p) => p.pieceCode === r.code) ?? null;
        setLast({ at: Date.now(), code: r.code, kind: "already", piece });
        setCode(""); input.current?.focus();
        return;
      }
      const miss: LastScan = { at: Date.now(), code: r.code, kind: "refused", reason: tr.errorText(e.error) };
      setLast(miss); setRefused((list) => [miss, ...list].slice(0, 20));
      if (e.error?.message === "countClosed") load(false);
    } finally { busy.current = false; setScanning(false); }
  }

  async function save() {
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    if (saving || !data) return;
    // The confirmation lists what will be recorded as missing, read now (the same rule as Save).
    const now = await qc.fetchQuery({ queryKey: ["stock-count", id, "live"], queryFn: () => api(`/stock-counts/${id}/live`) as Promise<Live>, staleTime: 0 }).catch(() => board);
    if (!now) { toast(generic, { error: true }); return; }
    if (!(await confirm({ title: m("saveTitle", { code: code6(data.countNumber) }), body: <MissingPreview live={now} />, ok: m("save"), cancel: t("common", "cancel") }))) return;
    setSaving(true);
    try {
      setData(await api(`/stock-counts/${id}/save`, { method: "POST", saveKey: saveKey.current }));
      toast(m("saved"));
      fresh();
    } catch (e) {
      saveKey.current = newSaveKey();
      if (gone(e)) return leaveGone();
      toast(e instanceof ApiFailure ? failText(e, "saveFailed") : generic, { error: true });
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!navigator.onLine || !data) return;   // the dashboard's Delete does nothing while offline
    if (!(await confirm({ title: m("deleteTitle", { code: code6(data.countNumber) }), text: m("deleteBody"), ok: m("delete"), cancel: t("common", "cancel"), danger: true }))) return;
    try {
      await api(`/stock-counts/${id}`, { method: "DELETE", saveKey: newSaveKey() });
      toast(m("deleted")); onClose();
    } catch (e) {
      if (gone(e)) return leaveGone();
      toast(e instanceof ApiFailure ? failText(e, "deleteFailed") : generic, { error: true });
      load(false);   // the record is read again
    }
  }

  // While scanning (often on a phone) the scan box, the last scan and the summary come first; the details follow.
  const details = data && (
      <Section title={m("details")}>
        <Kv k={m("branch")}>{names.branch || "…"}</Kv>
        <Kv k={m("countDate")}><Ltr>{String(data.countDate).slice(0, 10)}</Ltr></Kv>
        <Kv k={m("category")}>{data.categoryId ? names.category || "…" : m("allCategories")}</Kv>
        <Kv k={m("item")}>{data.itemId ? names.item || "…" : m("anyItem")}</Kv>
        <Kv k={m("karat")}>{data.karat ? <Ltr>{data.karat}</Ltr> : m("anyKarat")}</Kv>
        <Kv k={m("scanned")}><Ltr>{m("scannedCount", { count: data.scannedCount })}</Ltr></Kv>
        {!open && <Kv k={m("missing")}><Ltr>{m("missingCount", { count: data.missingCount })}</Ltr></Kv>}
      </Section>
  );
  const heading = data ? `${m("recordNo")} ${code6(data.countNumber)}` : m("recordNo");
  return (
    <div className="thing-root" style={{ position: "relative" }}>
      <TextButton className="back" id="back" onClick={onClose}><Icon name="back" />{m("title")}</TextButton>
      <div className="head"><div><h1>{heading}</h1></div></div>
      <div className="card" id="sc">
        {!data && !loadErr && <p className="help" role="status">{t("common", "loading")}</p>}
        {loadErr && <><FieldError>{loadErr}</FieldError><Button id="sc-retry" onClick={() => load(true)}>{t("common", "retry")}</Button></>}
        {data && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
              {m("recordNo")} <span dir="ltr" style={{ fontFamily: "monospace" }}>{code6(data.countNumber)}</span>
              <CopyButton text={code6(data.countNumber)} />
              <span className={`st ${open ? "good" : "off"}`}><i />{data.deletedAt ? t("gold-sales", "salesInvoices.deletedBadge") : open ? m("statusOpen") : m("statusClosed")}</span>
            </p>
            {!data.deletedAt && <Button danger id="sc-del" onClick={remove}><Icon name="trash" />{m("delete")}</Button>}
          </div>
          {!open && details}
          {open && (
            <div id="sc-scan">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h3 className="grp-title">{m("scanTitle")}</h3>
                <Button id="sc-camtoggle" onClick={() => { setCamNote(""); setCamera((c) => !c); }}>{camera ? m("stopCamera") : m("useCamera")}</Button>
              </div>
              {camera && <div id="sc-cam"><CameraBox onCode={scanCode} onUnavailable={(why) => { setCamera(false); setCamNote(why === "denied" ? m("cameraDenied") : m("cameraUnsupported")); }} /></div>}
              {camNote && <p id="sc-note" role="status" className="help">{camNote}</p>}
              <form id="sc-form" noValidate className="field scanrow" data-k="pieceCode" data-err={problem ? "" : undefined}
                onSubmit={(e) => { e.preventDefault(); scanCode(code); }}>
                <div>
                  <label htmlFor="sc-code">{m("pieceCode")}</label>
                  <Input id="sc-code" kind="code" ref={input} dir="ltr" autoComplete="off" maxLength={20} style={{ fontFamily: "monospace" }} value={code} aria-invalid={!!problem}
                    onChange={(e) => { setCode(e.target.value); setProblem(""); }} />
                  {problem && <FieldError id="sc-err">{problem === "empty" ? m("required") : problem === "offline" ? t("common", "offline") : t("gold-sales", "pieceLookUp.notOurCode")}{problem === "arabicLayout" && <span style={{ display: "block" }}>{t("gold-sales", "pieceLookUp.switchKeyboard")}</span>}</FieldError>}
                </div>
                <Button variant="primary" type="submit" id="sc-go" disabled={scanning}>{m("scan")}</Button>
              </form>
            </div>
          )}
          {last && open && <ScanFeedback last={last} />}
          {open && refused.length > 0 && (
            <Disclosure className="sc-refused" id="sc-refused" summary={<>{m("refusedList")} ({refused.length})</>}>
              <ul>{refused.map((x) => <li key={x.at}><span dir="ltr">{x.code}</span> · {x.reason}</li>)}</ul>
            </Disclosure>
          )}
          {board && <>
            <Summary live={board} updatedAt={live.dataUpdatedAt} paused={!online && !!open} />
            {open && details}
            <Breakdown id={id} live={board} />
            <PieceLists id={id} live={board} />
          </>}
          {!board && live.isError && <FieldError>{t("common", "couldNotLoad")}</FieldError>}
          {open && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid var(--line,#ddd)", marginTop: 16, paddingTop: 12 }}>
              <Button variant="primary" id="sc-savebtn" disabled={saving} onClick={save}>{m("save")}</Button>
              <span className="help">{m("savingHint")}</span>
            </div>
          )}
        </>}
      </div>
      {dialog}
      <ToastHost />
    </div>
  );
}
