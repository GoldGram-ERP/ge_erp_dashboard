import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

// The backend repository beside this one, under either folder name; its lists are compared when it is there.
const backend = ["backend", "ge_erp_backend"].map((name) => join(__dirname, "../../..", name, "src/modules")).find((path) => existsSync(path));
const SAFE = ["deposit", "withdraw", "expense", "expenseRefund", "salesInvoice", "reservation", "salesReturn", "transferOut", "transferIn", "returnedPiecePurchase", "merchantPayment", "merchantReceipt"];
const BANK = ["deposit", "withdraw", "transferIn", "transferOut", "expense", "expenseRefund", "salesInvoice", "reservation", "salesReturn", "returnedPiecePurchase", "merchantPayment", "merchantReceipt"];
const TREASURY = [...SAFE, "goldIn", "goldOut", "transferReturned"];

describe("the names of the statement kinds", () => {
  it("are in both languages for every kind of the three statements", () => {
    for (const m of [ar, en] as any[]) {
      for (const [names, kinds] of [[m["treasury-reports"].lineKinds, TREASURY], [m["cash-accounts"].safeStatement.types, SAFE], [m["bank-movements"].bankStatement.types, BANK]] as const) {
        expect(kinds.filter((kind) => !names[kind])).toEqual([]);
      }
    }
  });
  it.skipIf(!backend)("cover every kind the backend lists", () => {
    const listOf = (file: string, name: string) => [...new RegExp(`${name} = \\[([^\\]]*)\\]`).exec(readFileSync(join(backend!, file), "utf8"))![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(listOf("cash-accounts/cash-movements/application/read-safe-lines.ts", "SAFE_LINE_TYPES").sort()).toEqual([...SAFE].sort());
    expect(listOf("bank-movements/bank-movements/application/read-bank-lines.ts", "BANK_LINE_TYPES").sort()).toEqual([...BANK].sort());
    const treasury = /class [\s\S]*?enum: \[('deposit'[^\]]*)\] \}\) kind!/.exec(readFileSync(join(backend!, "cash-accounts/treasury-reports/treasury-reports.controller.ts"), "utf8"))![1];
    expect([...treasury.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()).toEqual([...TREASURY].sort());
  });
});
