"use client";
// The Send page of money/transfers: POST /treasury-transfers (an EGP treasury sends an amount, a Gold treasury sends scanned pieces and
// bulk gold per karat). Ported from docs/nav-preview/app/things/treasury-transfer-send.js. A per-person draft is kept in localStorage.
// Not built (as in the HTML): the record picker under the code box and the camera scan button (typing / a hand scanner + Enter do the same).
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Option, Row } from "@/lib/engine-types";
import { milligramsText, piastresText, typedMilligrams, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Icon, toast } from "@/components/engine";
import { FieldError } from "@/components/fields/FieldError";
import { revealFirstError } from "@/lib/submit-guard";
import { Select } from "@/components/fields/Select";
import { Button, Input } from "@/components/ui";
import { code6 } from "./money-shared";

const KARATS = ["18", "21", "24", "999"];
const PIECES_MAX = 500;
const WEIGHT_MAX_MG = 9_999_999_999;   // backend cap (the dashboard lets 10 digits of grams through; follow the BACKEND)
type Piece = { pieceCode: string; itemName: string; karat: string; weightMg: number; refused?: string };
type Draft = { toTreasuryId: string; pieces: Piece[]; gold: { karat: string; weightMg: number }[]; amount: string };
const emptyDraft = (): Draft => ({ toTreasuryId: "", pieces: [], gold: [], amount: "" });
const choiceText = (x: Row) => (!x.branchName ? x.treasuryName : String(x.treasuryName).includes(x.branchName) ? x.branchName : `${x.treasuryName} · ${x.branchName}`);

// Same reading as the dashboard's readPieceCode (a code not ours is never sent to the server).
function readPieceCode(raw: string): { code?: string; problem?: "arabicLayout" | "notOurs" } {
  const code = raw.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  if (/^[A-Za-z0-9 .]{1,20}$/.test(code)) return { code };
  return { problem: /[؀-ۿ]/.test(code) ? "arabicLayout" : "notOurs" };
}

