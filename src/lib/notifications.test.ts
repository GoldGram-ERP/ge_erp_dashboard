import { describe, expect, it } from "vitest";
import { notificationText, refreshKeysOf } from "./notifications";

// Notifications (owner, 2026-11-25, backend #227): the words of each kind, in both languages, and which lists a live refresh reloads.
const ar = (a: string) => a;
const en = (_a: string, e: string) => e;

describe("notificationText", () => {
  const created = { kind: "price-request.created", values: { number: 7, requesterName: "Mona", branchName: "Main", items: 3 } };
  it("a new request names its number, the sender and the branch", () => {
    expect(notificationText(en, created)).toBe("New sales request 000007 from Mona (Main)");
    expect(notificationText(ar, created)).toBe("طلب بيع جديد رقم 000007 من Mona (Main)");
  });
  it("a new request names its type", () => {
    const of = (kind: string) => ({ ...created, values: { ...created.values, kind } });
    expect(notificationText(en, of("reservation"))).toBe("New reservation request 000007 from Mona (Main)");
    expect(notificationText(ar, of("handover"))).toBe("طلب تسليم جديد رقم 000007 من Mona (Main)");
    expect(notificationText(ar, of("delivery"))).toBe("طلب توصيل جديد رقم 000007 من Mona (Main)");
    expect(notificationText(en, of("sale"))).toBe("New sales request 000007 from Mona (Main)");
  });
  it("a decision says accepted or rejected, and by whom", () => {
    expect(notificationText(en, { kind: "price-request.decided", values: { number: 7, status: "accepted", deciderName: "Ali" } })).toBe("Your request 000007 was accepted (Ali)");
    expect(notificationText(en, { kind: "price-request.decided", values: { number: 7, status: "rejected" } })).toBe("Your request 000007 was rejected");
    expect(notificationText(ar, { kind: "price-request.decided", values: { number: 7, status: "rejected", deciderName: "Ali" } })).toBe("تم رفض طلبك رقم 000007 (Ali)");
  });
  it("a decision seen by the other deciders names the requester and who decided", () => {
    const n = { kind: "price-request.decided-staff", values: { number: 7, status: "accepted", deciderName: "Ali", requesterName: "Mona" } };
    expect(notificationText(en, n)).toBe("Request 000007 from Mona was accepted by Ali");
    expect(notificationText(en, { ...n, values: { ...n.values, status: "rejected" } })).toBe("Request 000007 from Mona was rejected by Ali");
    expect(notificationText(ar, n)).toBe("تمت الموافقة على الطلب رقم 000007 من Mona (بواسطة Ali)");
  });
  it("a kind this screen does not know still says something", () => {
    expect(notificationText(en, { kind: "something.new", values: {} })).toBe("New notification");
  });
});

describe("refreshKeysOf", () => {
  it("the price requests topic reloads the requests list; the notifications topic the bell", () => {
    expect(refreshKeysOf("price-requests")).toEqual([["thing", "price-requests"]]);
    expect(refreshKeysOf("notifications")).toEqual([["notifications"]]);
  });
  it("an unknown topic reloads nothing", () => {
    expect(refreshKeysOf("whatever")).toEqual([]);
  });
});
