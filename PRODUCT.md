# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Counter staff and branch staff of a retail gold-jewelry business (Empire of Gold) sell, quote, reserve, buy back and return pieces at the counter, often with a customer in front of them: fast, in Arabic (RTL), on a laptop or a phone. Admins and the Super admin run stock, gold prices, purchases, coding of pieces, treasury and reports. Counter staff and back-office use it all day.

## Product Purpose
A rebuild of the company's retail ERP: one Next.js web app (the dashboard) on a NestJS modular-monolith API with PostgreSQL. Success means the shop sells, stocks and reports exactly and quickly: every price, weight and total is calculated by the system and the same everywhere.

## Positioning
Built for gold retail, which a general ERP could not copy truthfully: exact gold weight and price rules (karats, workmanship and cashback per gram, whole-pound rounding, a small piece charged as one gram, Visa uplift), piece-by-piece stock with QR labels, and one pricing function behind the quote, the WhatsApp text and the invoice. Arabic first, with Egyptian colloquial (masri) copy.

## Operating Context
Sales desk quotes with a live gold price and a WhatsApp message to the customer; sales invoices, reservations, returns and gifts; purchases and coding of pieces; stock count with a live board; treasury, banks and expenses; reports and prints. Several branches and roles (User, Admin, Super admin). Times are a 12-hour clock in the Cairo time zone.

## Capabilities and Constraints
- Money and gold weight use exact decimal types (piastres, milligrams), never floating point.
- Nothing is hard deleted: Delete marks the row; only the Super admin sees deleted rows.
- Every screen exists in Arabic (RTL) and English; the Arabic is Egyptian colloquial, never formal or Saudi.
- Legacy screen codes, addresses and field names never appear in the UI.
- One component library (Animate UI as the main library) and one size scale from global CSS variables; no raw HTML controls.

## Brand Commitments
Arabic-first, RTL and masri voice; the app's own warm cream and gold look; small calm controls from one scale; library components only; exact decimals and no hard deletes; no customer, employee or merchant personal data in the repository.

## Evidence on Hand
The repository's `CLAUDE.md` and the running dashboard (src/things, src/components/ui, src/app/globals.css). No testimonials, benchmarks or customer data exist or may be invented.

## Product Principles
1. The system calculates; people confirm. Nothing is left uncalculated or typed twice.
2. The same number everywhere: quote, WhatsApp text and invoice agree to the piastre.
3. Quiet and fast at the counter: small, aligned controls, one clear action, nothing stretched.
4. Arabic is the primary language, not a translation.
5. A mistake is a mark, not a loss: nothing is hard deleted.
