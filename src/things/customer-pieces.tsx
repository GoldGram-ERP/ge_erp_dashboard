"use client";
// قطع مرتجعة (ليست من مبيعاتنا): buy/returned-pieces (issue #4, backend #167). A piece a customer brings back is BOUGHT from them (owner, 2026-11-05):
// one purchase document of N pieces of an item, paid in full, each piece in stock with its label. It is then sold like any piece.
// Open to whoever holds the Purchase coding screen (the backend's screen map: Purchase coding owns customer-pieces).
// The backend has no list of all of them: a piece is found by its code (GET /customer-pieces?code=) or by the customer's phone
// (GET /customer-pieces/by-phone, 20 at most, newest first); the branch goes to the backend, category and karat narrow what came back.
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, MakeConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { dateTimeText, milligramsText } from "@/lib/format";
import { Kv, Ltr, Section, ThingPage } from "@/components/engine";
import { useAccess } from "./sales-access";
import { CustomerPieceForm, openLabelPrint } from "./customer-pieces-form";
import { narrow, readFind } from "./customer-pieces-rules";

const KEYS = ["gold-accounts/purchase-coding"];

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const cp = (k: string, v?: Record<string, string>) => t("gold-accounts", `customerPieces.${k}`, v);
  const reprint = (r: Row) => { openLabelPrint(tr, r.label).catch(() => {}); };
  const removal = async (r: Row, h: { close: () => void; toast: (m: string, o?: { error?: boolean }) => void; reload: () => void }, path: string) => {
    try {
      await api(path, { method: "DELETE", saveKey: newSaveKey() });
    } catch (e) {
      const m = e instanceof ApiFailure ? e.error.message : "";
      if (m === "pieceSold" || m === "pieceNotAvailable" || m === "pieceInPurchase") { h.toast(cp(m), { error: true }); return; }
      throw e;
    }
    h.close(); h.toast(cp("deletedToast", { code: r.code })); h.reload();
  };

  const findView: ViewConfig = {
    id: "find", label: cp("listTitle"), keys: KEYS, rowKey: "id", runLabel: cp("findRun"), paging: false,
    filters: [
      { name: "find", label: cp("find"), type: "text", required: true, maxLength: 20, help: cp("findHelp"), validate: (v) => (v && !readFind(v) ? cp("findInvalid") : null) },
      { name: "categoryId", label: cp("category"), type: "select", optionsFrom: { path: "/categories", value: "id", label: "categoryName", pageOnly: true }, placeholder: t("common", "report.all") },
      { name: "karat", label: cp("karat"), type: "select", options: ["18", "21", "24", "999"].map((k) => [k, k]), placeholder: t("common", "report.all") },
      { name: "branchId", label: cp("branch"), type: "select", optionsFrom: { path: "/branches", value: "id", label: "branchName" }, placeholder: t("common", "report.all") },
    ],
    async load(query, { signal }) {
      const f = readFind(query.find);
      if (!f) return { items: [], total: 0 };
      const branchId = query.branchId || undefined;
      const byCode = api("/customer-pieces", { query: { code: f.code, branchId }, signal }).then((r) => [r as Row], (e) => {
        if (e instanceof ApiFailure && e.status === 404) return [] as Row[];
        throw e;
      });
      const byPhone = f.phone ? api("/customer-pieces/by-phone", { query: { phone: f.phone, branchId }, signal }).then((r) => (r.items ?? []) as Row[]) : Promise.resolve([] as Row[]);
      const items = narrow((await Promise.all([byPhone, byCode])).flat(), query);
      return { items, total: items.length };
    },
    columns: [
      { key: "code", label: cp("code"), render: (r) => <Ltr>{r.code}</Ltr> },
      { key: "categoryName", label: cp("category") },
      { key: "itemName", label: cp("item") },
      { key: "karat", label: cp("karat") },
      { key: "weight", label: cp("weight"), type: "weight" },
      { key: "customerName", label: cp("customerName") },
      { key: "customerPhone", label: cp("customerPhone"), render: (r) => <Ltr>{r.customerPhone}</Ltr> },
      { key: "createdAt", label: cp("createdAt"), type: "date" },
      { key: "reprint", label: cp("reprint"), sortable: false, render: (r) => (r.deletedAt ? null
        : <button type="button" className="btn quiet sm" data-reprint={r.code} aria-label={cp("reprintCode", { code: r.code })} onClick={(e) => { e.stopPropagation(); reprint(r); }}>{cp("reprint")}</button>) },
    ],
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
  };

  return {
    id: "returned-pieces",
    title: cp("title"),
    unit: L("قطعة", "pieces"),
    keys: KEYS,
    views: [findView],
    create: [{ form: "create", label: cp("add"), keys: KEYS }],
    record: {
      title: (r) => `${cp("pieceTitle")} · ${r.code}`,
      endpoint: (r) => `/customer-pieces/${r.id}`,
      render: (r) => (
        <div className="bpr-rec">
          {r.deletedAt ? <div className="note warn">{cp("deleted")} · {dateTimeText(r.deletedAt)}</div> : null}
          <Section title={cp("pieceTitle")}>
            <Kv k={cp("code")}><Ltr>{r.code}</Ltr></Kv><Kv k={cp("category")}>{r.categoryName ?? "—"}</Kv><Kv k={cp("item")}>{r.itemName ?? "—"}</Kv>
            <Kv k={cp("karat")}><Ltr>{r.karat}</Ltr></Kv><Kv k={cp("weight")}><Ltr>{milligramsText(r.weight)}</Ltr></Kv><Kv k={cp("description")}>{r.description}</Kv>
          </Section>
          <Section title={cp("customer")}>
            <Kv k={cp("customerName")}>{r.customerName}</Kv><Kv k={cp("customerPhone")}><Ltr>{r.customerPhone}</Ltr></Kv><Kv k={cp("createdAt")}><Ltr>{dateTimeText(r.createdAt)}</Ltr></Kv>
          </Section>
        </div>
      ),
      actions: [
        { id: "reprint", label: cp("reprint"), icon: "print", when: (r) => !r.deletedAt, run: (r) => reprint(r) },
        // Delete marks the record and its stock piece; the backend refuses a sold piece or one on a treasury transfer, said here in this screen's words.
        // A piece that was bought leaves only with its whole purchase (the money goes back in the same step): pieceInPurchase says so.
        { id: "delete", label: L("حذف", "Delete"), icon: "trash", danger: true, when: (r) => !r.deletedAt && !r.purchaseId, confirm: { title: cp("deleteTitle"), text: cp("deleteBody") },
          run: async (r, h) => removal(r, h, `/customer-pieces/${r.id}`) },
        { id: "deletePurchase", label: cp("deletePurchase"), icon: "trash", danger: true, when: (r) => !r.deletedAt && !!r.purchaseId, confirm: { title: cp("deletePurchaseTitle"), text: cp("deletePurchaseBody") },
          run: async (r, h) => removal(r, h, `/customer-pieces/purchases/${r.purchaseId}`) },
      ],
    },
    forms: { create: { display: "page", title: cp("add"), fields: [], path: () => "/customer-pieces", custom: (p: CustomFormProps) => <CustomerPieceForm {...p} /> } },
  };
};

export default function Page() {
  return <ThingPage make={makeConfig} access={useAccess()} />;
}
