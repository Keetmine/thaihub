import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { premiumActiveWhere } from "@/lib/premium";
import { formatShortDate } from "@/lib/dates";
import StatTile from "@/components/StatTile";

export const metadata = { title: "Дашборд" };

export const dynamic = "force-dynamic";

/** Сколько последних записей показывать в списках «недавно добавленные». */
const RECENT_LIMIT = 5;

// Админ-дашборд (Г10): состояние продукта одним экраном — пользователи и
// подписки, объём каталога, свежие регистрации и события.
export default async function AdminStatsPage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    usersTotal,
    premiumActive,
    usersThisWeek,
    withTelegram,
    eventsTotal,
    dramasTotal,
    performersTotal,
    locationsTotal,
    tripsTotal,
    recentUsers,
    recentEvents,
    dramasThisWeek,
    dramasThisMonth,
    performersThisWeek,
    performersThisMonth,
    recentDramas,
    recentPerformers,
    newFeedback,
    openReports,
    failedImports,
    recentErrors,
    dramasWithoutPoster,
    eventsWithoutPerformers,
    stubPerformers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: premiumActiveWhere(now) }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { telegramId: { not: null } } }),
    // Счётчики и списки дашборда — про КАТАЛОГ (см. lib/catalogEvents):
    // «событий 88» должно значить афишу, а не афишу плюс чьи-то
    // домашние посиделки.
    prisma.event.count({ where: catalogEventsWhere() }),
    prisma.drama.count(),
    prisma.performer.count(),
    prisma.location.count(),
    prisma.trip.count(),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.event.findMany({
      where: catalogEventsWhere(),
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { occurrences: { orderBy: { startsAt: "asc" }, take: 1 } },
    }),
    // Пополнение каталога: сериалы и исполнители появляются в основном из
    // импортов и парсеров (MDL, TMDB, вахта новинок), поэтому «что
    // добавилось за неделю/месяц» — быстрый способ увидеть, что они живы,
    // а список последних — проверить, что заехало не мусор.
    prisma.drama.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.drama.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.performer.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.performer.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.drama.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.performer.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, name: true, createdAt: true },
    }),
    // «Требует внимания»: очереди, о которых иначе узнаёшь случайно.
    prisma.feedback.count({ where: { status: "NEW" } }),
    prisma.report.count({ where: { status: "NEW" } }),
    prisma.importRun.count({ where: { status: "FAILED" } }),
    prisma.errorLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
    prisma.drama.count({ where: { posterUrl: null } }),
    // «События без состава» — очередь работы по каталогу: у встречи
    // сообщества состава и не бывает, в очередь ей не надо.
    prisma.event.count({ where: { ...catalogEventsWhere(), performers: { none: {} } } }),
    // Заготовки исполнителей из лайнапов фестивалей — ждут заполнения
    // (docs/features/musicfestival-import.md).
    prisma.performer.count({ where: { stub: true } }),
  ]);

  const attention = [
    { count: newFeedback, label: "новых обращений", href: "/admin/feedback", urgent: true },
    { count: openReports, label: "открытых жалоб", href: "/admin/moderation", urgent: true },
    // Ссылки ведут не в раздел вообще, а сразу к проблемным записям —
    // иначе из «12 сериалов без постера» приходилось искать эти двенадцать
    // руками по всему каталогу.
    { count: failedImports, label: "упавших импортов", href: "/admin/imports?status=FAILED", urgent: true },
    { count: recentErrors, label: "ошибок за сутки", href: "/admin/errors?period=day", urgent: true },
    {
      count: dramasWithoutPoster,
      label: "сериалов без постера",
      href: "/admin/dramas?issue=no-poster",
      urgent: false,
    },
    {
      count: eventsWithoutPerformers,
      label: "событий без состава",
      href: "/admin/events?issue=no-lineup",
      urgent: false,
    },
    {
      count: stubPerformers,
      label: "заготовок исполнителей с фестивалей",
      href: "/admin/performers?stub=1",
      urgent: false,
    },
  ].filter((a) => a.count > 0);

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.25rem" }}>
        Дашборд
      </h1>

      {attention.length > 0 && (
        <>
          <h2 className="section-heading mb-2">Требует внимания</h2>
          <div className="d-flex flex-wrap gap-2 mb-4">
            {attention.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={`attention-card text-decoration-none ${a.urgent ? "is-urgent" : ""}`}
              >
                <span className="attention-count">{a.count}</span>
                <span className="attention-label">{a.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="section-heading mb-2">
        Пользователи
      </h2>
      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatTile value={usersTotal} label="всего" href="/admin/users" />
        <StatTile value={premiumActive} label="с подпиской" href="/admin/users" />
        <StatTile value={usersThisWeek} label="за неделю" />
        <StatTile value={withTelegram} label="с Telegram" />
      </div>

      <h2 className="section-heading mb-2">
        Каталог
      </h2>
      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatTile value={eventsTotal} label="событий" href="/admin/events" />
        <StatTile value={dramasTotal} label="сериалов" href="/admin/dramas" />
        <StatTile value={performersTotal} label="исполнителей" href="/admin/performers" />
        <StatTile value={locationsTotal} label="локаций" href="/admin/locations" />
        <StatTile value={tripsTotal} label="поездок" />
      </div>

      <h2 className="section-heading mb-2">
        Новое в каталоге
      </h2>
      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatTile value={dramasThisWeek} label="сериалов за 7 дней" href="/admin/dramas" />
        <StatTile value={dramasThisMonth} label="сериалов за 30 дней" href="/admin/dramas" />
        <StatTile value={performersThisWeek} label="исполнителей за 7 дней" href="/admin/performers" />
        <StatTile value={performersThisMonth} label="исполнителей за 30 дней" href="/admin/performers" />
      </div>

      <div className="row g-4">
        <div className="col-12 col-md-6">
          <h2 className="section-heading mb-2">
            Новые пользователи
          </h2>
          <div className="d-flex flex-column gap-2">
            {recentUsers.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className="surface surface-hover text-decoration-none d-flex justify-content-between gap-3 p-3"
              >
                <span className="text-truncate text-white">
                  {u.name || u.email || `tg:${u.telegramUsername}`}
                </span>
                <span className="small text-secondary flex-shrink-0">
                  {formatShortDate(u.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div className="col-12 col-md-6">
          <h2 className="section-heading mb-2">
            Недавно добавленные события
          </h2>
          <div className="d-flex flex-column gap-2">
            {recentEvents.map((e) => (
              <Link
                key={e.id}
                href={`/admin/events/${e.id}/edit`}
                className="surface surface-hover text-decoration-none d-flex justify-content-between gap-3 p-3"
              >
                <span className="text-truncate">{e.title}</span>
                <span className="small text-secondary flex-shrink-0">
                  {e.occurrences[0] ? formatShortDate(e.occurrences[0].startsAt) : "—"}
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div className="col-12 col-md-6">
          <h2 className="section-heading mb-2">
            Недавно добавленные сериалы
          </h2>
          <RecentList
            items={recentDramas.map((d) => ({
              id: d.id,
              title: d.title,
              href: `/admin/dramas/${d.id}/edit`,
              createdAt: d.createdAt,
            }))}
          />
        </div>
        <div className="col-12 col-md-6">
          <h2 className="section-heading mb-2">
            Недавно добавленные исполнители
          </h2>
          <RecentList
            items={recentPerformers.map((p) => ({
              id: p.id,
              title: p.name,
              href: `/admin/performers/${p.id}/edit`,
              createdAt: p.createdAt,
            }))}
          />
        </div>
      </div>
    </div>
  );
}

/** Список «недавно добавленные»: название ссылкой на карточку в админке и
 *  дата создания справа — та же строка-surface, что у новых пользователей
 *  и событий выше. Пустой список — фраза, а не пустое место. */
function RecentList({
  items,
}: {
  items: { id: string; title: string; href: string; createdAt: Date }[];
}) {
  if (items.length === 0) {
    return <p className="small text-secondary mb-0">Пока пусто.</p>;
  }
  return (
    <div className="d-flex flex-column gap-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="surface surface-hover text-decoration-none d-flex justify-content-between gap-3 p-3"
        >
          <span className="text-truncate text-white">{item.title}</span>
          <span className="small text-secondary flex-shrink-0">{formatShortDate(item.createdAt)}</span>
        </Link>
      ))}
    </div>
  );
}
