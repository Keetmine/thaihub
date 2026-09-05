"use client";

import { ChevronDownIcon, PlaneIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";
import TripBookingLeg, { type BookingLegData } from "./TripBookingLeg";
import type { TripItemVisibilityValue } from "../itemVisibility";

/** Цепочка перелётов одной строкой — несколько схлопнутых сегментов
 *  подряд, между которыми в ленте ничего нет (см. docs/features/trips.md).
 *  Все подписи, как у BookingLegData, приходят готовыми со страницы. */
export type FlightChainData = {
  key: string;
  dayLabel: string;
  monthLabel: string;
  weekdayLabel: string;
  /** «07:40 → 10:00» — первый вылет и последний прилёт. */
  timeLabel: string | null;
  /** Номера рейсов через « · ». */
  names: string;
  /** «Минск → Москва → Хайкоу → Бангкок» без повторов подряд. */
  route: string | null;
  /** «2 пересадки (Москва 5 ч 20 мин, Хайкоу 3 ч 40 мин) · прилёт 5 апр». */
  spanLabel: string | null;
  /** Сегменты — обычные схлопнутые строки перелётов со своими кнопками. */
  legs: BookingLegData[];
};

export default function TripFlightChain({
  tripId,
  chain,
  visibilityOptions,
}: {
  tripId: string;
  chain: FlightChainData;
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const subline = [chain.route, chain.spanLabel].filter(Boolean).join(" · ");

  // Билет, правка и удаление у каждого сегмента свои, и в одну строку
  // они не помещаются — сегменты раскрываются кликом по строке
  // (<details>, как свёртка прошедших дней), внутри — те же
  // TripBookingLeg, что и у одиночного перелёта.
  return (
    <details className="surface booking-leg booking-chain">
      <summary className="d-flex align-items-center gap-3 p-3">
        <div className="event-card-date flex-shrink-0">
          <span className="event-card-day">{chain.dayLabel}</span>
          <span className="event-card-month">{chain.monthLabel}</span>
          <span className="event-card-weekday">{chain.weekdayLabel}</span>
        </div>

        <span className="booking-leg-icon flex-shrink-0" aria-hidden>
          <PlaneIcon />
        </span>

        <div className="flex-fill" style={{ minWidth: 0 }}>
          <div className="d-flex flex-wrap align-items-baseline gap-2">
            {chain.timeLabel && <span className="date-chip event-row-time">{chain.timeLabel}</span>}
            <span className="booking-leg-label">{t.trips.bookings.flightSpan}</span>
            <span className="text-white text-truncate">{chain.names}</span>
          </div>
          {subline && <div className="small text-secondary text-truncate">{subline}</div>}
        </div>

        <span className="booking-chain-toggle flex-shrink-0">
          {t.trips.bookings.segments(chain.legs.length)}
          <ChevronDownIcon />
        </span>
      </summary>

      <div className="booking-chain-segments d-flex flex-column gap-2 px-3 pb-3">
        {chain.legs.map((leg) => (
          <TripBookingLeg key={leg.key} tripId={tripId} leg={leg} visibilityOptions={visibilityOptions} />
        ))}
      </div>
    </details>
  );
}
