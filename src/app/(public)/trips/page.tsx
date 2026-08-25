import { Fragment } from "react";
import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { formatShortDate } from "@/lib/dates";
import CreateTripButton from "./CreateTripButton";
import { TripInviteActions } from "./TripMembersControls";
import PremiumUpsell from "@/components/PremiumUpsell";
import { isPremiumActive } from "@/lib/premium";
import { getFriendIds } from "@/lib/friends";
import { tripHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref } from "@/lib/i18n";
import { userDisplayName } from "@/lib/userProfile";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.trips.list.metaTitle,
    description: t.trips.list.metaDescription,
    path: "/trips",
    noIndex: true,
  });
}


export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));

  // Поездки целиком — платная функция (см. PremiumUpsell / /admin/users).
  if (!isPremiumActive(user)) {
    return (
      <div>
        <PageHeader
          eyebrow={t.trips.eyebrow}
          title={t.trips.list.title}
          size="lg"
          className="mb-5"
          watermark="Trips"
        />
        <PremiumUpsell feature={t.trips.paywallFeature} />
      </div>
    );
  }

  // Друзья — в мультиселект «С кем едете» формы создания.
  const friendIds = await getFriendIds(user.id);
  const friends = await prisma.user.findMany({
    where: { id: { in: friendIds } },
    select: { id: true, name: true, photoUrl: true, deletedAt: true },
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
        user: { select: { id: true, name: true, deletedAt: true } },
        _count: { select: { members: { where: { status: "ACCEPTED" } } } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.tripMember.findMany({
      where: { userId: user.id, status: "PENDING" },
      include: { trip: { include: { user: { select: { name: true, deletedAt: true } } } } },
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
      <PageHeader eyebrow={t.trips.eyebrow} title={t.trips.list.title} size="lg" className="mb-5" />

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">{t.trips.list.intro}</p>
        {invites.length > 0 && (
          <div className="mb-4 d-flex flex-column gap-2">
            <h2 className="section-heading mb-0">{t.trips.list.invites}</h2>
            {invites.map((inv) => (
              <div
                key={inv.tripId}
                className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0">
                    <AppLink href={tripHref(inv.trip)} className="text-white text-decoration-none">
                      {inv.trip.title}
                    </AppLink>
                  </p>
                  <p className="small text-secondary mb-0">
                    {formatShortDate(inv.trip.startDate, locale)} –{" "}
                    {formatShortDate(inv.trip.endDate, locale)}{" "}
                    {inv.trip.endDate.getFullYear()} ·{" "}
                    {t.trips.list.invitedBy(
                      inv.trip.user.name
                        ? userDisplayName(inv.trip.user, locale)
                        : t.trips.list.someFriend,
                    )}
                  </p>
                </div>
                <TripInviteActions tripId={inv.tripId} />
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <CreateTripButton
            friends={friends.map((f) => ({
              id: f.id,
              // Утилита переведёт подпись удалённого аккаунта на язык
              // зрителя; безымянный живой аккаунт остаётся «без имени».
              name: f.name ? userDisplayName(f, locale) : t.trips.members.noName,
              photoUrl: f.photoUrl,
            }))}
          />
        </div>

        {trips.length === 0 ? (
          <EmptyState
            emoji="✈️"
            title={t.trips.list.emptyTitle}
            hint={t.trips.list.emptyHint}
            compact
          />
        ) : (
          <div className="d-flex flex-column gap-3 stagger">
            {trips.map((trip, i) => {
              const isPast = trip.endDate < now;
              // Будущие отсортированы по startDate, значит первая
              // не-прошедшая — ближайшая: она и есть карточка-герой.
              const shared = trip._count.members > 0 || trip.userId !== user.id;
              const dates = (
                <>
                  {formatShortDate(trip.startDate, locale)}{" "}
                  <span className="trip-dates-arrow">→</span>{" "}
                  {formatShortDate(trip.endDate, locale)}
                  <span className="trip-dates-year">{trip.endDate.getFullYear()}</span>
                </>
              );
              // Прошедшие — приглушённой компактной строкой.
              if (isPast) {
                return (
                  <Fragment key={trip.id}>
                    {trips.findIndex((x) => x.endDate < now) === i && (
                      <h2 className="section-heading mb-0 mt-2">{t.trips.list.pastHeading}</h2>
                    )}
                    <AppLink
                      href={tripHref(trip)}
                      className="trip-card trip-card-past d-flex flex-wrap align-items-center justify-content-between gap-2"
                    >
                      <div style={{ minWidth: 0 }}>
                        <p className="trip-dates mb-0">{dates}</p>
                        <p className="font-display fw-medium text-white small mb-0 text-truncate">
                          {trip.title}
                          {shared && (
                            <span className="text-secondary fw-normal">
                              {t.trips.list.sharedSuffix}
                            </span>
                          )}
                        </p>
                      </div>
                    </AppLink>
                  </Fragment>
                );
              }
              return (
                <AppLink
                  key={trip.id}
                  href={tripHref(trip)}
                  className="trip-card"
                >
                  <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                    {/* Даты крупно, как на билете: «20 авг → 27 авг». */}
                    <p className="trip-dates mb-1">{dates}</p>
                    {shared && <span className="date-chip">{t.trips.list.shared}</span>}
                  </div>
                  <p className="font-display fw-medium text-white mb-0">{trip.title}</p>
                  {trip.userId !== user.id && (
                    <p className="small text-secondary mb-0">
                      {t.trips.list.organiser(
                        trip.user.name
                          ? userDisplayName(trip.user, locale)
                          : t.trips.list.noName,
                      )}
                    </p>
                  )}
                  {trip.visibility !== "PRIVATE" && (
                    <p className="text-secondary mt-2 mb-0" style={{ fontSize: "0.7rem" }}>
                      {t.trips.visibility.options[trip.visibility]}
                    </p>
                  )}
                </AppLink>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
