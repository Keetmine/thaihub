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
import MarkAllReadButton from "./MarkAllReadButton";
import { notificationIcon } from "@/lib/notificationIcons";

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
            <MarkAllReadButton label={t.account.notifications.markAllRead(unread)} />
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
        <div className="notif-list surface">
          {items.map((n) => {
            const inner = (
              // Плотная строка без своей плашки (правка владельца
              // 2026-09-17: «они очень большие»): один список с
              // разделителями, те же классы, что у выпадающего блока
              // колокольчика. Иконка, аватар, заголовок, текст одной
              // строкой, дата тихо справа.
              <>
                <span className="notif-row-icon" aria-hidden="true">
                  {notificationIcon(n.kind)}
                </span>
                {n.actor && (
                  <LetterAvatar name={n.actor.name} photoUrl={n.actor.photoUrl} size={1.6} />
                )}
                <span className="notif-row-body">
                  <span className="notif-row-title">{notificationTitle(n, t)}</span>
                  {n.body && <span className="notif-row-text">{n.body}</span>}
                </span>
                <span className="notif-row-date notif-row-date-side">{fmt(n.createdAt)}</span>
              </>
            );
            // Непрочитанная строка идёт через /notifications/go/[id]:
            // тот отметит её прочитанной и передаст дальше по href, так
            // что пометка не требует JS. Прочитанная — прямой ссылкой,
            // без лишнего захода. Непрочитанная БЕЗ href тоже кликабельна:
            // go вернёт обратно в ленту, уже с пометкой; прочитанная без
            // href — просто строка.
            const rowHref = n.readAt ? n.href : `/notifications/go/${n.id}`;
            const cls = `notif-row${n.readAt ? "" : " is-unread"}`;
            return rowHref ? (
              // prefetch выключен: go-страница помечает при РЕНДЕРЕ, и
              // префетч (Link префетчит из вьюпорта) прочитал бы всю
              // ленту без единого клика.
              <AppLink key={n.id} href={rowHref} prefetch={false} className={cls}>
                {inner}
              </AppLink>
            ) : (
              <div key={n.id} className={cls}>
                {inner}
              </div>
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
