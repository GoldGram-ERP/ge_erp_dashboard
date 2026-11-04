"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { NAV, canOpen } from "@/nav/tree";
import { JOBS, QUESTIONS, canAsk, isVisible, jobName, matches, normalise, runHref } from "@/nav/jobs";
import { isSuper } from "@/lib/session";
import type { Me } from "@/stores/ui";
import { matchesText } from "@/lib/search";
import { NAV_LABELS } from "@/nav/labels.generated";
import { Icon, jobIconName } from "./icon";

export type Hit = { key: string; group: "pages" | "jobs" | "questions" | "find"; label: string; hint?: string; icon: string; href: string };
const MAX = 6;

export function useSearchHits(me: Me, q: string): Hit[] {
  const t = useTranslations();
  const lang = useLocale() === "ar" ? "ar" : "en";
  return useMemo<Hit[]>(() => {
    const word = q.trim();
    const out: Hit[] = [];
    const screens = me.screens;
    const pages = NAV.filter((g) => !g.superOnly || isSuper(me)).flatMap((g) => g.items.filter((i) => canOpen(me, i.screens)).map((i) => ({ g, i })));
    for (const { g, i } of pages) {
      const label = t(`nav.item.${i.id}`), group = t(`nav.group.${g.id}`);
      if (matchesText(word, label, group, NAV_LABELS.item[i.id], NAV_LABELS.group[g.id])) out.push({ key: `p:${i.route}`, group: "pages", label, hint: group, icon: g.icon, href: i.route });
    }
    if (word) {
      JOBS.filter((j: any) => isVisible(j, screens, (me as any).jobs) && matches(j, word)).slice(0, MAX)
        .forEach((j: any) => out.push({ key: `j:${j.id}`, group: "jobs", label: jobName(j, lang), icon: jobIconName(j.icon), href: runHref(j, 0) }));
      QUESTIONS.filter((x: any) => canAsk(x, screens) && matches(x, word)).slice(0, MAX)
        .forEach((x: any) => out.push({ key: `q:${x.id}`, group: "questions", label: jobName(x, lang), icon: jobIconName(x.icon), href: `/jobs/ask/${encodeURIComponent(x.id)}` }));
      if (canOpen(me, ["gold-sales/find-invoice", "gold-sales/sales-invoices-list"])) out.push({ key: "f:inv", group: "find", label: t("app.searchFindInvoice", { text: word }), icon: "sales", href: `/sales/invoices?q=${encodeURIComponent(word)}` });
      if (canOpen(me, pages.filter((p) => p.i.route === "/sales/pieces").flatMap((p) => p.i.screens))) out.push({ key: "f:piece", group: "find", label: t("app.searchFindPiece", { text: word }), icon: "gem", href: `/sales/pieces?q=${encodeURIComponent(word)}` });
    }
    return out;
  }, [q, me, lang, t]);
}

// Universal search: pages, jobs and questions the person may open, plus a direct find of a piece or an invoice by what was typed.
export function SearchPalette({ me, open, onClose }: { me: Me; open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setQ(""); setAt(0); d.showModal(); input.current?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);

  const hits = useSearchHits(me, q);

  const go = (h?: Hit) => { if (!h) return; onClose(); router.push(h.href as never); };

  return (
    <dialog ref={ref} className="palette" aria-label={t("app.search")} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="pal-in"><Icon name="search" size={19} />
        <input ref={input} value={q} role="combobox" aria-expanded="true" aria-controls="pal-list" aria-label={t("app.search")} placeholder={t("app.searchPlaceholder")} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setAt(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); go(hits[at]); }
          }} />
        <button type="button" className="ic-btn" aria-label={t("app.close")} title="Esc" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <div className="pal-list" id="pal-list" role="listbox" aria-label={t("app.search")}>
        {hits.length === 0 ? <div className="pal-empty">{t("app.searchNone")}</div> : groupHits(hits).map(({ g, items }) => (
          <div key={g}><div className="pal-grp">{t(`app.searchGroup.${g}`)}</div>
            {items.map((h) => <Row key={h.key} h={h} idx={hits.indexOf(h)} selected={hits.indexOf(h) === at} onPick={go} onHover={setAt} />)}
          </div>))}
      </div>
    </dialog>
  );
}

const Row = memo(function Row({ h, selected, onPick, onHover, idx }: { h: Hit; selected: boolean; onPick: (h: Hit) => void; onHover: (i: number) => void; idx: number }) {
  return (
    <button className="pal-item" role="option" aria-selected={selected} onMouseEnter={() => onHover(idx)} onClick={() => onPick(h)}>
      <span className="ico"><Icon name={h.icon} size={18} /></span><span><b>{h.label}</b>{h.hint ? <small>{h.hint}</small> : null}</span>
    </button>
  );
});

export const groupHits = (hits: Hit[]) => (["pages", "jobs", "questions", "find"] as const).map((g) => ({ g, items: hits.filter((h) => h.group === g) })).filter((x) => x.items.length);

// The field in the sidebar: type and the results open right under it; Enter opens the first, arrows move, Esc closes. Ctrl K opens the full-screen sheet.
export function SidebarSearch({ me, onOpenSheet }: { me: Me; onOpenSheet: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const hits = useSearchHits(me, q).slice(0, 12);
  const show = focus && q.trim() !== "";
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setFocus(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, []);
  const go = (h?: Hit) => { if (!h) return; setQ(""); setFocus(false); router.push(h.href as never); };
  return (
    <div className="usearch-box" ref={box}>
      <div className="usearch" id="usearch">
        <Icon name="search" size={17} />
        <input id="usearch-input" value={q} role="combobox" aria-expanded={show} aria-controls="usearch-list" aria-label={t("app.search")} placeholder={t("app.search")} autoComplete="off"
          onFocus={() => setFocus(true)}
          onChange={(e) => { setQ(e.target.value); setAt(0); setFocus(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); go(hits[at]); }
            else if (e.key === "Escape") { setQ(""); setFocus(false); (e.target as HTMLElement).blur(); }
          }} />
        <button type="button" className="kbd-btn" title={t("app.searchSheet")} aria-label={`${t("app.searchSheet")} Ctrl K`} onClick={onOpenSheet}><kbd>Ctrl K</kbd></button>
      </div>
      {show ? (
        <div className="usearch-pop" id="usearch-list" role="listbox" aria-label={t("app.search")}>
          {hits.length === 0 ? <div className="pal-empty">{t("app.searchNone")}</div> : groupHits(hits).map(({ g, items }) => (
            <div key={g}><div className="pal-grp">{t(`app.searchGroup.${g}`)}</div>
              {items.map((h) => { const idx = hits.indexOf(h); return (
                <button key={h.key} className="pal-item" role="option" aria-selected={idx === at} onMouseMove={() => setAt(idx)} onClick={() => go(h)}>
                  <span className="ico"><Icon name={h.icon} size={17} /></span><span><b>{h.label}</b>{h.hint ? <small>{h.hint}</small> : null}</span>
                </button>); })}
            </div>))}
          <button className="pal-more" type="button" onClick={onOpenSheet}>{t("app.searchSheet")} · Ctrl K</button>
        </div>
      ) : null}
    </div>
  );
}
