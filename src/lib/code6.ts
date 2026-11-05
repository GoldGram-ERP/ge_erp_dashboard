/** A document number as six digits; a missing number is blank, never "00null". */
export const code6 = (n: unknown, blank = "") => (n === null || n === undefined || n === "" ? blank : String(n).padStart(6, "0"));
