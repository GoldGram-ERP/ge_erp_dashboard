"use client";
// The Bug reports screen's row Action menu and the read-on-open marker (owner, 2026-11-09). They are components with hooks, so they live
// here beside "Report a bug" rather than inside the screen file (screens may not define components: library-ratchet).
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionMenu, copyImage, copyText, toast } from "@/components/ui";
import type { Row } from "@/lib/engine-types";
import { api, newSaveKey } from "@/lib/api";
import type { Tr } from "@/lib/t";

export const fileUrl = (id: string, fileId: string) => `/api/bug-reports/${id}/files/${fileId}`;
export const isImage = (mime: string) => ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime);

/** Any image -> PNG (the only image type every browser's clipboard takes). */
async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob), c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"));
}

/** Opening a new report reads it (owner, 2026-11-09): once per open, status new -> seen, then the list refreshes. Nothing is drawn. */
export function MarkReadOnOpen({ r }: { r: Row }) {
  const qc = useQueryClient(), done = useRef("");
  useEffect(() => {
    if (r.status !== "new" || done.current === r.id) return;
    done.current = r.id;
    api(`/bug-reports/${r.id}`, { method: "PATCH", body: { status: "seen" }, saveKey: newSaveKey() })
      .then(() => qc.invalidateQueries({ queryKey: ["thing", "bug-reports"] }), () => { done.current = ""; });
  }, [r.id, r.status, qc]);
  return null;
}

/** The row's Action menu (owner, 2026-11-09): read or unread, cancel, copy the report's text, copy its first image. */
export function ReportActions({ r, L }: { r: Row; L: Tr["L"] }) {
  const qc = useQueryClient();
  const full = () => api<Row>(`/bug-reports/${r.id}`);
  const setStatus = async (status: string, done: string) => {
    try { await api(`/bug-reports/${r.id}`, { method: "PATCH", body: { status }, saveKey: newSaveKey() }); toast(done); qc.invalidateQueries({ queryKey: ["thing", "bug-reports"] }); }
    catch { toast(L("ماتغيرش.", "Not changed."), { error: true }); }
  };
  const copyReport = async () => {
    const f = await full().catch(() => null);
    if (!f) { toast(L("ماتنسخش.", "Not copied."), { error: true }); return; }
    const text = [f.description, f.doing ? `${L("كان بيعمل", "Doing")}: ${f.doing}` : "", f.screenPath ? `${L("الشاشة", "Screen")}: ${f.screenPath}` : "", `#${f.reportNumber}${f.appVersion ? ` · ${f.appVersion}` : ""}`].filter(Boolean).join(String.fromCharCode(10));
    if (await copyText(text)) toast(L("اتنسخ النص.", "Text copied."));
    else toast(L("ماتنسخش.", "Not copied."), { error: true });
  };
  // The clipboard write starts inside the click (Safari needs that); the PNG it holds is fetched and converted while it waits.
  const copyFirstImage = () => {
    const png = full().then(async (f) => {
      const img = (f.files as Row[]).find((x) => isImage(x.mimeType));
      if (!img) throw new Error("none");
      const res = await fetch(fileUrl(r.id, img.id), { credentials: "include" });
      if (!res.ok) throw new Error("fetch");
      return asPng(await res.blob());
    });
    return copyImage(png).then((ok) => (ok ? toast(L("اتنسخت الصورة.", "Image copied.")) : toast(L("مفيش صورة تتنسخ، أو المتصفح رفض.", "No image to copy, or the browser refused."), { error: true })));
  };
  return (
    <ActionMenu label={L("إجراء", "Action")} menuLabel={L(`إجراءات بلاغ ${r.reportNumber}`, `Actions for report ${r.reportNumber}`)} items={[
      { id: "read", label: L("علّمه مقروء", "Mark as read"), icon: "eye", hidden: r.status !== "new", run: () => setStatus("seen", L("اتعلّم مقروء.", "Marked as read.")) },
      { id: "unread", label: L("علّمه مش مقروء", "Mark as unread"), icon: "dot", hidden: r.status === "new", run: () => setStatus("new", L("اتعلّم مش مقروء.", "Marked as unread.")) },
      { id: "copy", label: L("انسخ النص", "Copy the text"), icon: "copy", run: copyReport },
      { id: "image", label: L("انسخ الصورة", "Copy the image"), icon: "image", hidden: !Number(r.fileCount), run: copyFirstImage },
      { id: "cancel", label: L("الغي البلاغ", "Cancel the report"), icon: "x", danger: true, hidden: r.status === "cancelled", run: () => setStatus("cancelled", L("البلاغ اتلغى.", "Report cancelled.")) },
    ]} />
  );
}
