# Verify report, dashboard 94c30a9 (v1.0.7 + CSP + a11y), 2026-11-05 (not committed)
Backend under test: origin/main 431ca0d (ge_erp_backend 0.1.2), local DB migrated, local stack up (WSL Postgres 5433, Redis 6391, API 8100).

## Gate
- typecheck: pass. lint: 0 errors, 46 warnings. vitest: 11 files, 56 tests, all pass. Production build (separate worktree): pass.

## Local e2e on the production build (:3101), file by file
| file | result | verdict |
|---|---|---|
| smoke | 11 pass | ok |
| pages | 2 pass | ok |
| account | 7 pass | ok |
| a11y (axe) | 34 pass | ok |
| search | 3 pass | ok |
| users-ui | 3 pass | ok |
| roles-sidebar | 4 pass | ok |
| sales-ui | 0 pass / 4 fail | fixture problem |
| sales-return-ui | 0 pass / 1 fail | fixture problem |
| sales-reservation-ui | 0 pass / 1 fail | fixture problem |
| sales-gift-ui | 4 fail (seed error, same message) | fixture problem |
| purchase-invoice-ui, stocktake-ui, items, banks, gold-stock-ui, gold-flows, money-api, idempotency, api | NOT RUN | 40-minute limit reached |

Failures: all fail in the seed step with `400 invalidFields: weight, workmanshipValue, cashbackMode, cashbackValue required` (item creation in the shared seed helper, e2e-tests/tests/lib.ts or the file's seed) because backend 0.1.2 now requires those item fields. No UI assertion was reached, so these are not app regressions, but the sales/return/reservation/gift UI flows are NOT proven on this build. Fix (tests, not mine to edit): add the four fields to the seed item payload.

## Real regressions found
None among the files that ran. The new `<main>` landmark / renamed names did not break roles-sidebar, search, pages, account, smoke.

## CSP in the browser (Chrome headless, signed in, :3101)
No "Content Security Policy" / "Refused to" console messages on: home, sales list, sales form, settings (logo file input; picking a PNG showed data:/blob: images), search sheet (Ctrl K), treasury-balances Print window (opened, table rendered, inline Print handler ran), pieces camera dialog (opened, camera denied/none, no CSP error).
Other finding: React error #418 (hydration text mismatch) on /en/sales/invoices and /en/money/treasuries/in-transit (pageerror, not CSP). Not checked whether it pre-dates the CSP; worth a look (probable cause: a date/locale string rendered differently on server and client).
Not covered: the real camera stream (blob: media), the stock-count camera box (no camera button on the form pages I tried).

## Could not run
The 9 files marked NOT RUN, and items-fields (other session). Cleanup done: servers stopped, verify-build worktree removed; the shared local stack (Postgres/Redis/backend 8100) was left running.


# PASS 2 (HEAD 11ba98e, fresh production build in worktree verify-build, :3101, backend 8100 v0.1.2), 2026-11-05
Counts are per run across targets (desktop + phone [+ logic skipped]).
| file | result | verdict |
|---|---|---|
| sales-ui | 8 pass (4 x 2) | ok (pass-1 fixture failure is gone) |
| sales-return-ui | 2 pass | ok |
| sales-reservation-ui | 2 pass | ok |
| sales-gift-ui | 8 pass | ok |
| stocktake-ui | 2 pass | ok |
| items | 4 pass | ok |
| items-fields | 8 pass | ok |
| gold-stock-ui | 8 pass | ok |
| money-api | 6 pass | ok |
| idempotency | 5 pass, 2 skipped | ok |
| api | 5 pass | ok |
| purchase-invoice-ui | 0 / 2 FAIL (line 40 `mine.length > 0`) | FIXTURE: seed day is the UTC date (`toISOString`), the form saves the Cairo date; between 00:00 and 02:00 Cairo they differ, so the saved invoice is not found. Not an app bug. Fix: build `day` with the Cairo date in lib.ts seed. (Test then left 2 uncoded invoices; I deleted them via the API.) |
| banks | 0 / 4 FAIL (tap on bank row is intercepted by the open record sheet) | FIXTURE/WIP: committed as "work in progress, fails at record sheet tap" (129c218), unchanged since |
| gold-flows | 5 pass, 2 FAIL (UI sheet test: `getByText("undefined")`) | FIXTURE: the UI test reads `S.created.invoices[0]`, filled by the node-target API test of the same file; the desktop/phone targets run in separate processes, so it is empty. Fix: have the UI test create its own invoice. |
| smoke | 19 pass, 3 FAIL (phone only: Sign out, language button "outside of the viewport") | FIXTURE (pre-existing): the phone sidebar is a closed drawer and the test never opens it; desktop 11/11 pass. 11ba98e shell diff does not change visibility. Pass 1 counted desktop only. |
| a11y | desktop 34 pass; phone half still running at the 40-minute limit (not recorded) | desktop ok, phone UNRUN |

Real regressions: none found. The `<main>` landmark, "EN English" label, 12-hour clock and CSP broke no UI flow that ran.

## Hydration error #418 (not reproduced)
Dev server (:3102, webpack) and the production build (:3101), Chrome headless signed in, /en/sales/invoices and /en/money/treasuries/in-transit: no pageerror, no #418, in en and ar, 390 and 1440 px, time zones UTC/New York/Tokyo and locales ar-EG/de-DE. Only one dev console warning, on in-transit: "Can't perform a React state update on a component that hasn't mounted yet" (a render-time setState; not a mismatch but worth a look in src/things/treasuries.tsx / transfers). Both pages are dynamic (server-rendered per request), all dates are pinned to Africa/Cairo (src/lib/format.ts), so a build-time stale date is ruled out. Likely pass-1 trigger: data or cookie state of that run (not recoverable). Could not decide whether it pre-dates 1.0.7: v1.0.6 not built because there is nothing to compare. Proposal: if it appears again, capture the dev diff with the exact URL and data; meanwhile fix the in-transit render-time setState.

## Not run / not proven
Real camera stream, v1.0.6 comparison, Cairo-midnight behaviour of the date chips.
