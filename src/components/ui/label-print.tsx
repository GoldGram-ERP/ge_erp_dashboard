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
import { pieceLabelItem, profileForPrint, settingsFromProfile, usesSavedLook, type LabelProfile } from "@/things/printer-label-rules";
import { Sheet, pageSize, type Layout } from "./LabelSheet";
import { PrinterLabelPreview, writePrinterLabels } from "./PrinterLabel";

const pc = (tr: Pick<Tr, "t">, k: string, v?: Record<string, string | number>) => tr.t("gold-accounts", `purchaseCoding.${k}`, v);

/** A piece row -> the label the saved profile draws (name, QR code, then code and karat/weight lines). */
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
    const wants = usesSavedLook(layout, labels.map((l) => l.labelKind));
    if (wants && w.document.body) w.document.body.textContent = L("جارٍ التحميل…", "Loading…");
    const profile = wants ? profileForPrint(layout, await loadPrintProfile(), labels.map((l) => l.labelKind)) : null;
    if (w.closed) return;
    try {
      if (profile) { writePrinterLabels(w, settingsFromProfile(profile), labels.map((l) => profileItem(tr, l)), { title, print: t("common", "print"), rtl: isAr }); return; }
    } catch { /* drawing with the profile failed: the old label below */ }
    old();
  })();
}

/** The on-screen sheet of labels: the same look the print window will use (saved look for QR labels on the tag roll), else the old sheet.
 *  The saved look is read once; until it arrives, or when none is saved or the server fails, the old sheet shows, as before. */
export function LabelPreviewSheet({ labels, layout, tr }: { labels: Row[]; layout: Layout; tr: Tr }) {
  const [saved, setSaved] = useState<LabelProfile | null>(null);
  const kinds = labels.map((l) => l.labelKind), wants = usesSavedLook(layout, kinds);
  useEffect(() => {
    if (!wants) return;
    let live = true;
    void loadPrintProfile().then((p) => { if (live) setSaved(p); });
    return () => { live = false; };
  }, [wants]);
  const profile = profileForPrint(layout, saved, kinds);
  if (!profile) return <Sheet labels={labels} layout={layout} tr={tr} />;
  return <>{labels.map((l, i) => <div key={i} data-label data-label-kind={l.labelKind} style={{ width: 240, height: 120, background: "#fff", border: "1px dashed #cfc8b4" }}><PrinterLabelPreview s={settingsFromProfile(profile)} item={profileItem(tr, l)} boxW={240} boxH={120} /></div>)}</>;
}
