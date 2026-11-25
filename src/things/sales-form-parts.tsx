"use client";
import { hasAction } from "@/lib/actions";
import { Input, Seg } from "@/components/ui";
import type { InputKind } from "@/components/ui/Input";
// Pieces the sales forms share (invoice, reservation, return). Ported from docs/nav-preview/app/things/sales-form-parts.js.
// Text helpers take `tr` (useT()); the HTML's string builders became small React components.
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import type { FieldConfig, Row } from "@/lib/engine-types";
import { latinNumber, piastresText } from "@/lib/format";
import { isNationalId, isPhone, NATIONAL_ID_LENGTH, PHONE_LENGTH } from "@/lib/phone";
import type { Tr } from "@/lib/t";
import type { Me } from "@/stores/ui";
import { Select } from "@/components/fields/Select";
import { FieldError } from "@/components/fields/FieldError";

export const sg = (tr: Tr, k: string, v?: Record<string, string | number | undefined>) => tr.t("gold-sales", `salesInvoices.${k}`, v);
export const fe = (tr: Tr, k: string) => tr.t("common", `fieldErrors.${k}`);
import { code6 as code6 } from "@/lib/code6";
export { code6 };
export const PIECE_CODE = /^[A-Za-z0-9 .]{1,20}$/;   // the backend's pattern for a piece code

export const ErrBox = FieldError;   // the old local helper: now the one shared per-field warning
/** Style for inputs that hold numbers/codes: left-to-right, text at the end. */
export const ltrStyle = { direction: "ltr", textAlign: "end" } as const;

// Cash discount: Admin and Super admin always may, a User only with the flag. An older /access/me without the flag follows the user type.
export const mayDiscount = (me: Pick<Me, "userType" | "actions">) => hasAction(me, "give-cash-discount");

// Every row of a paged list (the backend's lists page at 20). Capped at 25 pages.
export async function allPages(path: string, query: Record<string, any> = {}): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page <= 25; page++) {
    const r = await api(path, { query: { ...query, page } });
    const items: Row[] = r?.items ?? [];
    out.push(...items);
    if (!items.length || out.length >= (r?.total ?? 0)) break;
  }
  return out;
}

// The latest saved gold price set dated up to `day` (the owner's rule: always the latest); null when there is none at all.
export async function latestPrice(day: string): Promise<Row | null> {
  const items: Row[] = (await api("/gold-prices", { query: { toDate: day } })).items ?? [];
  return items.reduce<Row | null>((best, s) => (best && best.date >= s.date ? best : s), null);
}

/** A choice box (no native select): id/name `id`, value is the picked key or "". */
export function Choice({ id, options, value, onChange, tr, placeholder, searchable = true, disabled, invalid, describedBy }: { id: string; options: [string | number, string][]; value: string; onChange: (v: string) => void; tr: Tr; placeholder?: string; searchable?: boolean; disabled?: boolean; invalid?: boolean; describedBy?: string }) {
  return <Select id={id} name={id} value={value} onChange={onChange} options={options} placeholder={placeholder ?? sg(tr, "choose")} searchable={searchable} disabled={disabled} invalid={invalid} describedBy={describedBy} />;
}

// ── customer ──
export const customerFields = (tr: Tr, disabled?: boolean): FieldConfig[] => [
  { name: "customerPhone", label: `${sg(tr, "customerPhone")} *`, type: "text", maxLength: PHONE_LENGTH, disabled, help: sg(tr, "phoneHint") },
  { name: "customerName", label: `${sg(tr, "customerName")} *`, type: "text", maxLength: 100, disabled },
  { name: "nationalId", label: sg(tr, "nationalId"), type: "text", maxLength: NATIONAL_ID_LENGTH, disabled, help: sg(tr, "nationalIdHint") },
];
export const customerRules = (tr: Tr): Record<string, (v: string) => string | null> => ({
  customerPhone: (v) => (v === "" ? fe(tr, "required") : isPhone(v) ? null : fe(tr, "phone")),
  customerName: (v) => (v === "" ? fe(tr, "required") : v.length > 100 ? fe(tr, "tooLong") : null),
  nationalId: (v) => (v === "" || isNationalId(v) ? null : fe(tr, "nationalId")),
});
/** The customer fields with their rules attached (for the engine's field machinery). */
export const checkedCustomer = (tr: Tr, fields: FieldConfig[] = customerFields(tr)): FieldConfig[] => {
  const rules = customerRules(tr);
  return fields.map((f) => ({ ...f, validate: (v: any) => rules[f.name]?.(String(v ?? "").trim()) ?? null }));
};
/** The name last used with a phone (GET /sales-invoices/customer-name); null when none or not a phone. */
export async function customerNameOf(phone: string): Promise<string | null> {
  const digits = latinNumber(phone.trim());
  if (!isPhone(digits)) return null;
  try { return (await api("/sales-invoices/customer-name", { query: { phone: digits } })).customerName ?? null; } catch { return null; }
}

