import type { ComponentType } from "react";

// Pages made by the engine register here. Key = the route without the locale, "<group>/<item>" (e.g. "sales/invoices").
// Deeper paths (sales/invoices/new) render the same entry; read the rest with useParams().path.
export type ThingEntry = { load: () => Promise<{ default: ComponentType }> };
export const things: Record<string, ThingEntry> = {};

// Engine pages (builder B). Add one line per ported page.
things["money/banks"] = { load: () => import("./banks") };
things["setup/gold-prices"] = { load: () => import("./gold-prices") };
things["sales/invoices"] = { load: () => import("./sales-invoices") };
things["sales/returns"] = { load: () => import("./sales-returns") };
things["sales/reservations"] = { load: () => import("./sales-reservations") };
things["sales/pieces"] = { load: () => import("./sales-pieces") };
things["buy/items"] = { load: () => import("./gold-items") };
things["buy/purchases"] = { load: () => import("./gold-purchases") };
things["stock/count"] = { load: () => import("./stocktake-count") };
things["stock/branch-stock"] = { load: () => import("./stocktake-branch") };
things["money/cash"] = { load: () => import("./cash") };
things["money/treasuries"] = { load: () => import("./treasuries") };
things["money/transfers"] = { load: () => import("./treasury-transfers") };
things["money/bank-movements"] = { load: () => import("./bank-movements") };
things["money/bank-transfers"] = { load: () => import("./bank-transfers") };
things["setup/users"] = { load: () => import("./users") };
things["control/accounts"] = { load: () => import("./control-accounts") };
