"use client";
// The bell's sheet (owner, 2026-11-25, backend #227): the person's notifications, newest first, the unread ones marked. A click marks it read and opens its page;
// "mark all read" clears the count. The list reloads by itself when a live notification arrives (the shell's stream) and every time the sheet opens.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { dateTimeText } from "@/lib/format";
import { LIST_KEY, notificationText, type NotificationRow } from "@/lib/notifications";
import { useT } from "@/lib/t";
import { TextButton } from "@/components/ui/Button";
import { Icon } from "./icon";

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { L } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api<{ items: NotificationRow[]; unreadCount: number }>("/notifications", { query: { page: 1 } }),
    refetchOnMount: "always",
  });
  const items = q.data?.items ?? [];
  const unread = q.data?.unreadCount ?? 0;
  const reload = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const open = async (n: NotificationRow) => {
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
    void reload();
    onClose();
    if (n.link) router.push(n.link);
  };
  const markAll = async () => {
    await api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
    void reload();
  };

  if (q.isPending) return <div className="notif-empty" aria-busy="true"><p>{L("جارٍ التحميل…", "Loading…")}</p></div>;
  if (q.isError) return <div className="notif-empty" role="alert"><p>{L("تعذّر تحميل الإشعارات.", "Could not load the notifications.")}</p></div>;
  if (items.length === 0) {
    return (
      <div className="notif-empty"><span className="notif-ico"><Icon name="bell" size={22} /></span>
        <b>{L("لا توجد إشعارات", "No notifications")}</b><p>{L("هنا هتلاقي اللي محتاج انتباهك، أول ما يحصل.", "What needs your attention shows here as soon as it happens.")}</p></div>
    );
  }
  return (
    <>
      {unread > 0 && <div className="notif-bar"><TextButton id="notif-read-all" onClick={() => void markAll()}>{L("تعليم الكل كمقروء", "Mark all read")}</TextButton></div>}
      <ul className="notif-list">
        {items.map((n) => (
          <li key={n.id} data-unread={n.readAt ? undefined : ""}>
            <TextButton className="notif-item" onClick={() => void open(n)}>
              <span className="notif-text">{notificationText(L, n)}</span>
              <small dir="ltr">{dateTimeText(n.createdAt)}</small>
            </TextButton>
          </li>
        ))}
      </ul>
    </>
  );
}