export function SendTransferForm({ tr }: CustomFormProps) {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("treasury-transfers", k, v);
  const kc = (k: string) => t("treasuries", `kindChoice.${k}`);
  const chooseTreasury = L("اختر الخزنة", "Choose the treasury");
  const { data: me } = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const draftKey = (from: string) => `ge-erp:transfer-draft:${me?.id}:${from}`;
  const readDraft = (from: string): Draft => { try { const d = JSON.parse(localStorage.getItem(draftKey(from)) ?? "null"); return d && Array.isArray(d.pieces) && Array.isArray(d.gold) ? { ...emptyDraft(), ...d } : emptyDraft(); } catch { return emptyDraft(); } };

  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [err, setErr] = useState("");
  const [scan, setScan] = useState<{ ok: boolean; text: string }>({ ok: true, text: "" });
  const [goldErr, setGoldErr] = useState("");
  const [code, setCode] = useState("");
  const [goldKarat, setGoldKarat] = useState("");
  const [goldWeight, setGoldWeight] = useState("");
  const [sending, setSending] = useState(false);
  const key = useRef(newSaveKey());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const draftRef = useRef(draft); draftRef.current = draft;
  const fromRef = useRef(from); fromRef.current = from;

  const mine = useQuery({ queryKey: ["transfer-send-treasuries"], queryFn: () => api("/treasuries", { query: { handledByMe: "true" } }) });
  const items: Row[] = ((mine.data?.items ?? []) as Row[]).filter((x) => x.kind !== "secondary");
  const held = [...new Set(items.map((x) => x.kind))];
  const kindOf = (id: string) => items.find((x) => x.id === id)?.kind;
  const k = kindOf(from);
  const fromOptions = (kk: string): Option[] => items.filter((x) => x.kind === kk).map((x) => [x.id, choiceText(x)]);

  const targetsQ = useQuery({ enabled: !!from, queryKey: ["transfer-targets", from], queryFn: () => api("/treasuries/targets", { query: { fromTreasuryId: from } }) });
  const targets: Row[] = (targetsQ.data?.items ?? []) as Row[];
  useEffect(() => { if (targetsQ.error) setErr(tr.errorText((targetsQ.error as any).error)); }, [targetsQ.error]);   // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch: Partial<Draft>) => {
    const d = { ...draftRef.current, ...patch };
    setDraft(d); draftRef.current = d;
    if (fromRef.current) localStorage.setItem(draftKey(fromRef.current), JSON.stringify(d));
    setErr("");
  };
  function pickFrom(id: string) {
    setFrom(id); fromRef.current = id; key.current = newSaveKey(); setErr(""); setScan({ ok: true, text: "" });
    const d = id ? readDraft(id) : emptyDraft();
    setDraft(d); draftRef.current = d;
  }
  function pickKind(kk: string) {
    setKind(kk);
    pickFrom(fromOptions(kk)[0]?.[0] as string ?? "");   // the first treasury of the kind, until another is picked
  }
  // a person holding one kind has it chosen
  useEffect(() => { if (held.length === 1 && !kind) pickKind(held[0]); }, [held.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps
  const toValue = targets.some((x) => x.id === draft.toTreasuryId) ? draft.toTreasuryId : "";

  // scanning: one after another, so a code scanned twice quickly is added once
  async function scanOne(raw: string) {
    const read = readPieceCode(raw);
    if (read.problem) return setScan({ ok: false, text: read.problem === "arabicLayout" ? `${m("notOurCode")} ${m("switchKeyboard")}` : m("notOurCode") });
    const up = read.code!.toUpperCase();
    const d = draftRef.current;
    if (d.pieces.some((p) => p.pieceCode.toUpperCase() === up)) return setScan({ ok: false, text: m("alreadyAdded", { code: up }) });
    if (d.pieces.length >= PIECES_MAX) return setScan({ ok: false, text: m("tooManyPieces", { max: String(PIECES_MAX) }) });
    try {
      const a = await api("/treasury-transfers/scan", { query: { fromTreasuryId: fromRef.current, pieceCode: read.code } });
      if (!a.available || !a.karat || a.weightMg == null) return setScan({ ok: false, text: `${a.pieceCode}: ${m(`reasons.${a.reason ?? "unknown"}`)}` });
      if (draftRef.current.pieces.some((p) => p.pieceCode === a.pieceCode)) return setScan({ ok: false, text: m("alreadyAdded", { code: a.pieceCode }) });
      change({ pieces: [...draftRef.current.pieces, { pieceCode: a.pieceCode, itemName: a.itemName ?? "", karat: a.karat, weightMg: a.weightMg }] });
      setScan({ ok: true, text: m("added", { code: a.pieceCode, weight: milligramsText(a.weightMg), karat: a.karat }) });
    } catch (e) { setScan({ ok: false, text: tr.errorText((e as any).error ?? { message: "unexpected" }) }); }
  }
  const scanCode = (raw: string) => { if (!fromRef.current) return setScan({ ok: false, text: m("pickFromFirst") }); queue.current = queue.current.then(() => scanOne(raw)); };
  const takeCode = () => { const c = code; setCode(""); if (c.trim()) scanCode(c); };

  function addGold() {
    const mg = typedMilligrams(goldWeight);
    const bad = !goldKarat || mg === undefined || mg <= 0 || mg > WEIGHT_MAX_MG ? m("goldInvalid") : draft.gold.some((g) => g.karat === goldKarat) ? m("karatAdded") : "";
    setGoldErr(bad);
    if (bad) return;
    change({ gold: [...draft.gold, { karat: goldKarat, weightMg: mg! }] });
    setGoldKarat(""); setGoldWeight("");
  }

  async function send() {
    if (sending) return;   // a double tap
    const fail = (text: string) => { setErr(text); revealFirstError(); };
    const d = draft, amt = d.amount.trim() === "" ? 0 : typedPiastres(d.amount);
    if (!from || !d.toTreasuryId) return fail(!kind ? kc("required") : m("pickBoth"));
    if (amt === undefined) return fail(m("amountInvalid"));
    if (k === "egp" ? !amt : d.pieces.length === 0 && d.gold.length === 0) return fail(m("emptyTransfer"));
    const body = { fromTreasuryId: from, toTreasuryId: d.toTreasuryId, pieceCodes: k === "egp" ? [] : d.pieces.map((p) => p.pieceCode), gold: k === "egp" ? [] : d.gold, amountPiastres: k === "egp" ? amt : 0 };
    setSending(true);
    try {
      const a = await api("/treasury-transfers", { method: "POST", body, saveKey: key.current });
      key.current = newSaveKey(); localStorage.removeItem(draftKey(from));
      toast(m("sentNumber", { number: code6(a.documentNumber) }));
      qc.invalidateQueries({ queryKey: ["thing", "transfers"] });
      router.push(`${pathname}?chip=sent`);   // the screen switches to the Sent box
    } catch (e) {
      if (!(e instanceof ApiFailure)) return fail(L("تعذّر الحفظ. حاول مرة أخرى.", "Could not save. Try again."));
      const bad: Row[] = (e.error.values?.pieces as Row[]) ?? [];
      if (bad.length) change({ pieces: draft.pieces.map((p) => { const r = bad.find((x) => x.pieceCode === p.pieceCode); return { ...p, refused: r ? m(`reasons.${r.reason ?? "unknown"}`) : undefined }; }) });
      if (!e.unreachable && e.error.message !== "saveInProgress") key.current = newSaveKey();   // a refusal is final for this content
      fail(tr.errorText(e.error));
    } finally { setSending(false); }
  }

  const per = KARATS.map((kt) => ({ kt, mg: draft.pieces.filter((p) => p.karat === kt).reduce((s, p) => s + p.weightMg, 0) + (draft.gold.find((g) => g.karat === kt)?.weightMg ?? 0) })).filter((x) => x.mg > 0);
  const amt = draft.amount.trim() === "" ? 0 : typedPiastres(draft.amount);
  const fld = (id: string, label: string, body: React.ReactNode, help?: string) => (
    <div className="field" data-k={id}><label htmlFor={`f-${id}${["kind", "from", "to", "goldKarat"].includes(id) ? "-btn" : ""}`}>{label}</label>{body}{help && <div className="help">{help}</div>}</div>
  );

  return (
    <>
      <form className="card" id="sx" noValidate onSubmit={(e) => e.preventDefault()}>
        {held.length > 1 && <div id="sx-kind">{fld("kind", kc("label"), <Select id="f-kind" name="kind" value={kind} onChange={pickKind} options={["egp", "gold"].map((x) => [x, kc(x)] as Option)} searchable={false} />)}</div>}
        <div className="formgrid">
          {fld("from", m("from"), <Select id="f-from" name="from" value={from} onChange={pickFrom} options={fromOptions(kind)} placeholder={kind ? chooseTreasury : kc("first")} disabled={!kind} />)}
          {fld("to", m("to"), <Select id="f-to" name="to" value={toValue} onChange={(v) => change({ toTreasuryId: v })} options={targets.map((x) => [x.id, choiceText(x)] as Option)} placeholder={chooseTreasury} />)}
        </div>
        <div className="help" id="sx-none">{!mine.isLoading && !items.length ? m("noTreasuries") : from && targetsQ.data && !targets.length ? m("noTargets") : ""}</div>
        {k === "egp" && <div id="sx-egp">{fld("amount", m("amount"), <Input id="f-amount" type="text" inputMode="decimal" dir="ltr" autoComplete="off" value={draft.amount} onChange={(e) => change({ amount: e.target.value })} />, "0.00")}</div>}
        {k === "gold" && (
          <div id="sx-gold">
            {fld("pieceCode", m("pieceCode"), <Input id="f-pieceCode" type="text" autoComplete="off" placeholder={m("pieceCodePlaceholder")} value={code} onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); takeCode(); } }} />, m("pieceCodeHint"))}
            <Button id="sx-addpiece" onClick={takeCode}><Icon name="plus" />{m("addPiece")}</Button>
            <p id="sx-scan" role="status" aria-live="polite" className={scan.ok ? "ok" : "err"}>{scan.text}</p>
            <div id="sx-pieces">
              {draft.pieces.length > 0 && (
                <ul aria-label={m("piecesList")}>
                  {draft.pieces.map((p, i) => (
                    <li key={p.pieceCode}>
                      <span dir="ltr"><strong>{p.pieceCode}</strong></span> {p.itemName} · {p.karat}K · {milligramsText(p.weightMg)} {m("grams")}
                      {p.refused && <FieldError>{p.refused}</FieldError>}{" "}
                      <Button size="sm" aria-label={m("removePiece", { code: p.pieceCode })} onClick={() => change({ pieces: draft.pieces.filter((_, j) => j !== i) })}><Icon name="trash" /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <h3 className="grp-title">{m("bulkGold")}</h3>
            <div className="formgrid">
              {fld("goldKarat", m("karat"), <Select id="f-goldKarat" name="goldKarat" value={goldKarat} onChange={setGoldKarat} options={KARATS.map((x) => [x, `${x}K`] as Option)} placeholder={m("choose")} searchable={false} />)}
              {fld("goldWeight", m("weightGrams"), <Input id="f-goldWeight" type="text" inputMode="decimal" dir="ltr" autoComplete="off" value={goldWeight} onChange={(e) => setGoldWeight(e.target.value)} />, "0.000")}
            </div>
            <Button id="sx-addgold" onClick={addGold}><Icon name="plus" />{m("addGold")}</Button>
            {goldErr && <FieldError id="sx-gold-err">{goldErr}</FieldError>}
            <div id="sx-golds">
              {draft.gold.map((g, i) => (
                <div className="kv" key={g.karat}><span>{g.karat}K · {milligramsText(g.weightMg)} {m("grams")}</span>
                  <Button size="sm" aria-label={m("removeGold", { karat: g.karat })} onClick={() => change({ gold: draft.gold.filter((_, j) => j !== i) })}><Icon name="trash" /></Button></div>
              ))}
            </div>
          </div>
        )}
        <div className="note" id="sx-total" data-testid="send-totals">
          {k === "egp" ? `EGP ${piastresText(amt ?? 0)}` : <>{m("totalPieces", { count: String(draft.pieces.length) })}{per.map((x) => <span key={x.kt} dir="ltr"> {x.kt}K: {milligramsText(x.mg)} {m("grams")}</span>)}</>}
        </div>
        {err && <FieldError id="sx-err">{err}</FieldError>}
        <div className="formbar"><Button variant="primary" id="sx-send" disabled={sending} onClick={send}>{sending ? m("sending") : m("send")}</Button></div>
      </form>
    </>
  );
}
