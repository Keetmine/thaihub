import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { pageMetadata } from "@/lib/seo";
import EmptyState from "@/components/EmptyState";
import LetterAvatar from "@/components/LetterAvatar";
import Pagination from "@/components/Pagination";
import { markAllNotificationsRead } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Уведомления",
  description: "Приглашения в поездки, заявки в друзья и ответы на комментарии.",
  path: "/notifications",
  noIndex: true,
});

const PAGE_SIZE = 30;

const KIND_ICONS: Record<string, string> = {
  TRIP_INVITE: "✈️",
  TRIP_INVITE_ACCEPTED: "✅",
  FRIEND_REQUEST: "👋",
  FRIEND_ACCEPTED: "🤝",
  COMMENT_REPLY: "💬",
  COMMENT_LIKE: "❤️",
  FRIEND_GOING: "👥",
  PREMIUM_GRANTED: "✨",
  ACHIEVEMENT: "🏆",
};

// Лента активностей: приглашения в поездки, заявки в друзья, ответы и
// лайки. До неё всё это проходило молча — узнать можно было, только
// заглянув в нужный раздел (см. docs/features/notifications.md).
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);

  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      include: { actor: { select: { name: true, photoUrl: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notification.count({ where: { userId: user.id } }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <span className="eyebrow">Личное</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Уведомления
        </h1>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button type="submit" className="btn btn-ghost btn-sm">
              Отметить прочитанными ({unread})
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          emoji="🔔"
          title="Пока пусто"
          hint="Здесь появятся приглашения в поездки, заявки в друзья и ответы на ваши комментарии."
          compact
        />
      ) : (
        <div className="d-flex flex-column gap-2">
          {items.map((n) => {
            const inner = (
              <div
                className={`surface d-flex align-items-start gap-3 p-3 ${n.readAt ? "" : "notification-unread"}`}
              >
                <span style={{ fontSize: "1.25rem", lineHeight: 1.2 }} aria-hidden="true">
                  {KIND_ICONS[n.kind] ?? "🔔"}
                </span>
                {n.actor && (
                  <LetterAvatar name={n.actor.name} photoUrl={n.actor.photoUrl} size={2} />
                )}
                <div style={{ minWidth: 0 }} className="flex-grow-1">
                  <span className="text-white d-block">{n.title}</span>
                  {n.body && <span className="small text-secondary d-block">{n.body}</span>}
                  <span className="small text-secondary">{fmt(n.createdAt)}</span>
                </div>
              </div>
            );
            return n.href ? (
              <Link key={n.id} href={n.href} className="text-decoration-none">
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        buildHref={(p) => `/notifications?page=${p}`}
      />
    </div>
  );
}
