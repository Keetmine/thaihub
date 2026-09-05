"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import { BuildingIcon, PlaneIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { deleteTripBooking } from "../actions";
import { useT } from "@/components/LocaleProvider";
import BookingForm, { type TripBookingRow } from "./BookingForm";
import { ItemVisibilityBadge } from "../TripItemVisibility";
import type { TripItemVisibilityValue } from "../itemVisibility";

/** Одна сторона брони в ленте плана: заселение ИЛИ выселение, вылет ИЛИ
 *  прилёт — либо обе сразу (`side: "both"`), когда между ними в ленте
 *  ничего нет и страница схлопнула их в одну строку. Подписи даты
 *  приходят готовыми со страницы — даты проекта считаются в UTC (см.
 *  lib/dates.ts), и локальные геттеры в браузере зрителя дали бы другой
 *  день. */
export type BookingLegData = {
  key: string;
  bookingId: string;
  kind: "HOTEL" | "FLIGHT";
  /** "both" — схлопнутая строка: дата-колонка показывает начало, чип
   *  времени — «10:20 → 21:40», вторая дата живёт в spanLabel. */
  side: "start" | "end" | "both";
  /** Номер цвета линии стоянки в палитре --stay-line-1..N — тем же
   *  цветом красится иконка, чтобы линия читалась принадлежащей своим
   *  карточкам заезда/выезда. null — линии у брони нет (перелёт или не
   *  обе даты), иконка остаётся акцентной. */
  stayColor: number | null;
  dayLabel: string;
  monthLabel: string;
  weekdayLabel: string;
  /** Строка на несколько дней (схлопнутый перелёт через ночь, отель
   *  одной строкой): дата-колонка показывает диапазон вместо дня начала.
   *  null — один день, колонка обычная. */
  dateRange: DateRangeLabels | null;
  /** null — время не указано (в базе ровно 00:00). У схлопнутой строки —
   *  оба времени через стрелку («10:20 → 21:40», «14:00 →», «→ 12:00»). */
  timeLabel: string | null;
  /** Схлопнутый перелёт, севший не в день вылета: дата прилёта для
   *  чипа — «19:20 → 13:45, 20 апр». null — тот же день; у отелей всегда
   *  null (у них диапазон дат и ночи в подписи). */
  arrivalDateLabel: string | null;
  name: string;
  /** Адрес отеля или маршрут перелёта «Москва → Бангкок». */
  place: string | null;
  /** «до 5 сен · 6 ночей» у заезда, «с 29 авг» у выезда; у схлопнутой
   *  строки — «12–15 мар · 3 ночи» у отеля и «прилёт 11 мар» у перелёта
   *  через ночь (в один день — ничего). */
  spanLabel: string | null;
  note: string | null;
  url: string | null;
  fileUrl: string | null;
  canEdit: boolean;
  /** Значения для формы правки — она правит бронь целиком, обе даты. */
  booking: TripBookingRow;
};

/** Чип времени строки брони. У перелёта, севшего не в день вылета,
 *  после времени прилёта — его дата приглушённым цветом: «19:20 →
 *  13:45, 20 апр» читается без раскрытия строки (владелец отверг «+1»
 *  — непонятно, что это следующий день). Без времени прилёта дата
 *  встаёт сразу за стрелкой: «19:20 → 20 апр»; без времён вовсе —
 *  «→ 20 апр». */
export function TimeChip({
  timeLabel,
  arrivalDateLabel,
}: {
  timeLabel: string | null;
  arrivalDateLabel: string | null;
}) {
  if (!timeLabel && !arrivalDateLabel) return null;
  const time = timeLabel ?? "→";
  // Чип — inline-flex с gap: текст и span дата — два флекс-элемента, и
  // зазор между ними служит пробелом. Поэтому запятая остаётся в
  // тексте времени, а не уходит в span — иначе перед ней появлялся
  // просвет.
  const comma = arrivalDateLabel && !time.endsWith("→") ? "," : "";
  return (
    <span className="date-chip event-row-time">
      {`${time}${comma}`}
      {arrivalDateLabel && <span className="time-chip-date">{arrivalDateLabel}</span>}
    </span>
  );
}

/** Диапазон для дата-колонки двумя строками: в одном месяце — «4–5»
 *  крупно и «апр» под ним; на стыке месяцев — «28 февр –» и «2 мар»
 *  мелко (в 3.1rem колонки крупно не влезает). Дня недели у диапазона
 *  нет — на две даты он один не подходит. */
export type DateRangeLabels = { top: string; bottom: string; sameMonth: boolean };

