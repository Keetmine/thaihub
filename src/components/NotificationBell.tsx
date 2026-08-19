import Link from "next/link";
import { BellIcon } from "@/components/icons";

/** Колокольчик в шапке со счётчиком непрочитанного. Ведёт на ленту
 *  активностей — приглашения в поездки, заявки в друзья, ответы. */
export default function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      prefetch={false}
      className="icon-btn position-relative"
      aria-label={unread > 0 ? `Уведомления: ${unread} новых` : "Уведомления"}
    >
      <BellIcon />
      {unread > 0 && (
        <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>
      )}
    </Link>
  );
}
