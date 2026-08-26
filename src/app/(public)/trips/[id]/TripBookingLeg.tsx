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
 *  прилёт. Подписи даты приходят готовыми со страницы — даты проекта
 *  считаются в UTC (см. lib/dates.ts), и локальные геттеры в браузере
 *  зрителя дали бы другой день. */
export type BookingLegData = {
  key: string;
  bookingId: string;
  kind: "HOTEL" | "FLIGHT";
  side: "start" | "end";
  dayLabel: string;
  monthLabel: string;
  weekdayLabel: string;
  /** null — время не указано (в базе ровно 00:00). */
  timeLabel: string | null;
  name: string;
  /** Адрес отеля или маршрут перелёта «Москва → Бангкок». */
  place: string | null;
  /** «до 5 сен · 6 ночей» у заезда, «с 29 авг» у выезда. */
  spanLabel: string | null;
  note: string | null;
  url: string | null;
  fileUrl: string | null;
  canEdit: boolean;
  /** Значения для формы правки — она правит бронь целиком, обе даты. */
  booking: TripBookingRow;
};

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

  const label = isFlight
    ? isStart
      ? t.trips.bookings.departure
      : t.trips.bookings.arrival
    : isStart
      ? t.trips.bookings.checkIn
      : t.trips.bookings.checkOut;

  const subline = [leg.place, leg.spanLabel, leg.note].filter(Boolean).join(" · ");

  return (
    <div className="surface booking-leg d-flex align-items-center gap-3 p-3">
      <div className="event-card-date flex-shrink-0">
        <span className="event-card-day">{leg.dayLabel}</span>
        <span className="event-card-month">{leg.monthLabel}</span>
        <span className="event-card-weekday">{leg.weekdayLabel}</span>
      </div>

      <span className="booking-leg-icon flex-shrink-0" aria-hidden>
        {isFlight ? <PlaneIcon /> : <BuildingIcon />}
      </span>

      <div className="flex-fill" style={{ minWidth: 0 }}>
        <div className="d-flex flex-wrap align-items-baseline gap-2">
          {leg.timeLabel && <span className="date-chip event-row-time">{leg.timeLabel}</span>}
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
