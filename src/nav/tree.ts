// The sidebar tree (ported from docs/nav-preview/app/things/index.js). Labels come from messages: nav.group.<id>, nav.item.<id>.
// route = /<group>/<item> without the locale; screens = permission keys (section/screen): a leaf shows when the person may open ANY of them.
// adminOnly: shown to an Admin, not to a Super admin (who has the same page elsewhere).
export type NavLeaf = { id: string; route: string; screens: string[]; adminOnly?: boolean };
export type NavGroup = { id: string; icon: string; superOnly?: boolean; items: NavLeaf[] };

export const NAV: NavGroup[] = [
 {
  "id": "sales",
  "icon": "sales",
  "items": [
   {
    "id": "sales-desk",
    "route": "/sales/desk",
    "screens": [
     "gold-sales/sales-desk"
    ]
   },
   {
    "id": "price-board",
    "route": "/sales/price-board",
    "screens": [
     "gold-sales/price-board"
    ]
   },
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
    "id": "customer-orders",
    "route": "/sales/customer-orders",
    "screens": [
     "gold-sales/customer-orders"
    ]
   },
   {
    "id": "returns",
    "route": "/sales/returns",
    "screens": [
     "gold-sales/returns",
     "gold-sales/returns-list",
     "gold-sales/find-return",
     "gold-accounts/purchase-coding"
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
    "id": "merchants",
    "route": "/buy/merchants",
    "screens": [
     "merchants/merchants"
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
    "id": "delivery-charges",
    "route": "/setup/delivery-charges",
    "screens": [
     "gold-sales/delivery-charges"
    ]
   },
   // Workmanship and cashback (bulk): Admin and Super admin only, the same screen key as Settings (no screen key of its own in the backend yet).
   {
    "id": "item-fees",
    "route": "/setup/item-fees",
    "screens": [
     "administration/settings"
    ]
   },
   // Test printer: label printer tests (size, orientation, layout, rotation). Admin and Super admin only, the same screen key as Settings.
   {
    "id": "test-printer",
    "route": "/setup/test-printer",
    "screens": [
     "administration/settings"
    ]
   },
   // The activity log for an Admin (owner, 2026-11-24): the Super admin reads it in "الأمان والبيانات", so only an Admin gets this item.
   {
    "id": "activity-log",
    "route": "/setup/activity-log",
    "screens": [
     "administration/activity-log"
    ],
    "adminOnly": true
   },
   // The Settings page is commented out of the sidebar, the search and its address (owner, 2026-11-05) until further notice.
   // To bring it back, remove the comment markers around this entry; nothing else was removed.
   /*
   {
    "id": "settings",
    "route": "/setup/settings",
    "screens": [
     "administration/settings"
    ]
   }
   */
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
   },
   {
    "id": "bug-reports",
    "route": "/control/bug-reports",
    "screens": [
     "super-control/bug-reports"
    ]
   }
  ]
 }
];

/** Whether a leaf is in this person's menu: they may open it, and an admin-only leaf is not for a Super admin. */
export const leafShown = (me: { screens: string[]; userType?: string } | null | undefined, leaf: NavLeaf) => canOpen(me, leaf.screens) && !(leaf.adminOnly && me?.userType === "super_admin");
export const allLeaves = () => NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g })));
export const findLeaf = (route: string) => allLeaves().find((l) => l.route === route);
export const canOpen = (me: { screens: string[] } | null | undefined, screens: string[]) => !!me && screens.some((k) => me.screens.includes(k));
