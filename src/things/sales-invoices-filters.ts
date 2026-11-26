// The filters نوع الفاتورة and حالة التسليم of the invoice list and the sales report (owner, 2026-11-26).
import type { FilterConfig } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";

// The kinds that have a delivery to ask about: a sale is handed over at once (owner, 2026-11-26).
const DELIVERY_KINDS = ["taslem", "shipping", "reservation"];
/** The filters نوع الفاتورة and حالة التسليم of the invoice list and the sales report. The type is the backend's `kind`: تسليم is delivery
 *  and handover together, حجز is an invoice made from a reservation. حالة التسليم shows, and is sent, only for the kinds that have one. */
export const kindFilters = ({ t, L }: Pick<Tr, "t" | "L">): FilterConfig[] => [
  { name: "kind", label: t("gold-sales", "salesInvoices.invoiceType"), type: "select", placeholder: t("common", "report.all"),
    options: [["sale", t("gold-sales", "salesInvoices.invoiceTypes.sale")], ["taslem", L("تسليم", "Delivery")], ["reservation", L("حجز", "Reservation")], ["shipping", L("توصيل", "Shipping")]] },
  { name: "delivered", label: L("حالة التسليم", "Delivery status"), type: "select", placeholder: t("common", "report.all"),
    options: [["true", L("نعم", "Yes")], ["false", L("لا", "No")]],
    when: (all) => DELIVERY_KINDS.includes(String(all.kind ?? "")),
    toQuery: (v, all): Record<string, string> => (v && DELIVERY_KINDS.includes(String(all.kind ?? "")) ? { delivered: String(v) } : {}) },
];
