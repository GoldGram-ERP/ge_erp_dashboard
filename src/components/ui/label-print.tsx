"use client";
// Prints piece labels in their OWN window that holds only the labels. It never prints the app page: hiding the app with
// `visibility:hidden` keeps its layout, which at the label page size stretched into ~25 blank sheets. The drawing is in label-sheet.tsx.
import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Row } from "@/lib/engine-types";
import { esc, labelGramsText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";
import { loadPrintProfile } from "@/things/label-settings";
import { pieceLabelItem, profileForPrint, settingsFromProfile, pageSize as profilePage, type LabelProfile } from "@/things/printer-label-rules";
import { Sheet, pageSize, type Layout } from "./LabelSheet";
import { A4Pages, FitWidth, PrinterLabel, writePrinterLabels } from "./PrinterLabel";

const pc = (tr: Pick<Tr, "t">, k: string, v?: Record<string, string | number>) => tr.t("gold-accounts", `purchaseCoding.${k}`, v);

/** A piece row -> the label the saved profile draws (the name or nickname as the text, the piece code as the QR; no extra lines). */
export const profileItem = (tr: Pick<Tr, "t">, l: Row) =>
  pieceLabelItem(l, { karat: (karat) => pc(tr, "karatShort", { karat: String(karat) }), weight: labelGramsText, gram: pc(tr, "gram") });

/** Opens the print window straight from the click (no pop-up blocker objects), then asks for the saved label look (about 3 s at most; any trouble = the old label) and writes only the labels and a Print button into it.
 *  QR labels on the tag roll are drawn with the profile saved from the Test printer, through the same renderer as that page; everything else is the old sheet. */
export function printLabels(tr: Tr, labels: Row[], layout: Layout): void {
  const { t, L, isAr } = tr;
  const w = window.open("", "_blank");
  if (!w) { toast(L("اسمح بالنوافذ المنبثقة للطباعة.", "Allow pop-ups to print."), { error: true }); return; }
  const title = L("ملصقات القطع", "Piece labels");
  const old = () => {
    const body = renderToStaticMarkup(<Sheet labels={labels} layout={layout} tr={tr} />);
    w.document.open();
    w.document.write(`<!doctype html><html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>`
      + `body{margin:0;background:#e9e4d8;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;color:#1c1912}`
      + `.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px}`
      + `.bar button{height:34px;padding:0 16px;border-radius:8px;border:0;background:#7a5710;color:#fff;font-weight:600;cursor:pointer}`
      + `main{padding:24px;display:flex;flex-wrap:wrap;gap:10px}`
      + `@media print{.bar{display:none}html,body{height:auto;background:#fff}main{display:block;padding:0}[data-label]{border:0!important}}`
      + `@page{size:${pageSize(layout)}}`
      + `</style></head><body><div class="bar"><b>${esc(title)} · ${esc(pc(tr, "labelCount", { count: labels.length }))}</b><button onclick="print()">${esc(t("common", "print"))}</button></div><main data-print-labels>${body}</main></body></html>`);
    w.document.close();
  };
  void (async () => {
    if (w.document.body) w.document.body.textContent = L("جارٍ التحميل…", "Loading…");
    const profile = profileForPrint(await loadPrintProfile());
    if (w.closed) return;
    try {
      if (profile) { writePrinterLabels(w, settingsFromProfile(profile), labels.map((l) => profileItem(tr, l)), { title, print: t("common", "print"), rtl: isAr }, layout); return; }
    } catch { /* drawing with the profile failed: the old label below */ }
    old();
  })();
}

/** The on-screen sheet of labels: exactly what the print window draws (the saved look, every kind, either layout), at real size and scaled only to fit the width.
 *  The saved look is read once; until it arrives, or when none is saved or the server fails, the old sheet shows, as before. */
export function LabelPreviewSheet({ labels, layout, tr }: { labels: Row[]; layout: Layout; tr: Tr }) {
  const [saved, setSaved] = useState<LabelProfile | null>(null);
  useEffect(() => {
    let live = true;
    void loadPrintProfile().then((p) => { if (live) setSaved(p); });
    return () => { live = false; };
  }, []);
  const profile = profileForPrint(saved);
  if (!profile) return <Sheet labels={labels} layout={layout} tr={tr} />;
  const s = settingsFromProfile(profile), items = labels.map((l) => profileItem(tr, l)), kinds = labels.map((l) => l.labelKind);
  if (layout === "a4") return <FitWidth widthMm={210}><A4Pages s={s} items={items} kinds={kinds} preview /></FitWidth>;
  const p = profilePage(s);
  return <>{items.map((item, i) => <FitWidth key={i} widthMm={p.w}><div data-label data-label-kind={kinds[i] as string} style={{ width: `${p.w}mm`, height: `${p.h}mm`, boxShadow: "0 0 0 1px #ccc", background: "#fff" }}><PrinterLabel s={s} item={item} /></div></FitWidth>)}</>;
}
