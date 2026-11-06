# UI bespoke inventory

Generated 2026-11-06 by `src/lib/ui-scan.ts` (the same scanner the ratchet `src/lib/ui-ratchet.test.ts` uses; baseline `src/lib/ui-baseline.json`). Rules from `docs/specs/ui-conformance-benchmark.md` section 3: **U1** one source of UI (inline `style={{}}`, screen-specific CSS class families), **T1** raw table/button/input/select/textarea tags outside the library, **C1** hard-coded px size or hex colour instead of a token.

Library files exempt (they implement the raw tags): `src/components/ui/*`, `fields/{Field,Select,DatePicker,Popover}`, `engine/ui.tsx`, `shell/copy-button.tsx`.

## Totals

| Rule | Hits | Files |
| --- | ---: | ---: |
| U1 | 131 | 36 |
| T1 | 54 | 16 |
| C1 | 1314 | 15 |

Files with hits: 46. Note: 1154 of the 1314 C1 hits are in `app/globals.css`, which is also the library's own stylesheet (literal sizes and colours not yet moved to tokens); `things/sales-desk.css` holds 109 more. Only 51 C1 hits are in components and screens.

## Replacement map

| Pattern | Library component |
| --- | --- |
| raw table, thead, tbody, tr, th, td | DataTable / Tr / Th / Td |
| raw button | Button / TextButton |
| raw input | Input / Checkbox / DatePicker / FileInput |
| raw select / textarea | Select / Textarea |
| style={{}} | a prop of a library component (size, tone, width) or a token class |
| hard-coded px / #colour | a token (var(--...)) or a library prop |
| screen-prefixed CSS family (e.g. a desk or form look) | a library component variant; delete the family |

## app (routes, global css)

| File | U1 | T1 | C1 | Raw tags found -> replace with |
| --- | ---: | ---: | ---: | --- |
| app/globals.css | 0 | 0 | 1154 |  |
| app/[locale]/sign-in/page.tsx | 2 | 0 | 0 |  |

## engine (shared components)

| File | U1 | T1 | C1 | Raw tags found -> replace with |
| --- | ---: | ---: | ---: | --- |
| components/engine/ThingPage.tsx | 2 | 8 | 0 | 7 x button -> Button / TextButton; 1 x input -> Input / Checkbox / DatePicker / FileInput |
| components/engine/FormView.tsx | 0 | 5 | 0 | 5 x button -> Button / TextButton |
| components/engine/RecordSheet.tsx | 0 | 3 | 0 | 3 x button -> Button / TextButton |

## home (shared components)

| File | U1 | T1 | C1 | Raw tags found -> replace with |
| --- | ---: | ---: | ---: | --- |
| components/home/home-view.tsx | 1 | 2 | 0 | 1 x input -> Input / Checkbox / DatePicker / FileInput; 1 x button -> Button / TextButton |

## jobs (shared components)

| File | U1 | T1 | C1 | Raw tags found -> replace with |
| --- | ---: | ---: | ---: | --- |
| components/jobs/job-bar.tsx | 0 | 4 | 0 | 4 x button -> Button / TextButton |
| components/jobs/jobs-pages.tsx | 0 | 1 | 0 | 1 x input -> Input / Checkbox / DatePicker / FileInput |
| components/jobs/todo.tsx | 0 | 1 | 0 | 1 x button -> Button / TextButton |

## label-qr.tsx (shared components)

| File | U1 | T1 | C1 | Raw tags found -> replace with |
| --- | ---: | ---: | ---: | --- |
| components/label-qr.tsx | 1 | 0 | 2 |  |

## shell (shared components)

| File | U1 | T1 | C1 | Raw tags found -> replace with |
| --- | ---: | ---: | ---: | --- |
| components/shell/shell.tsx | 0 | 11 | 1 | 11 x button -> Button / TextButton |
| components/shell/search-palette.tsx | 0 | 7 | 0 | 2 x input -> Input / Checkbox / DatePicker / FileInput; 5 x button -> Button / TextButton |
| components/shell/change-password.tsx | 2 | 3 | 0 | 1 x input -> Input / Checkbox / DatePicker / FileInput; 2 x button -> Button / TextButton |
| components/shell/session-lock.tsx | 1 | 3 | 0 | 1 x input -> Input / Checkbox / DatePicker / FileInput; 2 x button -> Button / TextButton |
| components/shell/account-view.tsx | 0 | 2 | 0 | 2 x button -> Button / TextButton |

## things (screens)

| File | U1 | T1 | C1 | Raw tags found -> replace with |
| --- | ---: | ---: | ---: | --- |
| things/sales-desk.css | 12 | 0 | 109 | css class families -> library variant |
| things/sales-reprint-form.tsx | 14 | 0 | 7 |  |
| things/purchases-labels.tsx | 12 | 0 | 7 |  |
| things/customer-pieces-form.tsx | 4 | 1 | 18 | 1 x button -> Button / TextButton |
| things/stocktake-count-scan.tsx | 10 | 0 | 2 |  |
| things/admin-shared.tsx | 7 | 1 | 4 | 1 x button -> Button / TextButton |
| things/sales-invoices-form.tsx | 9 | 0 | 2 |  |
| things/gold-purchases-coding.tsx | 6 | 0 | 1 |  |
| things/sales-form-parts.tsx | 5 | 0 | 0 |  |
| things/sales-reservation-form.tsx | 5 | 0 | 0 |  |
| things/stocktake-count-camera.tsx | 4 | 0 | 3 |  |
| things/sales-gift.tsx | 4 | 0 | 0 |  |
| things/cash-movement-form.tsx | 3 | 0 | 2 |  |
| things/payment-block.tsx | 2 | 1 | 0 | 1 x button -> Button / TextButton |
| things/control-security.tsx | 3 | 0 | 0 |  |
| things/gold-purchases-invoice.tsx | 3 | 0 | 0 |  |
| things/sales-returns-form.tsx | 3 | 0 | 0 |  |
| things/stocktake-count-board.tsx | 1 | 1 | 0 | 1 x tr -> DataTable / Tr / Th / Td |
| things/sales-desk-form.tsx | 2 | 0 | 0 |  |
| things/settings.tsx | 2 | 0 | 0 |  |
| things/stocktake-count-start.tsx | 2 | 0 | 0 |  |
| things/expenses.tsx | 1 | 0 | 1 |  |
| things/expense-form.tsx | 1 | 0 | 0 |  |
| things/gold-purchases.tsx | 1 | 0 | 0 |  |
| things/sales-invoices.tsx | 1 | 0 | 0 |  |
| things/sales-piece-story.tsx | 1 | 0 | 0 |  |
| things/sales-reservations.tsx | 1 | 0 | 0 |  |
| things/stocktake-branch.tsx | 1 | 0 | 0 |  |
| things/stocktake-count.tsx | 1 | 0 | 0 |  |
| things/treasury-transfers.tsx | 1 | 0 | 0 |  |
| things/money-shared.tsx | 0 | 0 | 1 |  |

## Not detected by this scan

Template-literal or concatenated tags, class names built at run time, sizes written as rem/em/% or as bare numbers in a style object, component copies that use no raw tag (a local `function Pager()` built from library parts; see `library-ratchet.test.ts` localComponent), colours given as rgb()/hsl()/named, and anything only visible in the rendered DOM (the DOM detectors W/S/L/R/P rules). Library-internal quality (the files exempted above) is not scanned.
