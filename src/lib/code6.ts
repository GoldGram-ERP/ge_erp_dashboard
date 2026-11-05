/** A document number as six digits; a missing number is blank, never "00null". */
export const code6 = (n: unknown) => (n === null || n === undefined || n === "" ? "" : String(n).padStart(6, "0"));
