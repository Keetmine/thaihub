import AppLink from "@/components/AppLink";
import type { TripVisibility } from "@/generated/prisma/client";
import { formatShortDate } from "@/lib/dates";
import type { Dict, Locale } from "@/lib/i18n";
import { tripHref } from "@/lib/slugHelpers";
import { userDisplayName } from "@/lib/userProfile";

/**
 * Карточка поездки в списке — билетная `.trip-card` (Э2ф в globals.css).
 *
 * Разметка вынесена сюда, потому что мест, где поездка показывается
 * строкой, стало два: свой кабинет `/trips` и вкладка «Поездки» в
 * сообществе (АА25). Вторая копия тех же классов разъехалась бы с
 * первой, и разъехалась бы молча — как это уже случалось с блоками,
 * которые «просто скопировали».
 *
 * Компонент ничего не решает про доступ: он рисует то, что ему дали.
 * Кто какую поездку ВИДИТ — вопрос выборки у вызывающего (в сообществе
 * это `TripsTab`), и решаться он должен в запросе, а не в разметке.
 */
export type TripCardData = {
  id: string;
  slug: string | null;
  title: string;
  startDate: Date;
  endDate: Date;
  visibility: TripVisibility;
  userId: string;
  user: { name: string | null; username?: string | null; deletedAt: Date | null };
  /** Принявших приглашение участников: по ним поездка и «совместная». */
  acceptedMembers: number;
};

export default function TripCard({
  trip,
  viewerId,
  isPast,
  locale,
  t,
}: {
  trip: TripCardData;
  viewerId: string | null;
  /** Считает вызывающий: у него своё «сейчас» и свой порядок списка. */
  isPast: boolean;
  locale: Locale;
  t: Dict;
}) {
  const shared = trip.acceptedMembers > 0 || trip.userId !== viewerId;
  const dates = (
    <>
      {formatShortDate(trip.startDate, locale)} <span className="trip-dates-arrow">→</span>{" "}
      {formatShortDate(trip.endDate, locale)}
      <span className="trip-dates-year">{trip.endDate.getFullYear()}</span>
    </>
  );

  // Прошедшие — приглушённой компактной строкой.
  if (isPast) {
    return (
      <AppLink
        href={tripHref(trip)}
        className="trip-card trip-card-past d-flex flex-wrap align-items-center justify-content-between gap-2"
      >
        <div style={{ minWidth: 0 }}>
          <p className="trip-dates mb-0">{dates}</p>
          <p className="font-display fw-medium text-white small mb-0 text-truncate">
            {trip.title}
            {shared && (
              <span className="text-secondary fw-normal">{t.trips.list.sharedSuffix}</span>
            )}
          </p>
        </div>
      </AppLink>
    );
  }

  return (
    <AppLink href={tripHref(trip)} className="trip-card">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
        {/* Даты крупно, как на билете: «20 авг → 27 авг». */}
        <p className="trip-dates mb-1">{dates}</p>
        {shared && <span className="date-chip">{t.trips.list.shared}</span>}
      </div>
      <p className="font-display fw-medium text-white mb-0">{trip.title}</p>
      {trip.userId !== viewerId && (
        <p className="small text-secondary mb-0">
          {t.trips.list.organiser(
            trip.user.name ? userDisplayName(trip.user, locale) : t.trips.list.noName,
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
}
