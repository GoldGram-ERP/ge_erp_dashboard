# Old ERP parity (audit 2026-11-04, partial: 30-minute pass)

Method: old `src/shell/screens.ts` screens and old module API paths compared with the new `src/things/*` and `src/nav/tree.ts`. Old API paths with no match in the new app: `/gold-sales/bullion-report` (hidden in the old app on 2026-10-27, replaced by stock by category), `/settings/brand` (new Settings form), and the by-id paths, which the new app builds with other template strings. So no old endpoint is dropped by accident.

| Old section | New route | Status | Notes |
|---|---|---|---|
| Administration: Users, User list, job assignment | /setup/users | Covered, extended | Add user also on the Assign jobs view; record actions Edit, Assign screens, Assign jobs, Unlock, Print, Delete; shortcuts removed from the form (owner: per-user preference, sidebar pins); screens search added |
| Administration: Settings | /setup/settings | Covered | |
| System codes: Karats (list), Gold prices (+history), Branches | /setup/karats, /gold-prices, /branches | Covered | Karats are read-only in the old app too |
| Cash accounts: movements, history, safe statement, balances, treasury statement | /money/cash, /money/treasuries | Covered | |
| Treasuries: treasuries, transfers, balances, in transit | /money/treasuries, /money/transfers | Covered | Treasuries are read-only (backend has no write) |
| Bank accounts and bank movements, transfers, statement, balances | /money/banks, /bank-movements, /bank-transfers | Covered | |
| Gold accounts: categories, item names, items, purchase invoices, coding, pieces | /buy/items, /buy/purchases | Covered | |
| Gold sales: invoices, reservations, returns, reprint, piece look-up, reports | /sales/* | Covered | Reserved / cancelled-reservation reports are views of Reservations |
| Gold stocktake: count, previous, missing, stock by category / item, sales by item | /stock/count, /stock/branch-stock | Covered | Not re-checked screen by screen |
| Expenses: types, expenses, refunds, reports | /expenses/* | Covered | |
| Super control: admins, locked, policy, sessions, reset, log | /control/accounts, /control/security | Covered | |
| Customer accounts | none | Not built in the old app either | |

Not checked in this pass (time): column and filter parity per report, print and Excel on every report, empty and permission states. Next pass should diff each old `*-table.tsx` columns against the matching `things/*.tsx` view.
