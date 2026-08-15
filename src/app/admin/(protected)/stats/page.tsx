import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

function StatCard({ value, label, href }: { value: number; label: string; href?: string }) {
  const inner = (
    <>
      <span className="font-display fw-bold d-block" style={{ fontSize: "1.6rem" }}>
        {value}
      </span>
      <span className="small text-secondary">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="surface surface-hover text-decoration-none text-reset text-center p-3 flex-fill">
      {inner}
    </Link>
  ) : (
    <div className="surface text-center p-3 flex-fill">{inner}</div>
  );
}

// Админ-дашборд (Г10): состояние продукта одним экраном — пользователи и
// подписки, объём каталога, свежие регистрации и события.
export default async function AdminStatsPage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { premiumUntil: { gt: now } } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { telegramId: { not: null } } }),
    prisma.event.count(),
    prisma.drama.count(),
    prisma.performer.count(),
    prisma.location.count(),
    prisma.trip.count(),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { occurrences: { orderBy: { startsAt: "asc" }, take: 1 } },
    }),
  ]);

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.25rem" }}>
        Дашборд
      </h1>

      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        Пользователи
      </h2>
      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatCard value={usersTotal} label="всего" href="/admin/users" />
        <StatCard value={premiumActive} label="с подпиской" href="/admin/users" />
        <StatCard value={usersThisWeek} label="за неделю" />
        <StatCard value={withTelegram} label="с Telegram" />
      </div>

      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        Каталог
      </h2>
      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatCard value={eventsTotal} label="событий" href="/admin" />
        <StatCard value={dramasTotal} label="сериалов" href="/admin/dramas" />
        <StatCard value={performersTotal} label="исполнителей" href="/admin/performers" />
        <StatCard value={locationsTotal} label="локаций" href="/admin/locations" />
        <StatCard value={tripsTotal} label="поездок" />
      </div>

      <div className="row g-4">
        <div className="col-12 col-md-6">
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Новые пользователи
          </h2>
          <div className="d-flex flex-column gap-2">
            {recentUsers.map((u) => (
              <div key={u.id} className="surface d-flex justify-content-between gap-3 p-3">
                <span className="text-truncate">{u.name || u.email || `tg:${u.telegramUsername}`}</span>
                <span className="small text-secondary flex-shrink-0">
                  {formatShortDate(u.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-12 col-md-6">
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
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
      </div>
    </div>
  );
}
