"use client";
// Notifications (owner, 2026-11-25, backend #227): the words of each kind, which open lists a live refresh reloads, and the two hooks the shell uses: the live stream
// (Server-Sent Events from /api/notifications/stream) and the unread count. The stream is the fast path; the count is also read every minute, so the bell stays
// right even where a proxy holds the stream back.
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { code6 } from "@/lib/code6";

export type NotificationRow = { id: string; kind: string; values: Record<string, unknown>; link: string | null; createdAt: string; readAt: string | null };
type L = (ar: string, en: string) => string;

/** One notification in words, in the screen's language. A kind this screen does not know yet still says something. */
export function notificationText(L: L, n: Pick<NotificationRow, "kind" | "values">): string {
  const v = n.values ?? {};
  const num = code6(v.number);
  if (n.kind === "price-request.created") {
    const who = String(v.requesterName ?? ""), branch = String(v.branchName ?? "");
    // The type names the request (sale / reservation / handover / delivery); an old one, or one without it, reads as a sale.
    const kind = String(v.kind ?? "sale");
    const ar = kind === "reservation" ? "طلب حجز" : kind === "handover" ? "طلب تسليم" : kind === "delivery" ? "طلب توصيل" : "طلب بيع";
    const en = kind === "reservation" ? "reservation" : kind === "handover" ? "handover" : kind === "delivery" ? "delivery" : "sales";
    return L(`${ar} جديد رقم ${num} من ${who}${branch ? ` (${branch})` : ""}`, `New ${en} request ${num} from ${who}${branch ? ` (${branch})` : ""}`);
  }
  if (n.kind === "price-request.decided") {
    const by = String(v.deciderName ?? "");
    return v.status === "accepted"
      ? L(`تمت الموافقة على طلبك رقم ${num}${by ? ` (${by})` : ""}`, `Your request ${num} was accepted${by ? ` (${by})` : ""}`)
      : L(`تم رفض طلبك رقم ${num}${by ? ` (${by})` : ""}`, `Your request ${num} was rejected${by ? ` (${by})` : ""}`);
  }
  if (n.kind === "price-request.decided-staff") {
    const by = String(v.deciderName ?? ""), who = String(v.requesterName ?? "");
    return v.status === "accepted"
      ? L(`تمت الموافقة على الطلب رقم ${num} من ${who}${by ? ` (بواسطة ${by})` : ""}`, `Request ${num} from ${who} was accepted${by ? ` by ${by}` : ""}`)
      : L(`تم رفض الطلب رقم ${num} من ${who}${by ? ` (بواسطة ${by})` : ""}`, `Request ${num} from ${who} was rejected${by ? ` by ${by}` : ""}`);
  }
  return L("إشعار جديد", "New notification");
}

/** The cached lists a live `refresh` topic reloads (the keys the screens use). An unknown topic reloads nothing. */
export function refreshKeysOf(topic: string): QueryKey[] {
  if (topic === "price-requests") return [["thing", "price-requests"]];
  if (topic === "notifications") return [["notifications"]];
  return [];
}

export const UNREAD_KEY: QueryKey = ["notifications", "unread"];
export const LIST_KEY: QueryKey = ["notifications", "list"];

/** The unread count for the bell. Read every minute too, so it is right even when the live stream is held back by a proxy. */
export function useUnreadNotifications(enabled: boolean): number {
  const q = useQuery({
    queryKey: UNREAD_KEY,
    enabled,
    queryFn: () => api<{ unreadCount: number }>("/notifications", { query: { unread: "true", page: 1 } }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  return q.data?.unreadCount ?? 0;
}

/** The live stream, open while someone is signed in. A new notification reloads the bell and calls `onNotification`; a refresh reloads the open lists of its topic.
 *  The browser reconnects by itself (and resumes after the last notification); if the stream ends for good it is opened again after a pause, up to a minute. */
export function useNotificationStream(userId: string | undefined, onNotification: (n: NotificationRow) => void): void {
  const qc = useQueryClient();
  const latest = useRef(onNotification);
  useEffect(() => { latest.current = onNotification; });
  useEffect(() => {
    if (!userId || typeof window === "undefined" || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let wait = 2_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const open = () => {
      if (stopped) return;
      source = new EventSource("/api/notifications/stream", { withCredentials: true });
      source.addEventListener("open", () => { wait = 2_000; });
      source.addEventListener("notification", (e) => {
        void qc.invalidateQueries({ queryKey: ["notifications"] });
        try { latest.current(JSON.parse((e as MessageEvent).data) as NotificationRow); } catch { /* a frame we cannot read: the bell still reloads */ }
      });
      source.addEventListener("refresh", (e) => {
        try {
          const { topic } = JSON.parse((e as MessageEvent).data) as { topic: string };
          for (const queryKey of refreshKeysOf(topic)) void qc.invalidateQueries({ queryKey });
        } catch { /* ignore a frame we cannot read */ }
      });
      source.addEventListener("error", () => {
        // CONNECTING: the browser retries by itself. CLOSED (a refusal, the session ended): open again later, slower each time.
        if (source && source.readyState === EventSource.CLOSED) {
          source.close();
          timer = setTimeout(open, wait);
          wait = Math.min(wait * 2, 60_000);
        }
      });
    };
    open();
    return () => { stopped = true; clearTimeout(timer); source?.close(); };
  }, [userId, qc]);
}
