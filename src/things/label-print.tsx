"use client";
// Prints piece labels in their OWN window that holds only the labels. It never prints the app page: hiding the app with
// `visibility:hidden` keeps its layout, which at the label page size stretched into ~25 blank sheets. The drawing is in label-sheet.tsx.
import { renderToStaticMarkup } from "react-dom/server";
import type { Row } from "@/lib/engine-types";
import { esc } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";
import { Sheet, pageSize, type Layout } from "./label-sheet";

const pc = (tr: Pick<Tr, "t">, k: string, v?: Record<string, string | number>) => tr.t("gold-accounts", `purchaseCoding.${k}`, v);

/** Opens the print window straight from the click (no pop-up blocker objects) and writes only the labels and a Print button into it. */
export function printLabels(tr: Tr, labels: Row[], layout: Layout): void {
  const { t, L, isAr } = tr;
  const w = window.open("", "_blank");
  if (!w) { toast(L("اسمح بالنوافذ المنبثقة للطباعة.", "Allow pop-ups to print."), { error: true }); return; }
  const title = L("ملصقات القطع", "Piece labels");
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
}
