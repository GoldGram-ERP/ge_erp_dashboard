// The sidebar tree (ported from docs/nav-preview/app/things/index.js). Labels come from messages: nav.group.<id>, nav.item.<id>.
// route = /<group>/<item> without the locale; screens = permission keys (section/screen): a leaf shows when the person may open ANY of them.
export type NavLeaf = { id: string; route: string; screens: string[] };
export type NavGroup = { id: string; icon: string; superOnly?: boolean; items: NavLeaf[] };

export const NAV: NavGroup[] = [
 {
  "id": "sales",
  "icon": "sales",
  "items": [
   {
    "id": "invoices",
    "route": "/sales/invoices",
    "screens": [
     "gold-sales/sales-invoices",
     "gold-sales/sales-invoices-list",
     "gold-sales/sales-report",
     "gold-sales/sales-by-period",
     "gold-sales/unpaid-invoices",
     "gold-sales/find-invoice"
    ]
   },
   {
    "id": "reservations",
    "route": "/sales/reservations",
    "screens": [
     "gold-sales/reservations",
     "gold-sales/reservations-list",
     "gold-sales/reserved-pieces",
     "gold-sales/cancelled-reservations"
    ]
   },
   {
    "id": "returns",
    "route": "/sales/returns",
    "screens": [
     "gold-sales/returns",
     "gold-sales/returns-list",
     "gold-sales/find-return"
    ]
   },
   {
    "id": "pieces",
    "route": "/sales/pieces",
    "screens": [
     "gold-sales/piece-lookup",
     "gold-sales/reprint-label",
     "gold-sales/gold-stock"
    ]
   }
  ]
 },
 {
  "id": "buy",
  "icon": "gem",
  "items": [
   {
    "id": "items",
    "route": "/buy/items",
    "screens": [
     "gold-accounts/categories",
     "gold-accounts/categories-list",
     "gold-accounts/item-names",
     "gold-accounts/item-names-list",
     "gold-accounts/items",
     "gold-accounts/items-list"
    ]
   },
   {
    "id": "purchases",
    "route": "/buy/purchases",
    "screens": [
     "gold-accounts/purchase-invoices",
     "gold-accounts/purchase-invoices-list",
     "gold-accounts/purchase-coding",
     "gold-accounts/pieces-list"
    ]
   },
   {
    "id": "returned-pieces",
    "route": "/buy/returned-pieces",
    "screens": [
     "gold-accounts/purchase-coding"
    ]
   }
  ]
 },
 {
  "id": "stock",
  "icon": "stock",
  "items": [
   {
    "id": "count",
    "route": "/stock/count",
    "screens": [
     "gold-stocktake/stock-count",
     "gold-stocktake/previous-counts",
     "gold-stocktake/missing-pieces",
     "gold-stocktake/missing-pieces-previous"
    ]
   },
   {
    "id": "branch-stock",
    "route": "/stock/branch-stock",
    "screens": [
     "gold-stocktake/stock-by-category",
     "gold-stocktake/stock-by-item",
     "gold-stocktake/sales-by-item"
    ]
   }
  ]
 },
 {
  "id": "money",
  "icon": "banks",
  "items": [
   {
    "id": "cash",
    "route": "/money/cash",
    "screens": [
     "cash-accounts/cash-movements",
     "cash-accounts/cash-movements-history",
     "cash-accounts/safe-statement",
     "cash-accounts/safe-balances"
    ]
   },
   {
    "id": "treasuries",
    "route": "/money/treasuries",
    "screens": [
     "treasuries/treasuries",
     "treasuries/treasury-balances",
     "cash-accounts/treasury-statement"
    ]
   },
   {
    "id": "transfers",
    "route": "/money/transfers",
    "screens": [
     "treasuries/treasury-transfers",
     "treasuries/in-transit"
    ]
   },
   {
    "id": "banks",
    "route": "/money/banks",
    "screens": [
     "bank-accounts/banks",
     "bank-accounts/banks-list",
     "bank-accounts/bank-accounts",
     "bank-accounts/bank-accounts-list",
     "bank-accounts/bank-balances"
    ]
   },
   {
    "id": "bank-movements",
    "route": "/money/bank-movements",
    "screens": [
     "bank-movements/bank-movements",
     "bank-movements/bank-movements-history",
     "bank-movements/bank-statement"
    ]
   },
   {
    "id": "bank-transfers",
    "route": "/money/bank-transfers",
    "screens": [
     "bank-movements/bank-transfers",
     "bank-movements/bank-transfers-history"
    ]
   }
  ]
 },
 {
  "id": "expenses",
  "icon": "exp",
  "items": [
   {
    "id": "expense-types",
    "route": "/expenses/expense-types",
    "screens": [
     "expenses/expense-types",
     "expenses/expense-types-list"
    ]
   },
   {
    "id": "expenses",
    "route": "/expenses/expenses",
    "screens": [
     "expenses/expenses",
     "expenses/expenses-history",
     "expenses/expense-refunds",
     "expenses/expense-refunds-history",
     "expenses/expenses-report",
     "expenses/expenses-by-type"
    ]
   }
  ]
 },
 {
  "id": "setup",
  "icon": "settings",
  "items": [
   {
    "id": "users",
    "route": "/setup/users",
    "screens": [
     "administration/users",
     "administration/users-list"
    ]
   },
   {
    "id": "branches",
    "route": "/setup/branches",
    "screens": [
     "system-codes/branches",
     "system-codes/branches-list"
    ]
   },
   {
    "id": "karats",
    "route": "/setup/karats",
    "screens": [
     "system-codes/karats",
     "system-codes/karats-list"
    ]
   },
   {
    "id": "gold-prices",
    "route": "/setup/gold-prices",
    "screens": [
     "system-codes/gold-prices",
     "system-codes/gold-prices-history"
    ]
   },
   {
    "id": "settings",
    "route": "/setup/settings",
    "screens": [
     "administration/settings"
    ]
   }
  ]
 },
 {
  "id": "control",
  "icon": "crown",
  "superOnly": true,
  "items": [
   {
    "id": "accounts",
    "route": "/control/accounts",
    "screens": [
     "super-control/admin-accounts",
     "super-control/locked-accounts",
     "super-control/active-sessions"
    ]
   },
   {
    "id": "security",
    "route": "/control/security",
    "screens": [
     "super-control/security-policy",
     "super-control/data-reset",
     "super-control/activity-log"
    ]
   }
  ]
 }
];

export const allLeaves = () => NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g })));
export const findLeaf = (route: string) => allLeaves().find((l) => l.route === route);
export const canOpen = (me: { screens: string[] } | null | undefined, screens: string[]) => !!me && screens.some((k) => me.screens.includes(k));
