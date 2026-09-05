"use client";

import { ChevronDownIcon, PlaneIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";
import TripBookingLeg, {
  BookingDateColumn,
  TimeChip,
  type BookingLegData,
  type DateRangeLabels,
} from "./TripBookingLeg";
import type { TripItemVisibilityValue } from "../itemVisibility";

/** Цепочка перелётов одной строкой — несколько схлопнутых сегментов
 *  подряд, между которыми в ленте ничего нет (см. docs/features/trips.md).
 *  Все подписи, как у BookingLegData, приходят готовыми со страницы. */
export type FlightChainData = {
  key: string;
  dayLabel: string;
  monthLabel: string;
  weekdayLabel: string;
  /** Диапазон для дата-колонки, если цепочка не уложилась в день. */
  dateRange: DateRangeLabels | null;
  /** «07:40 → 10:00» — первый вылет и последний прилёт. */
  timeLabel: string | null;
  /** Дата последнего прилёта для чипа, если не в день первого вылета. */
  arrivalDateLabel: string | null;
  /** Номера рейсов через « · ». */
  names: string;
  /** «Минск → Москва (пересадка 5 ч 20 мин) → Хайкоу (пересадка 3 ч
   *  40 мин) → Бангкок» — без повторов подряд, пересадки прямо в пути. */
  route: string | null;
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
  const subline = chain.route;

  // Билет, правка и удаление у каждого сегмента свои, и в одну строку
  // они не помещаются — сегменты раскрываются кликом по строке
  // (<details>, как свёртка прошедших дней), внутри — те же
  // TripBookingLeg, что и у одиночного перелёта.
  return (
    <details className="surface booking-leg booking-chain">
      <summary className="d-flex align-items-center gap-3 p-3">
        <BookingDateColumn
          dayLabel={chain.dayLabel}
          monthLabel={chain.monthLabel}
          weekdayLabel={chain.weekdayLabel}
          dateRange={chain.dateRange}
        />

        <span className="booking-leg-icon flex-shrink-0" aria-hidden>
          <PlaneIcon />
        </span>

        <div className="flex-fill" style={{ minWidth: 0 }}>
          <div className="d-flex flex-wrap align-items-baseline gap-2">
            <TimeChip timeLabel={chain.timeLabel} arrivalDateLabel={chain.arrivalDateLabel} />
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
