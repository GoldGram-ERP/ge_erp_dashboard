"use client";
// Price protection on the Hallmark kit (docs/price-protection/price-protection.md): the held price and its countdown, the price history,
// the money that actually arrived (accountant) and the settlement. Every number comes from the server; this file only shows it.
// The countdown runs on the server's clock: offset = serverNow − the screen clock at the read, so a skewed screen never shows a wrong time.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Banner, Button, Chip, Group, Icons, PillInput, Row, Skeleton, toast } from "@/components/hallmark";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import { piastresText, timeText, typedPiastres } from "@/lib/format";

export type PpPrice = { sell21: number; buy21: number | null; sell24: number; buy24: number | null; silverSell: number | null; silverBuy: number | null };
export type PpWindow = { windowNumber: number; role: "sales" | "accountant"; startsAt: string; endsAt: string; price: PpPrice; totalPiastres: number; differencePiastres: number; paidAgainst: boolean };
export type PpOutcome = "absorbed" | "balance_due" | "refund_due";
export type PpSettlement = { totalPiastres: number; receivedPiastres: number; tolerancePiastres: number; differencePiastres: number; outcome: PpOutcome; amountDuePiastres: number };
export type Protection = {
  stage: "sales" | "accountant" | null; serverNow: string; current: PpWindow | null; history: PpWindow[];
  customerSentAt: string | null; received: { method: string; amountPiastres: number }[] | null; settlement: PpSettlement | null;
};
export type HeldFromBoard = { takenAt: string; sell21: number; buy21: number | null; silverSell: number | null; silverBuy: number | null };
type L = (ar: string, en: string) => string;

export const METHODS = ["cash", "instapay", "bank_transfer", "visa"] as const;
const egp = (p: number) => `${piastresText(p)} EGP`;
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** The draft's price protection, re-read when its window ends (the server works out the next window by the clock). */
export function useProtection(draftId: string | undefined) {
  const query = useQuery<Protection>({ queryKey: ["price-protection", draftId], enabled: Boolean(draftId), queryFn: () => api(`/sales-drafts/${draftId}/price-protection`), refetchOnWindowFocus: true });
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (query.data) offset.current = Date.parse(query.data.serverNow) - Date.now(); }, [query.dataUpdatedAt]);   // eslint-disable-line react-hooks/exhaustive-deps
  const live = Boolean(query.data?.current && query.data.stage);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  const left = query.data?.current && query.data.stage ? Date.parse(query.data.current.endsAt) - (now + offset.current) : null;
  // the window ended: read the next one. If the server still answers with the same window (its clock had not reached the end, or the
  // read failed), ask again every 2 s instead of freezing at 0:00 (owner, 2026-11-26 bug).
  const asked = useRef<{ n: number | null; at: number }>({ n: null, at: 0 });
  useEffect(() => {
    const n = query.data?.current?.windowNumber ?? null;
    const again = asked.current.n !== n || Date.now() - asked.current.at >= 2000;
    if (left !== null && left <= 0 && again && !query.isFetching) { asked.current = { n, at: Date.now() }; void query.refetch(); }
  }, [left, query]);
  return { ...query, left };
}

/** The held-price strip: the held 21 price, «السعر ثابت لحد ٣:٥٢», the live countdown and the window chip. */
export function HeldStrip({ pp, left, locale, L, silver, onRetry, error, refreshing }: { pp: Protection | undefined; left: number | null; locale: string; L: L; silver?: boolean; onRetry: () => void; error: boolean; refreshing: boolean }) {
  if (error && !pp) return <Banner tone="error" icon={<Icons.TriangleAlert aria-hidden />} live action={<Button size="sm" variant="soft" onClick={onRetry}>{L("حاول تاني", "Try again")}</Button>}>{L("مش قادر أقرا السعر المثبّت", "Could not read the held price")}</Banner>;
  if (!pp) return <Group><div className="p-3"><Skeleton lines={2} /></div></Group>;
  const c = pp.current;
  if (!c || !pp.stage) return null;
  const until = timeText(c.endsAt, locale);
  const held = silver ? c.price.silverSell : c.price.sell21;
  const ending = left !== null && left <= 30_000;
  return (
    <Group title={<span className="flex flex-wrap items-center gap-1.5">
      <Chip tone={pp.stage === "accountant" ? "lapis" : "gold"}>{pp.stage === "accountant" ? L("مع المحاسب", "With the accountant") : L("السعر ثابت", "Price held")}</Chip>
      <Chip>{L("فترة", "Window")} <span dir="ltr">{c.windowNumber}</span></Chip>
      {refreshing && <Chip>{L("بيتحدّث…", "Updating…")}</Chip>}
      {error && <Chip tone="amber">{L("مش قادر أحدّث", "Can't update")}</Chip>}
    </span>}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-3" id="pp-strip" aria-live="off">
        <span className="grid gap-0.5">
          <span className="text-body font-semibold text-label">{L(`السعر ثابت لحد ${until}`, `Price held until ${until}`)}</span>
          <span className="meta">{silver ? L("فضة · بيع", "Silver · sell") : L("عيار 21 · بيع", "Karat 21 · sell")} <span dir="ltr" className="tabular-nums">{held === null ? "—" : piastresText(held)}</span></span>
        </span>
        <b dir="ltr" role="timer" aria-label={L("الوقت الباقي", "Time left")} className={`text-[1.5rem] font-bold leading-none tabular-nums ${ending ? "text-[var(--amber)]" : "text-label"}`}>{left === null ? "—" : mmss(left)}</b>
      </div>
    </Group>
  );
}

