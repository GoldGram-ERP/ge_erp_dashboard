"use client";
// بلاغات المشاكل: super-control/bug-reports (Super admin only). Every report a user sent with "Report a bug": who sent it, from which
// branch, session and screen, which version and device, the last errors the screen got from the API, the text and the files.
// The Super admin sets a status (new, seen, fixed) and a private note; the reporter sees none of it (owner, 2026-11-09).
import { DataTable, Status, Td, Textarea, Tr as TableRow } from "@/components/ui";
import type { FieldConfig, MakeConfig, Row, ThingConfig } from "@/lib/engine-types";
import { api, newSaveKey } from "@/lib/api";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";

const TONE: Record<string, "warn" | "info" | "good"> = { new: "warn", seen: "info", fixed: "good" };

export const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { L } = tr;
  const types: Record<string, string> = {
    wrong_number: L("رقم أو حساب غلط", "A wrong number or calculation"),
    broken_screen: L("شاشة بايظة أو مش بتفتح", "A broken screen"),
    printing: L("مشكلة في الطباعة", "Printing"),
    slow: L("بطيء أو واقف", "Slow or stuck"),
    wrong_text: L("كلمة أو ترجمة غلط", "Wrong text or translation"),
    no_access: L("مش قادر أدخل شاشة", "No access to a screen"),
    other: L("حاجة تانية", "Something else"),
  };
  const statuses: Record<string, string> = { new: L("جديد", "New"), seen: L("اتشاف", "Seen"), fixed: L("اتصلّح", "Fixed") };
  const stamp = (x: unknown) => (x ? <Ltr>{String(x).slice(0, 19).replace("T", " ")}</Ltr> : "");
  const statusNode = (s: string) => <Status tone={TONE[s] ?? "info"}>{statuses[s] ?? s}</Status>;
  const fileUrl = (r: Row, fileId: string) => `/api/bug-reports/${r.id}/files/${fileId}`;
  const isImage = (mime: string) => ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime);
  const bytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  const noteFields: FieldConfig[] = [{ name: "note", label: L("ملاحظة للمطورين (خاصة)", "Private note for the developers"), type: "textarea", wide: true, maxLength: 4000 }];

  return {
    id: "bug-reports",
    title: L("بلاغات المشاكل", "Bug reports"),
    unit: L("بلاغ", "report"),
    keys: ["super-control/bug-reports"],
    views: [{
      id: "reports", label: L("بلاغات المشاكل", "Bug reports"), keys: ["super-control/bug-reports"],
      create: [],
      endpoint: "/bug-reports",
      chips: [
        { id: "all", label: L("الكل", "All") },
        { id: "new", label: statuses.new, query: { status: "new" } },
        { id: "seen", label: statuses.seen, query: { status: "seen" } },
        { id: "fixed", label: statuses.fixed, query: { status: "fixed" } },
      ],
      paging: { sizeParam: null },
      columns: [
        { key: "reportNumber", label: L("الرقم", "No."), render: (r) => <Ltr>{r.reportNumber}</Ltr> },
        { key: "type", label: L("النوع", "Type"), render: (r) => types[r.type] ?? r.type },
        { key: "reporterName", label: L("اللي بلّغ", "Reporter") },
        { key: "branchName", label: L("الفرع", "Branch"), render: (r) => r.branchName ?? "" },
        { key: "screenPath", label: L("الشاشة", "Screen"), render: (r) => (r.screenPath ? <Ltr>{r.screenPath}</Ltr> : "") },
        { key: "status", label: L("الحالة", "Status"), render: (r) => statusNode(r.status) },
        { key: "fileCount", label: L("ملفات", "Files"), type: "int" },
        { key: "createdAt", label: L("وقت البلاغ", "Sent"), render: (r) => stamp(r.createdAt) },
      ],
    }],
    record: {
      title: (r) => `${L("بلاغ رقم", "Report no.")} ${r.reportNumber}`,
      endpoint: (r) => `/bug-reports/${r.id}`,
      render: (r) => (
        <>
          <Section title={L("البلاغ", "The report")}>
            <Kv k={L("النوع", "Type")}>{types[r.type] ?? r.type}</Kv>
            <Kv k={L("الحالة", "Status")}>{statusNode(r.status)}</Kv>
            <Kv k={L("المشكلة", "Problem")}><Textarea readOnly rows={5} dir="auto" value={r.description} /></Kv>
            <Kv k={L("كان بيعمل إيه", "Doing")}>{r.doing ?? ""}</Kv>
            <Kv k={L("ملاحظة المطورين", "Developer note")}><Textarea readOnly rows={3} dir="auto" value={r.note ?? ""} /></Kv>
          </Section>
          <Section title={L("اللي بلّغ", "Reporter")}>
            <Kv k={L("الاسم", "Name")}>{r.reporterName}</Kv>
            <Kv k={L("اسم الدخول", "Username")}><Ltr>{r.reporterUsername}</Ltr></Kv>
            <Kv k={L("نوع المستخدم", "User type")}>{r.reporterType}</Kv>
            <Kv k={L("الفرع", "Branch")}>{r.branchName ?? ""}</Kv>
          </Section>
          <Section title={L("الجلسة والجهاز", "Session and device")}>
            <Kv k={L("الشاشة", "Screen")}>{r.screenPath ? <Ltr>{r.screenPath}</Ltr> : ""}</Kv>
            <Kv k={L("نسخة التطبيق", "App version")}>{r.appVersion ? <Ltr>{r.appVersion}</Ltr> : ""}</Kv>
            <Kv k={L("المتصفح", "Browser")}><Ltr>{r.userAgent ?? ""}</Ltr></Kv>
            <Kv k={L("حجم الشاشة", "Window size")}>{r.viewport ? <Ltr>{r.viewport}</Ltr> : ""}</Kv>
            <Kv k={L("اللغة", "Language")}>{r.language ?? ""}</Kv>
            <Kv k={L("عنوان الشبكة", "IP address")}><Ltr>{r.ipAddress ?? ""}</Ltr></Kv>
            <Kv k={L("وقت الدخول", "Signed in at")}>{stamp(r.sessionStartedAt)}</Kv>
            <Kv k={L("وقت البلاغ (من الجهاز)", "Sent at (device clock)")}>{stamp(r.clientTime)}</Kv>
            <Kv k={L("رقم الجلسة", "Session id")}><Ltr>{r.sessionId ?? ""}</Ltr></Kv>
          </Section>
          <Section title={L("آخر أخطاء من السيرفر", "Last errors from the server")}>
            <DataTable head={[L("الوقت", "Time"), L("العنوان", "Address"), { label: L("الحالة", "Status"), num: true }, L("الرسالة", "Message")]}
              foot={Array.isArray(r.recentErrors) && r.recentErrors.length === 0 ? <TableRow><Td colSpan={4} className="mute">{L("مفيش أخطاء اتسجلت.", "No errors were recorded.")}</Td></TableRow> : null}>
              {(Array.isArray(r.recentErrors) ? r.recentErrors : []).map((e: Row, i: number) => (
                <TableRow key={i}><Td>{stamp(e.at)}</Td><Td><Ltr>{e.path}</Ltr></Td><Td num><Ltr>{e.status}</Ltr></Td><Td><Ltr>{e.message}</Ltr></Td></TableRow>
              ))}
            </DataTable>
          </Section>
          <Section title={L("الملفات", "Files")}>
            {(r.files as Row[]).length === 0 && <span className="mute">{L("مفيش ملفات.", "No files.")}</span>}
            {(r.files as Row[]).map((f) => (
              <Kv key={f.id} k={bytes(f.size)}>
                <a href={fileUrl(r, f.id)} target="_blank" rel="noreferrer" download={isImage(f.mimeType) ? undefined : f.fileName} dir="auto">{f.fileName}</a>
                {isImage(f.mimeType) && <img src={fileUrl(r, f.id)} alt={f.fileName} loading="lazy" width={320} />}
              </Kv>
            ))}
          </Section>
        </>
      ),
      actions: [
        ...(["new", "seen", "fixed"] as const).map((s) => ({
          id: `status-${s}`,
          label: L(`علّم: ${statuses[s]}`, `Mark ${statuses[s].toLowerCase()}`),
          icon: "check",
          when: (r: Row) => r.status !== s,
          run: async (r: Row, h: { reload: () => void; toast: (m: string, o?: { error?: boolean }) => void }) => {
            try { await api(`/bug-reports/${r.id}`, { method: "PATCH", body: { status: s }, saveKey: newSaveKey() }); h.reload(); } catch { h.toast(L("ماتغيرش.", "Not changed."), { error: true }); }
          },
        })),
        { id: "note", label: L("ملاحظة", "Note"), icon: "edit", run: (r: Row, h: { close: () => void; openForm: (id: string, row?: Row | null) => void }) => { h.close(); h.openForm("note", r); } },
      ],
    },
    forms: {
      note: { title: (r) => L(`ملاحظة على بلاغ ${r!.reportNumber}`, `Note on report ${r!.reportNumber}`), path: (r) => `/bug-reports/${r!.id}`, method: "PATCH", load: (r) => ({ note: r!.note ?? "" }), toPayload: (v) => ({ note: v.note ? String(v.note) : null }), fields: noteFields },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} />; }
