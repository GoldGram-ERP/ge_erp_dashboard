import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dateTimeText, timeText } from "./format";

// The owner's rule (2026-11-04): every time on screen is a 12-hour clock. All times go through timeText/dateTimeText in lib/format.ts.
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []; });

describe("12-hour clock everywhere", () => {
  it("formats the Cairo clock with AM/PM, with and without seconds", () => {
    expect(timeText("2026-11-02T11:51:00Z", "en")).toBe("1:51 PM");
    expect(timeText("2026-11-02T22:07:09Z", "en", true)).toBe("12:07:09 AM");
    expect(timeText(Date.UTC(2026, 10, 2, 15, 5, 0), "ar")).toBe("5:05 م");
    expect(dateTimeText("2026-11-02T11:51:00Z", "en")).toBe("2026-11-02 1:51 PM");
  });
  it("no source file asks for a 24-hour clock", () => {
    const bad = /hourCycle:\s*["']h2[34]["']|hour12:\s*false|toLocaleTimeString|getHours\(|getUTCHours\(|["']HH:mm|\.slice\(11,\s*16\)/;
    const hits = files("src").filter((f) => bad.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