/** Дата-колонка строки брони — та же, что у карточек событий
 *  (`.event-card-date`), плюс режим диапазона для многодневных строк. */
export function BookingDateColumn({
  dayLabel,
  monthLabel,
  weekdayLabel,
  dateRange,
}: {
  dayLabel: string;
  monthLabel: string;
  weekdayLabel: string;
  dateRange: DateRangeLabels | null;
}) {
  return (
    <div className="event-card-date flex-shrink-0">
      {dateRange ? (
        <>
          <span
            className={
              dateRange.sameMonth
                ? "event-card-day event-card-day-range"
                : "event-card-month event-card-month-range"
            }
          >
            {dateRange.top}
          </span>
          <span className={`event-card-month${dateRange.sameMonth ? "" : " event-card-month-range"}`}>
            {dateRange.bottom}
          </span>
        </>
      ) : (
        <>
          <span className="event-card-day">{dayLabel}</span>
          <span className="event-card-month">{monthLabel}</span>
          <span className="event-card-weekday">{weekdayLabel}</span>
        </>
      )}
    </div>
  );
}

export default function TripBookingLeg({
  tripId,
  leg,
  visibilityOptions,
}: {
  tripId: string;
  leg: BookingLegData;
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const isFlight = leg.kind === "FLIGHT";
  const isStart = leg.side === "start";

  const label =
    leg.side === "both"
      ? isFlight
        ? t.trips.bookings.flightSpan
        : t.trips.bookings.staySpan
      : isFlight
        ? isStart
          ? t.trips.bookings.departure
          : t.trips.bookings.arrival
        : isStart
          ? t.trips.bookings.checkIn
          : t.trips.bookings.checkOut;

  const subline = [leg.place, leg.spanLabel, leg.note].filter(Boolean).join(" · ");

  return (
    <div className="surface booking-leg d-flex align-items-center gap-3 p-3">
      <BookingDateColumn
        dayLabel={leg.dayLabel}
        monthLabel={leg.monthLabel}
        weekdayLabel={leg.weekdayLabel}
        dateRange={leg.dateRange}
      />

      <span
        className="booking-leg-icon flex-shrink-0"
        aria-hidden
        // Цвет линии своей стоянки — маркер «эта линия начинается/
        // кончается здесь»; без стоянки переменной нет, и CSS падает
        // обратно на акцент.
        style={
          leg.stayColor != null
            ? ({ "--stay-color": `var(--stay-line-${leg.stayColor})` } as React.CSSProperties)
            : undefined
        }
      >
        {isFlight ? <PlaneIcon /> : <BuildingIcon />}
      </span>

      <div className="flex-fill" style={{ minWidth: 0 }}>
        <div className="d-flex flex-wrap align-items-baseline gap-2">
          <TimeChip timeLabel={leg.timeLabel} arrivalDateLabel={leg.arrivalDateLabel} />
          <span className="booking-leg-label">{label}</span>
          <span className="text-white text-truncate">{leg.name}</span>
          <ItemVisibilityBadge visibility={leg.booking.visibility} />
        </div>
        {subline && <div className="small text-secondary text-truncate">{subline}</div>}
      </div>

      <span className="d-flex align-items-center gap-1 flex-shrink-0">
        {leg.fileUrl && (
          <a
            href={leg.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            {isFlight ? t.trips.bookings.ticketLink : t.trips.bookings.bookingLink}
          </a>
        )}
        {leg.url && (
          <a
            href={leg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            {t.trips.bookings.link}
          </a>
        )}
        {leg.canEdit && (
          <>
            <button
              type="button"
              className="icon-btn"
              aria-label={isFlight ? t.trips.bookings.editFlight : t.trips.bookings.editBooking}
              onClick={() => setEditing(true)}
            >
              <PencilIcon />
            </button>
            <ConfirmForm
              action={async () => {
                // Ошибку возвращаем ConfirmForm — она покажет её в
                // модалке подтверждения ({ error } из результата).
                const result = await deleteTripBooking(tripId, leg.bookingId);
                if (!result.ok) return result;
                router.refresh();
              }}
              confirmMessage={t.trips.bookings.deleteConfirm(leg.name)}
            >
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                aria-label={
                  isFlight ? t.trips.bookings.deleteFlight : t.trips.bookings.deleteBooking
                }
              >
                <TrashIcon />
              </button>
            </ConfirmForm>
          </>
        )}
      </span>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={isFlight ? t.trips.bookings.flightTitle : t.trips.bookings.hotelTitle}
      >
        <BookingForm
          tripId={tripId}
          kind={leg.kind}
          booking={leg.booking}
          visibilityOptions={visibilityOptions}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Modal>
    </div>
  );
}
