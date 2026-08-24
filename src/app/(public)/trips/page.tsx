import { Fragment } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { formatShortDate } from "@/lib/dates";
import CreateTripButton from "./CreateTripButton";
import { TripInviteActions } from "./TripMembersControls";
import PremiumUpsell from "@/components/PremiumUpsell";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";
import { isPremiumActive } from "@/lib/premium";
import { getFriendIds } from "@/lib/friends";
import { tripHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Поездки",
  description: "Ваши поездки и совместные планы.",
  path: "/trips",
  noIndex: true,
});


export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Поездки целиком — платная функция (см. PremiumUpsell / /admin/users).
  if (!isPremiumActive(user)) {
    return (
      <div>
        <PageHeader eyebrow="Планирование" title="Мои поездки" size="lg" className="mb-5" watermark="Trips" />
        <PremiumUpsell feature="Поездки" />
      </div>
    );
  }

  // Друзья — в мультиселект «С кем едете» формы создания.
  const friendIds = await getFriendIds(user.id);
  const friends = await prisma.user.findMany({
    where: { id: { in: friendIds } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { name: "asc" },
  });

  // Свои поездки + совместные, где я принял приглашение; отдельным
  // блоком — ещё не отвеченные приглашения.
  const [tripsRaw, invites] = await Promise.all([
    prisma.trip.findMany({
      where: {
        OR: [
          { userId: user.id },
          { members: { some: { userId: user.id, status: "ACCEPTED" } } },
        ],
      },
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { members: { where: { status: "ACCEPTED" } } } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.tripMember.findMany({
      where: { userId: user.id, status: "PENDING" },
      include: { trip: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  // Будущие и текущие — сверху (ближайшая первой), прошедшие — внизу
  // (свежие из прошедших выше).
  const todayRef = new Date();
  const trips = [
    ...tripsRaw.filter((t) => t.endDate >= todayRef),
    ...tripsRaw.filter((t) => t.endDate < todayRef).reverse(),
  ];

  // Счётчик «N в плане · M всего» убран по просьбе владельца: он
  // сравнивал план со всей афишей этих дат и читался как «недобрал».
  // Вместе с ним ушли три запроса, которые считались только ради него
  // (occurrences + members + attendances).

  const now = new Date();

  return (
    <div>
      <PageHeader eyebrow="Планирование" title="Мои поездки" size="lg" className="mb-5" />

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">
          Поездка — это даты, когда вы в Таиланде: на её странице собраны все
          события, попадающие в этот период.
        </p>
        {invites.length > 0 && (
          <div className="mb-4 d-flex flex-column gap-2">
            <h2 className="section-heading mb-0">Приглашения</h2>
            {invites.map((inv) => (
              <div
                key={inv.tripId}
                className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0">
                    <Link href={tripHref(inv.trip)} className="text-white text-decoration-none">
                      {inv.trip.title}
                    </Link>
                  </p>
                  <p className="small text-secondary mb-0">
                    {formatShortDate(inv.trip.startDate)} – {formatShortDate(inv.trip.endDate)}{" "}
                    {inv.trip.endDate.getFullYear()} · приглашает {inv.trip.user.name ?? "друг"}
                  </p>
                </div>
                <TripInviteActions tripId={inv.tripId} />
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <CreateTripButton
            friends={friends.map((f) => ({ id: f.id, name: f.name ?? "Без имени", photoUrl: f.photoUrl }))}
          />
        </div>

        {trips.length === 0 ? (
          <EmptyState
            emoji="✈️"
            title="Пока нет ни одной поездки"
            hint="Создайте поездку с датами — события, отели и списки мест соберутся в один план."
            compact
          />
        ) : (
          <div className="d-flex flex-column gap-3 stagger">
            {trips.map((t, i) => {
              const isPast = t.endDate < now;
              // Будущие отсортированы по startDate, значит первая
              // не-прошедшая — ближайшая: она и есть карточка-герой.
              const shared = t._count.members > 0 || t.userId !== user.id;
              const dates = (
                <>
                  {formatShortDate(t.startDate)} <span className="trip-dates-arrow">→</span>{" "}
                  {formatShortDate(t.endDate)}
                  <span className="trip-dates-year">{t.endDate.getFullYear()}</span>
                </>
              );
              // Прошедшие — приглушённой компактной строкой.
              if (isPast) {
                return (
                  <Fragment key={t.id}>
                    {trips.findIndex((x) => x.endDate < now) === i && (
                      <h2 className="section-heading mb-0 mt-2">Прошедшие</h2>
                    )}
                    <Link
                      href={tripHref(t)}
                      className="trip-card trip-card-past d-flex flex-wrap align-items-center justify-content-between gap-2"
                    >
                      <div style={{ minWidth: 0 }}>
                        <p className="trip-dates mb-0">{dates}</p>
                        <p className="font-display fw-medium text-white small mb-0 text-truncate">
                          {t.title}
                          {shared && (
                            <span className="text-secondary fw-normal"> · совместная</span>
                          )}
                        </p>
                      </div>
                    </Link>
                  </Fragment>
                );
              }
              return (
                <Link
                  key={t.id}
                  href={tripHref(t)}
                  className="trip-card"
                >
                  <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                    {/* Даты крупно, как на билете: «20 авг → 27 авг». */}
                    <p className="trip-dates mb-1">{dates}</p>
                    {shared && <span className="date-chip">совместная</span>}
                  </div>
                  <p className="font-display fw-medium text-white mb-0">{t.title}</p>
                  {t.userId !== user.id && (
                    <p className="small text-secondary mb-0">
                      Организатор: {t.user.name ?? "без имени"}
                    </p>
                  )}
                  {t.visibility !== "PRIVATE" && (
                    <p className="text-secondary mt-2 mb-0" style={{ fontSize: "0.7rem" }}>
                      {VISIBILITY_LABELS[t.visibility]}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
