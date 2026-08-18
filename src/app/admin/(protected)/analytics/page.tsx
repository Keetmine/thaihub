import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { performerHref, eventHref } from "@/lib/slugHelpers";

export const dynamic = "force-dynamic";

// Аналитика продукта: регистрации по дням (30 дней, CSS-бары без
// чарт-библиотек), конверсия в премиум, топы по избранному и «иду».
export default async function AdminAnalyticsPage() {
  await requireAdminPage();
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  from.setHours(0, 0, 0, 0);

  const [users, premiumActive, usersTotal, topEvents, topPerformers, payments] =
    await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: from } },
        select: { createdAt: true },
      }),
      prisma.user.count({ where: { premiumUntil: { gt: now } } }),
      prisma.user.count(),
      prisma.event.findMany({
        include: {
          _count: { select: { favoritedBy: true, attendees: true } },
        },
        orderBy: [{ favoritedBy: { _count: "desc" } }],
        take: 10,
      }),
      prisma.performer.findMany({
        where: { favoritedBy: { some: {} } },
        include: { _count: { select: { favoritedBy: true } } },
        orderBy: { favoritedBy: { _count: "desc" } },
        take: 10,
      }),
      prisma.payment.count(),
    ]);

  // регистрации по дням
  const days: { key: string; label: string; count: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    days.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
      count: 0,
    });
  }
  const byDay = new Map(days.map((d) => [d.key, d]));
  for (const u of users) {
    const key = u.createdAt.toISOString().slice(0, 10);
    const day = byDay.get(key);
    if (day) day.count += 1;
  }
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  const conversion = usersTotal > 0 ? Math.round((premiumActive / usersTotal) * 100) : 0;

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Аналитика
      </h1>

      <h2 className="section-heading mb-2">Регистрации за 30 дней ({users.length})</h2>
      <div className="surface p-3 mb-2">
        <div className="d-flex align-items-end gap-1" style={{ height: "8rem" }}>
          {days.map((d) => (
            <div
              key={d.key}
              className="flex-fill"
              title={`${d.label}: ${d.count}`}
              style={{
                height: `${Math.max(3, (d.count / maxCount) * 100)}%`,
                background:
                  d.count > 0 ? "var(--bs-primary)" : "rgba(255, 255, 255, 0.07)",
                borderRadius: "3px 3px 0 0",
                minWidth: 0,
              }}
            />
          ))}
        </div>
        <div className="d-flex justify-content-between small text-secondary mt-1">
          <span>{days[0].label}</span>
          <span>{days[days.length - 1].label}</span>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-3 mb-4 small text-secondary">
        <span>Всего пользователей: <b className="text-white">{usersTotal}</b></span>
        <span>С подпиской: <b className="text-white">{premiumActive}</b></span>
        <span>Конверсия в премиум: <b className="text-white">{conversion}%</b></span>
        <span>Оплат всего: <b className="text-white">{payments}</b></span>
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Топ событий (избранное + «иду»)</h2>
          <div className="d-flex flex-column gap-2">
            {topEvents.map((e, i) => (
              <div key={e.id} className="surface d-flex justify-content-between gap-3 p-3">
                <Link href={eventHref(e)} className="link-body-emphasis text-truncate">
                  {i + 1}. {e.title}
                </Link>
                <span className="small text-secondary flex-shrink-0">
                  ♥ {e._count.favoritedBy} · идут {e._count.attendees}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Топ артистов (по избранному)</h2>
          <div className="d-flex flex-column gap-2">
            {topPerformers.map((p, i) => (
              <div key={p.id} className="surface d-flex justify-content-between gap-3 p-3">
                <Link href={performerHref(p)} className="link-body-emphasis text-truncate">
                  {i + 1}. {p.name}
                </Link>
                <span className="small text-secondary flex-shrink-0">♥ {p._count.favoritedBy}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
