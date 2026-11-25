// The one phone rule and the one National ID rule of the dashboard (backend issue #222), the same as the
// API's src/platform/validation/phone.ts. Every phone box uses these: the sales forms (buyer and gift
// recipient), the Sales desk, reservations, customer orders, customer pieces, merchants and Settings.
// A search box is not a phone box: a filter stays a partial match.
import { latinNumber } from "./format";

/** An Egyptian mobile number: 11 digits, starting 010, 011, 012 or 015. */
export const PHONE_LENGTH = 11;
export const PHONE_PATTERN = /^01[0125]\d{8}$/;
/** The Egyptian National ID: optional, and when typed exactly 14 digits. */
export const NATIONAL_ID_LENGTH = 14;
export const NATIONAL_ID_PATTERN = /^\d{14}$/;

/** Trimmed, Arabic-Indic and Persian digits read as Latin: what is checked and what is sent. */
export const phoneDigits = (typed: unknown): string => latinNumber(typed);

/** Whether a typed phone keeps the rule (Arabic digits accepted). An empty box is not a phone. */
export const isPhone = (typed: unknown): boolean => PHONE_PATTERN.test(phoneDigits(typed));
/** Whether a typed National ID keeps the rule. An empty box is not one either: the caller lets it through, as it is optional. */
export const isNationalId = (typed: unknown): boolean => NATIONAL_ID_PATTERN.test(phoneDigits(typed));