export type DiscountKind = "amount" | "percent";
/** Cash discount box. lockedValue: a reservation's own (read only); may=false: locked 0 + note. Help/error rows are the caller's (#discHelp, #discErr). */
export function DiscountBox({ tr, may, kind, disc, lockedValue, onKind, onDisc, help, error }: { tr: Tr; may: boolean; kind: DiscountKind; disc: string; lockedValue?: number; onKind: (k: DiscountKind) => void; onDisc: (v: string) => void; help?: ReactNode; error?: ReactNode }) {
  if (lockedValue !== undefined) return <Input kind="money" id="cashDiscount" disabled dir="ltr" value={piastresText(lockedValue)} style={{ textAlign: "end" }} readOnly />;
  if (!may) return <><Input id="cashDiscount" disabled dir="ltr" value={piastresText(0)} style={{ textAlign: "end" }} readOnly /><div className="help">{sg(tr, "cashDiscountNotAllowed")}</div></>;
  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Seg label={sg(tr, "cashDiscountKind")} value={kind} onChange={onKind}
          items={(["amount", "percent"] as const).map((k) => ({ id: k, label: sg(tr, k === "amount" ? "discountAmount" : "discountPercent"), attrs: { "data-kind": k } }))} />
        <Input id="cashDiscount" dir="ltr" inputMode="decimal" autoComplete="off" maxLength={13} placeholder="0" value={disc} style={{ maxWidth: 140, textAlign: "end" }} onChange={(e) => onDisc(e.target.value)} />
      </div>
      <div className="help" id="discHelp">{help}</div><div id="discErr">{error}</div>
    </>
  );
}

/** A labelled text box with the HTML's ids (#f-<name>), help and error. */
export function TextBox({ name, label, value, onChange, error, help, maxLength, ltr, disabled, onBlur, placeholder, kind }: { kind?: InputKind; name: string; label: string; value: string; onChange: (v: string) => void; error?: string; help?: string; maxLength?: number; ltr?: boolean; disabled?: boolean; onBlur?: () => void; placeholder?: string }) {
  return (
    <div className="field" data-k={name} data-err={error ? "" : undefined}>
      <label htmlFor={`f-${name}`}>{label}</label>
      <Input kind={kind} id={`f-${name}`} name={name} value={value} placeholder={placeholder} maxLength={maxLength} disabled={disabled} autoComplete="off" aria-invalid={!!error} aria-describedby={[help ? `f-${name}-help` : "", error ? `f-${name}-err` : ""].filter(Boolean).join(" ") || undefined} dir={ltr ? "ltr" : undefined} style={ltr ? { textAlign: "end" } : undefined}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      {help && <div className="help" id={`f-${name}-help`}>{help}</div>}
      {error && <ErrBox id={`f-${name}-err`}>{error}</ErrBox>}
    </div>
  );
}

/** The customer boxes (phone, name, national id); the phone used before fills an empty name on blur. */
export function CustomerBoxes({ tr, v, set, errors = {}, disabled }: { tr: Tr; v: Record<string, string>; set: (k: string, val: string) => void; errors?: Record<string, string>; disabled?: boolean }) {
  const fill = async () => { if ((v.customerName ?? "").trim() !== "") return; const n = await customerNameOf(v.customerPhone ?? ""); if (n) set("customerName", n); };
  return <div className="formgrid" id="cust">{customerFields(tr, disabled).map((f) => (
    <TextBox key={f.name} name={f.name} label={f.label} value={v[f.name] ?? ""} onChange={(x) => set(f.name, x)} error={errors[f.name]} help={f.help} maxLength={f.maxLength} disabled={disabled}
      ltr={f.name !== "customerName"} onBlur={f.name === "customerPhone" ? fill : undefined} />
  ))}</div>;
}

// readPieceCode (dashboard piece-code.ts): trimmed, Arabic digits -> Latin; only the shop's pattern.
export function readPieceCode(tr: Tr, typed: unknown): { code: string; error?: undefined } | { error: string; code?: undefined } {
  const code = String(typed ?? "").trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (PIECE_CODE.test(code)) return { code };
  const arabic = /[؀-ۿ]/.test(code);
  return { error: tr.t("gold-sales", "pieceLookUp.notOurCode") + (arabic ? `. ${tr.t("gold-sales", "pieceLookUp.switchKeyboard")}` : "") };
}
// The latest pieces to pick from (the dashboard's RecordBox): state "available" | "sold" | undefined (any).
export async function pieceChoices(search: string, { state, branchId }: { state?: string; branchId?: string } = {}): Promise<Row[]> {
  const r = await api("/piece-choices", { query: { search: search.trim(), state, branchId: branchId || undefined, page: 1 } });
  return r.items ?? [];
}
