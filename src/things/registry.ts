import type { ComponentType } from "react";

// Pages made by the engine register here. Key = the route without the locale, "<group>/<item>" (e.g. "sales/invoices").
// Deeper paths (sales/invoices/new) render the same entry; read the rest with useParams().path.
export type ThingEntry = { load: () => Promise<{ default: ComponentType }> };
export const things: Record<string, ThingEntry> = {};

// Engine pages (builder B). Add one line per ported page.
things["money/banks"] = { load: () => import("./banks") };
things["setup/gold-prices"] = { load: () => import("./gold-prices") };
things["setup/activity-log"] = { load: () => import("./activity-log") };
things["sales/price-board"] = { load: () => import("./price-board") };
things["sales/invoices"] = { load: () => import("./sales-invoices") };
things["sales/desk"] = { load: () => import("./sales-desk") };
things["sales/returns"] = { load: () => import("./sales-returns") };
things["sales/reservations"] = { load: () => import("./sales-reservations") };
things["sales/customer-orders"] = { load: () => import("./customer-orders") };
things["sales/delivery-charges"] = { load: () => import("./delivery-charges") };
things["sales/pieces"] = { load: () => import("./sales-pieces") };
things["buy/items"] = { load: () => import("./gold-items") };
things["buy/purchases"] = { load: () => import("./gold-purchases") };
things["buy/merchants"] = { load: () => import("./merchants") };
things["stock/count"] = { load: () => import("./stocktake-count") };
things["stock/branch-stock"] = { load: () => import("./stocktake-branch") };
things["money/cash"] = { load: () => import("./cash") };
things["money/treasuries"] = { load: () => import("./treasuries") };
things["money/transfers"] = { load: () => import("./treasury-transfers") };
things["money/bank-movements"] = { load: () => import("./bank-movements") };
things["money/bank-transfers"] = { load: () => import("./bank-transfers") };
things["setup/users"] = { load: () => import("./users") };
things["control/accounts"] = { load: () => import("./control-accounts") };
things["expenses/expense-types"] = { load: () => import("./expense-types") };
things["expenses/expenses"] = { load: () => import("./expenses") };
things["setup/branches"] = { load: () => import("./branches") };
things["setup/karats"] = { load: () => import("./karats") };
things["setup/item-fees"] = { load: () => import("./item-fees") };
things["setup/test-printer"] = { load: () => import("./test-printer") };
things["setup/settings"] = { load: () => import("./settings") };
things["control/security"] = { load: () => import("./control-security") };
things["control/bug-reports"] = { load: () => import("./bug-reports") };
