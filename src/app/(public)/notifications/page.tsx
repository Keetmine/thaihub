import AppLink from "@/components/AppLink";
import { notificationTitle } from "@/lib/notificationText";
import PageHeader from "@/components/PageHeader";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { pageMetadata } from "@/lib/seo";
import EmptyState from "@/components/EmptyState";
import LetterAvatar from "@/components/LetterAvatar";
import Pagination from "@/components/Pagination";
import { formatShortDate, formatTime } from "@/lib/dates";
import { getT, localeHref } from "@/lib/i18n";
import { markAllNotificationsRead } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.account.notifications.metaTitle,
    description: t.account.notifications.metaDescription,
    path: "/notifications",
    noIndex: true,
    locale,
  });
}

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
  PERFORMER_BIRTHDAY: "🎂",
  EPISODE_AIRED: "📺",
};

// Лента активностей: приглашения в поездки, заявки в друзья, ответы и
// лайки. До неё всё это проходило молча — узнать можно было, только
// заглянув в нужный раздел (см. docs/features/notifications.md).
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
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

  // Дата + время — теми же форматтерами, что и всюду на сайте.
  const fmt = (d: Date) => `${formatShortDate(d, locale)}, ${formatTime(d)}`;

  return (
    <div>
      <PageHeader
        eyebrow={t.account.notifications.eyebrow}
        title={t.account.notifications.title}
        className="mb-4"
        action={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="btn btn-ghost btn-sm">
                {t.account.notifications.markAllRead(unread)}
              </button>
            </form>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          emoji="🔔"
          title={t.account.notifications.emptyTitle}
          hint={t.account.notifications.emptyHint}
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
                  <span className="text-white d-block">{notificationTitle(n, t)}</span>
                  {n.body && <span className="small text-secondary d-block">{n.body}</span>}
                  <span className="small text-secondary">{fmt(n.createdAt)}</span>
                </div>
              </div>
            );
            return n.href ? (
              <AppLink key={n.id} href={n.href} className="text-decoration-none">
                {inner}
              </AppLink>
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