/** The window's total, re-animated when a new window brings a new total (no layout jump: the box keeps its size). */
export function RollingTotal({ pp, children }: { pp: Protection | undefined; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.span key={pp?.current?.windowNumber ?? 0} className="inline-block" initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.35 }}>
      {children}
    </motion.span>
  );
}

/** Every window of the draft: time, held price, total, the difference from the window before, the paid-against mark and who held it. */
export function PriceHistory({ pp, locale, L, silver }: { pp: Protection | undefined; locale: string; L: L; silver?: boolean }) {
  if (!pp || pp.history.length === 0) return null;
  const rows = [...pp.history].reverse();
  return (
    // a window every 2.5 / 5 min grows without end: the list scrolls inside its own short box (newest first), never the page
    <Group className="[&>.hm-grp]:max-h-64 [&>.hm-grp]:overflow-y-auto [&>.hm-grp]:overscroll-contain" title={L("تاريخ السعر", "Price history")} action={<Chip><span dir="ltr">{pp.history.length}</span></Chip>}>
      {rows.map((w) => {
        const d = w.differencePiastres, p = silver ? w.price.silverSell : w.price.sell21;
        return (
          <Row key={w.windowNumber} label={<span className="flex flex-wrap items-center gap-1.5">
            <span dir="ltr" className="tabular-nums">{timeText(w.startsAt, locale)}</span>
            <Chip tone={w.role === "accountant" ? "lapis" : "neutral"}>{w.role === "accountant" ? L("محاسب", "Accountant") : L("مبيعات", "Sales")}</Chip>
            {w.paidAgainst && <Chip tone="gold">{L("اتدفع على السعر ده", "Paid at this price")}</Chip>}
          </span>}>
            <span className="flex flex-col items-end gap-0.5">
              <b dir="ltr" className="tabular-nums text-label">{piastresText(w.totalPiastres)}</b>
              <span className="flex items-center gap-1.5">
                <span dir="ltr" className="meta tabular-nums">{p === null ? "—" : piastresText(p)}</span>
                {d !== 0 && <Chip tone={d < 0 ? "malachite" : "amber"}><span dir="ltr">{d > 0 ? "+" : "−"}{piastresText(Math.abs(d))}</span></Chip>}
              </span>
            </span>
          </Row>
        );
      })}
    </Group>
  );
}

const outcomeChip = (s: PpSettlement, L: L) => s.outcome === "absorbed"
  ? <Chip tone="malachite">{L("اتشال عن العميل", "Absorbed")}</Chip>
  : s.outcome === "balance_due" ? <Chip tone="carnelian">{L(`باقي على العميل ${piastresText(s.amountDuePiastres)}`, `Customer owes ${piastresText(s.amountDuePiastres)}`)}</Chip>
  : <Chip tone="amber">{L(`نرجّع للعميل ${piastresText(s.amountDuePiastres)}`, `Refund ${piastresText(s.amountDuePiastres)}`)}</Chip>;

