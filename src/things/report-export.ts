// A report's Excel and print through the backend's export queue: GET <report>/excel|print makes a job, /exports/:id tells where it stands,
// /exports/:id/file gives the .xlsx (excel) or the print data as JSON (print). Status shows as a toast; no queue panel (shortcut: add one if people wait long).
import { api, ApiFailure } from "@/lib/api";
import { esc } from "@/lib/format";
import type { Query } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";

type Status = { id: string; state: "waiting" | "preparing" | "ready" | "failed"; place: number; ahead: number; error?: string; errorValues?: Record<string, string | number> };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WAIT_LIMIT_MS = 10 * 60_000;

/** Runs the export and resolves with the finished file (a Response); null when it failed (the reason was toasted). */
async function finished(kind: "excel" | "print", path: string, query: Query, tr: Tr): Promise<Response | null> {
  const x = (k: string, v?: Record<string, string | number>) => tr.t("common", `report.export.${k}`, v);
  // the whole result: no paging; the Excel file also takes the language of the screen
  const { page: _page, pageSize: _size, ...rest } = query;
  void [_page, _size];
  try {
    let s = await api<Status>(`${path}/${kind}`, { query: { ...rest, ...(kind === "excel" ? { language: tr.locale } : {}) } });
    const started = Date.now();
    while (s.state === "waiting" || s.state === "preparing") {
      toast(s.state === "waiting" ? `${x("announcePlace", { place: s.place })} · ${x("mayLeave")}` : x("reading"), { ms: 2500 });
      if (Date.now() - started > WAIT_LIMIT_MS) { toast(x("failed"), { error: true }); return null; }
      await wait(1000);
      s = await api<Status>(`/exports/${s.id}`);
    }
    if (s.state === "failed") { toast(s.error ? tr.errorText({ message: s.error, values: s.errorValues } as never) : x("failed"), { error: true }); return null; }
    return await api<Response>(`/exports/${s.id}/file`, { blob: true });
  } catch (e) {
    toast(e instanceof ApiFailure ? tr.errorText(e.error) : x("failed"), { error: true });
    return null;
  }
}

export async function downloadExcel(path: string, query: Query, tr: Tr) {
  const r = await finished("excel", path, query, tr);
  if (!r) return;
  const name = /filename="?([^";]+)"?/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "report.xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob());
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  toast(tr.t("common", "report.export.ready"));
}

export type PrintTable = { title: string; filters: [string, string][]; heads: { label: string; end?: boolean }[]; rows: string[][]; foot?: string[] };
const CSS = `body{margin:0;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;color:#1c1912}.bar{padding:10px 16px;border-bottom:1px solid #ddd}.bar button{height:34px;padding:0 16px;border-radius:8px;border:0;background:#7a5710;color:#fff;font-weight:600;cursor:pointer}
main{padding:16px}h1{font-size:18px;margin:0 0 6px}p{margin:2px 0;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{padding:4px;border-bottom:1px solid #e3dccb;text-align:start}th{border-bottom:1px solid #1c1912}
.e{text-align:end;white-space:nowrap}tfoot td{font-weight:600}@page{size:A4 landscape;margin:10mm}@media print{.bar{display:none}}`;

/** Every row of the report, from the queue, in a new window with a Print button. `build` turns the JSON into the page's table. */
export async function printReport(path: string, query: Query, tr: Tr, build: (data: any) => PrintTable | Promise<PrintTable>) {
  const w = window.open("", "_blank");
  if (!w) { toast(tr.L("المتصفح منع نافذة الطباعة", "The browser blocked the print window"), { error: true }); return; }
  w.document.write(`<!doctype html><title>${esc(tr.t("common", "print"))}</title><p style="padding:20px">${esc(tr.t("common", "report.export.reading"))}</p>`);
  const r = await finished("print", path, query, tr);
  if (!r) { w.close(); return; }
  const t = await build(JSON.parse(await r.text()));
  w.document.open();
  w.document.write(`<!doctype html><html lang="${tr.locale}" dir="${tr.isAr ? "rtl" : "ltr"}"><meta charset="utf-8"><title>${esc(t.title)}</title><style>${CSS}</style>
    <div class="bar"><button onclick="print()">${esc(tr.t("common", "print"))}</button></div><main><h1>${esc(t.title)}</h1>${t.filters.map(([k, v]) => `<p>${esc(k)}: <b>${v}</b></p>`).join("")}
    <table><thead><tr>${t.heads.map((h) => `<th class="${h.end ? "e" : ""}">${esc(h.label)}</th>`).join("")}</tr></thead>
    <tbody>${t.rows.map((row) => `<tr>${row.map((c, i) => `<td class="${t.heads[i]?.end ? "e" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody>
    ${t.foot ? `<tfoot><tr>${t.foot.map((c, i) => `<td class="${t.heads[i]?.end ? "e" : ""}">${c}</td>`).join("")}</tr></tfoot>` : ""}</table></main>`);
  w.document.close();
}
