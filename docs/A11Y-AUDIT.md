# Accessibility audit (WCAG 2.2 AA), 2026-11-04

Scope: the GoldGram dashboard, local dev server (port 3102), Arabic RTL and English LTR. No production calls.
Time box: 30 minutes. This is a first pass, not a sign-off.

## Method

1. Code read of the shell, fields (Select, DatePicker, Popover), search palette, session lock, engine tables (impeccable `audit` flow, code level).
2. axe-core 4.x (tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) injected into each screen, in ar and en. First as a throwaway scan to find findings, then as the e2e file `e2e-tests/tests/a11y.e2e.ts` (tag `a11y`; fails on serious and critical; the allow-list is empty).
3. Scripted manual checks with Playwright (reflow at 320 px, 24x24 target size, Tab walk for focus-obscured, reduced motion, 140% text and text spacing) were started but the shared dev server timed out under load (see "Not done").
4. Run: `cd e2e-tests && E2E_PORT=3102 npx e2e run tests/a11y.e2e.ts --target desktop`.

Screens (each in ar and en): sign-in, Home, list with filters (/setup/users), record sheet, create invoice, create return, account (settings), Ctrl K search sheet, collapsed sidebar, mobile drawer (390), select popover, date-picker popover, jobs home, e2euser Home. Plus tests for per-route titles, html lang/dir, landmarks, one h1, and Esc closing the search sheet.

## Findings (before the fixes: 7 distinct problems; 2 critical, 5 serious)

| # | Criterion | Severity | Where | Fixed? | Test |
|---|-----------|----------|-------|--------|------|
| 1 | 1.4.3 contrast (muted text #766c55 on sand 4.44:1; version label with opacity 3.09:1) | serious | `--mute`, `.ver`, `.hint`, user role label | yes: `--mute` darkened to #6b6149, opacity removed from `.ver` | axe: every screen |
| 2 | 4.1.2 name (select trigger without a name when the form wrote a plain `<label for>`) | critical | `#branchId-btn` on invoice and return forms | yes: `useLabelFallback` in Select, used by Select and DatePicker | axe: create-invoice, create-return, select-popover |
| 3 | 2.5.3 label in name (Ctrl K button, language short button, date trigger whose name hid its value) | serious | `.kbd-btn`, `.short`, `#f-date-btn` | yes: visible text now inside the accessible name | axe: home, sidebar-collapsed, create-return |
| 4 | 4.1.2 / 1.3.1 date picker used role=grid without rows and aria-selected on buttons | critical | `.dp-grid`, `.dp-day` | yes: role=group, aria-pressed, name "<day> <iso>"; out-of-month days use `--mute` | axe: date-picker-popover |
| 5 | 4.1.2 loading skeleton had aria-label on a generic div | serious | `Skeleton` in engine/ui.tsx | yes: role=status | axe: list-with-filters |
| 6 | 2.4.2 page title was "GoldGram" on every route | serious (axe passes it, the criterion does not) | all routes | yes: title from the page h1 ("Users - GoldGram"), sign-in titled too | `every route has its own title` |
| 7 | 1.3.1 / 2.4.1 no `main` landmark; the whole workspace was `aria-live=polite`, so every change was announced | serious | `#ws` in shell.tsx | yes: `<main id="ws">`, live region removed (toasts and `#status` keep their own) | `html lang and dir, landmarks, one h1` |

Already good (no finding): html lang and dir per locale, accessible names on icon buttons, `role=alert` on field errors and lock dialog, `aria-pressed` on pins, `aria-expanded` on groups, Esc closes the search sheet, combobox/listbox roles on Select and search.

## Run results (quoted)

- Before any fix (first scan, 12 screen states x 2 languages): serious/critical hits on 11 of 12 screens (contrast, button-name, label-content-name-mismatch, aria-prohibited-attr).
- e2e run 3 (after most fixes): `Tests  10 failed | 24 passed (34)`, `Duration  339.66s`. The 10 reds were not violations: the dev server answered with an empty document (axe reported only `document-title` / `html-has-lang` on an `<html>` with no lang) or an element was not found yet. The test now reloads up to 3 times until `<html lang>` exists.
- e2e run 4 (with the reload guard): see the line appended at the end of this file.

Note on e2ev: dev-server runs give false reds on this laptop (measured earlier the same day). The last run should be made on one shared build with `next start` before the owner relies on it.

## Manual keyboard checks (no screen reader available)

Done by reading code and the axe/e2e checks: Esc closes the search sheet and focus does not stay on the dialog; Select supports arrows, Home/End, type-ahead, Esc, Tab; DatePicker has roving tabindex on days.
No NVDA or any screen reader was available. Not tested with a person. The owner's team must walk the app keyboard-only (RTL Tab order, focus return after dialogs and sheets, focus not hidden under the sticky bottom action bar) and with NVDA in Arabic and English.

## Not done in the time box

- 2.4.11 focus not obscured by the sticky bottom action bar and sticky headers: scripted Tab walk written but not completed.
- 1.4.10 reflow at 320 px: /setup/users measured no horizontal overflow (scrollWidth 320 = clientWidth 320); the other screens were not measured. 400% zoom and 140% text size not completed.
- 2.5.8 target size (24x24): not measured; `.ic-btn` is 32x32, date days 34 px high.
- 1.4.11 non-text contrast and focus indicator 3:1 (axe checks only some), the green/red status pill (it also has text), placeholder and disabled contrast (disabled is exempt).
- Toasts live region (`toaster.tsx`), confirm dialog focus return, session-lock dialog: only the lock dialog source was read (has aria-labelledby, role=alert). Not driven by a test.
- 2.5.7 dragging alternatives, 3.2.6 consistent help, 3.3.7 redundant entry: not reviewed.
- Tables: axe found no `th` scope issue; not manually checked.
- Mixed-language spans (`lang` on English words inside Arabic text): not reviewed (3.1.2 AA).

## Remaining (moderate/minor, from axe and reading)

- Moderate/minor axe rules were not listed in the failing output (the test reports serious/critical only). Run axe with `impact` filter off once to list them.
- The headings of the shell: Home has the greeting as h1; list pages have one h1 (test asserts exactly one on /setup/users).

## impeccable audit score (code level, partial)

| Dimension | Score | Note |
|-----------|-------|------|
| Accessibility | 3/4 | AA findings above fixed; keyboard/SR walk-through and 2.4.11 not verified |
| Performance | not scored | out of scope |
| Responsive | 3/4 | 320 px no overflow on one list page; others unmeasured |
| Theming | 3/4 | tokens used (`--mute`, `--ink`); a few hard-coded sand values (#f3efe3, #fbf9f2) |
| Implementation integrity | not scored | detector not run |

Score covers accessibility-relevant dimensions only, so no total out of 20.

## Final run

`Tests  3 failed | 31 passed (34)`, `Duration  309.03s (5m 9s)`. All 28 axe screen scans (14 screens x ar/en) pass with zero serious/critical violations. The 3 reds are the non-axe checks hitting the same dev-server flake (empty `<html lang>`, route title not yet set, search sheet not open in time); they need a rerun on a production build (`next start`) before they can be called green or red.