/** The accountant's seat: the money that actually arrived per method, then the settlement (worked out by the server). */
export function AccountantSeat({ draftId, pp, L, methodLabel, mayRecord }: { draftId: string; pp: Protection; L: L; methodLabel: (m: string) => string; mayRecord: boolean }) {
  const qc = useQueryClient();
  const fromServer = () => Object.fromEntries(METHODS.map((m) => { const r = pp.received?.find((x) => x.method === m); return [m, r ? piastresText(r.amountPiastres).replace(/,/g, "") : ""]; }));
  const [typed, setTyped] = useState<Record<string, string>>(fromServer);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const key = useRef(newSaveKey());
  const bad = METHODS.filter((m) => typed[m].trim() !== "" && !(typedPiastres(typed[m]) ?? 0));
  const payments = METHODS.flatMap((m) => { const v = typedPiastres(typed[m]); return v ? [{ method: m, amountPiastres: v }] : []; });
  async function record() {
    if (busy || bad.length || !payments.length) return;
    setBusy(true); setMsg("");
    try {
      const out = await api<Protection>(`/sales-drafts/${draftId}/received`, { method: "PUT", body: { payments }, saveKey: key.current });
      key.current = newSaveKey();
      qc.setQueryData(["price-protection", draftId], out);
      toast(L("اتسجّلت الفلوس اللي وصلت", "The money received is recorded"), { tone: "ok" });
    } catch (err) {
      if (!keepsKey(err)) key.current = newSaveKey();
      setMsg(err instanceof ApiFailure && err.error.message === "notAllowed" ? L("محتاج صلاحية المحاسب عشان تسجّل الفلوس.", "Only the accountant records the money.") : L("ماتسجّلتش. حاول تاني.", "Not recorded. Try again."));
    } finally { setBusy(false); }
  }
  const s = pp.settlement;
  return (
    <>
      <Group title={L("الفلوس اللي وصلت", "Money received")}>
        {mayRecord ? (
          <div className="grid gap-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {METHODS.map((m) => <PillInput key={m} prefix={methodLabel(m)} unit="EGP" width="11rem" inputMode="decimal" dir="ltr" ariaLabel={methodLabel(m)} invalid={bad.includes(m) || undefined}
                value={typed[m]} onChange={(v) => { setTyped({ ...typed, [m]: v }); setMsg(""); }} />)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="soft" pending={busy} disabled={!payments.length || bad.length > 0} onClick={() => void record()} id="pp-record">{busy ? L("بنسجّل…", "Recording…") : L("سجّل اللي وصل", "Record what arrived")}</Button>
              {!payments.length && <span className="meta">{L("اكتب المبلغ اللي وصل فعلًا.", "Type the amount that actually arrived.")}</span>}
              {bad.length > 0 && <span className="meta text-danger">{L("المبلغ لازم يبقى رقم أكبر من صفر.", "The amount must be a number above zero.")}</span>}
            </div>
            {msg && <Banner tone="error" icon={<Icons.TriangleAlert aria-hidden />} live action={<Button size="sm" variant="soft" onClick={() => void record()}>{L("حاول تاني", "Try again")}</Button>}>{msg}</Banner>}
          </div>
        ) : (pp.received?.length ? pp.received.map((r) => <Row key={r.method} label={methodLabel(r.method)}><span dir="ltr" className="block text-end tabular-nums">{egp(r.amountPiastres)}</span></Row>)
          : <div className="meta px-3 py-3">{L("المحاسب لسه ماسجّلش الفلوس اللي وصلت.", "The accountant has not recorded the money yet.")}</div>)}
      </Group>
      {s && (
        <Group title={L("التسوية", "Settlement")} action={outcomeChip(s, L)}>
          <Row label={L("الإجمالي بالسعر المثبّت", "Total at the held price")}><span dir="ltr" className="block text-end font-semibold tabular-nums">{egp(s.totalPiastres)}</span></Row>
          <Row label={L("اللي وصل", "Received")}><span dir="ltr" className="block text-end tabular-nums">{egp(s.receivedPiastres)}</span></Row>
          <Row label={L("الفرق", "Difference")}><span dir="ltr" className="block text-end tabular-nums">{s.differencePiastres > 0 ? "+" : s.differencePiastres < 0 ? "−" : ""}{egp(Math.abs(s.differencePiastres))}</span></Row>
          <Row label={L("المسموح", "Tolerance")}><span dir="ltr" className="block text-end text-secondary tabular-nums">{egp(s.tolerancePiastres)}</span></Row>
        </Group>
      )}
    </>
  );
}

/** Why Complete is refused (409 of the complete call, or the settlement shown now), in masri. */
export function completeBlock(pp: Protection | undefined, L: L): string {
  if (!pp || !pp.stage) return "";
  if (pp.stage === "sales") return L("لسه العميل مابعتش الفلوس: دوس «العميل بعت الفلوس» الأول.", "The customer has not sent the money yet: press “Customer sent the money” first.");
  if (!pp.settlement) return L("سجّل الفلوس اللي وصلت الأول.", "Record the money received first.");
  if (pp.settlement.outcome === "balance_due") return L(`باقي على العميل ${piastresText(pp.settlement.amountDuePiastres)} جنيه: حصّلهم الأول.`, `The customer still owes ${piastresText(pp.settlement.amountDuePiastres)}: collect it first.`);
  if (pp.settlement.outcome === "refund_due") return L(`لازم نرجّع للعميل ${piastresText(pp.settlement.amountDuePiastres)} جنيه الأول.`, `Refund ${piastresText(pp.settlement.amountDuePiastres)} to the customer first.`);
  return "";
}
export function completeRefusal(message: string, values: Record<string, unknown> | undefined, L: L): string | null {
  const due = piastresText(Number(values?.amountDue ?? 0));
  if (message === "customerNotSent") return L("لسه العميل مابعتش الفلوس.", "The customer has not sent the money yet.");
  if (message === "nothingReceived") return L("المحاسب لسه ماسجّلش الفلوس اللي وصلت.", "No money received is recorded yet.");
  if (message === "balanceDue") return L(`باقي على العميل ${due} جنيه.`, `The customer still owes ${due}.`);
  if (message === "refundDue") return L(`لازم نرجّع للعميل ${due} جنيه.`, `Refund ${due} to the customer first.`);
  return null;
}

/** The Price board's snapshot carried in the address (?held=), for a new draft's first save. */
export function readHeld(): HeldFromBoard | null {
  if (typeof window === "undefined") return null;
  try {
    const h = JSON.parse(new URLSearchParams(window.location.search).get("held") ?? "null");
    return h && typeof h.takenAt === "string" && Number.isFinite(h.sell21) ? h : null;
  } catch { return null; }
}
