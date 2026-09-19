"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import FileDropzone from "@/components/FileDropzone";
import TimeInput from "@/components/TimeInput";
import DatePickerInput from "@/components/DatePickerInput";
import { saveTripBooking } from "../actions";
import { useT } from "@/components/LocaleProvider";
import PriceFields from "@/components/PriceFields";
import LetterAvatar from "@/components/LetterAvatar";
import { ItemVisibilityField, type TripItemVisibilityValue } from "../TripItemVisibility";

/** Участник поездки для галочек «кто летит / живёт». */
export type ParticipantOption = { id: string; name: string; photoUrl: string | null };

export type TripBookingRow = {
  /** Цена записи — она же строка в расходах поездки, если заполнена. */
  priceMinor?: number | null;
  priceCurrency?: "THB" | "RUB" | "BYN" | "USD" | null;
  id: string;
  kind: "HOTEL" | "FLIGHT";
  name: string;
  address: string | null;
  fromPlace: string | null;
  toPlace: string | null;
  url: string | null;
  fileUrl: string | null;
  note: string | null;
  /** «2026-08-29» — для полей формы. */
  startDate: string | null;
  endDate: string | null;
  /** «14:20» — есть и у отеля (заселение/выселение), и у перелёта. */
  startTime: string | null;
  endTime: string | null;
  /** Кто видит бронь. По умолчанию — участники поездки. */
  visibility: TripItemVisibilityValue;
  /** Кто летит этим рейсом / живёт в этом отеле (правка владельца
   *  2026-09-19). */
  participantIds: string[];
};

/**
 * Форма брони — одна на добавление и правку, на отель и перелёт.
 * Живёт отдельным файлом, потому что открывается из двух мест: из ряда
 * кнопок над планом (`TripBookings`) и из строки заезда/выезда в самой
 * ленте (`TripBookingLeg`) — бронь теперь показывается там, где она
 * происходит, и править её логично оттуда же.
 */
export default function BookingForm({
  tripId,
  kind,
  booking,
  visibilityOptions,
  participantOptions = [],
  viewerId = null,
  onSaved,
  onCancel,
}: {
  tripId: string;
  kind: "HOTEL" | "FLIGHT";
  booking?: TripBookingRow;
  /** Что можно выбрать в «кто это видит» — уже урезано видимостью
   *  поездки (см. `itemVisibilityChoices`). */
  visibilityOptions: readonly TripItemVisibilityValue[];
  /** Участники поездки — галочки «кто летит / живёт». В соло-поездке
   *  (один вариант) блока нет: летит, кто заводит. */
  participantOptions?: ParticipantOption[];
  viewerId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  // Галочки: при правке — текущие участники брони, при создании —
  // сам заводящий.
  const checkedIds = new Set(booking ? booking.participantIds : viewerId ? [viewerId] : []);
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const isFlight = kind === "FLIGHT";

  async function submit(formData: FormData) {
    setError(null);
    const result = await saveTripBooking(tripId, formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    router.refresh();
  }

  /** Дата и время одной стороны брони. Время — узкой колонкой рядом с
   *  датой, а не отдельной ячейкой сетки: в модалке шестая часть ширины
   *  обрезала «15:00» вместе со стрелкой выбора. */
  const whenField = (
    label: string,
    side: "start" | "end",
    timeAria: string,
  ) => (
    <div className="col-12 col-md-6 d-flex gap-2">
      <div className="flex-fill" style={{ minWidth: 0 }}>
        <label className="form-label small text-secondary" htmlFor={`${uid}-datepick`}>{label}</label>
        <DatePickerInput id={`${uid}-datepick`}
          name={side === "start" ? "startAt" : "endAt"}
          defaultValue={(side === "start" ? booking?.startDate : booking?.endDate) ?? ""}
        />
      </div>
      <div style={{ width: "6.4rem" }}>
        <label className="form-label small text-secondary" htmlFor={`${uid}-input`}>{t.trips.bookings.time}</label>
        <TimeInput
          id={`${uid}-input`}
          name={side === "start" ? "startTime" : "endTime"}
          defaultValue={(side === "start" ? booking?.startTime : booking?.endTime) ?? ""}
          ariaLabel={timeAria}
          className="form-control form-control-sm"
        />
      </div>
    </div>
  );

  return (
    <form action={submit} className="d-flex flex-column gap-3">
      {booking && <input type="hidden" name="bookingId" value={booking.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="form-label small text-secondary" htmlFor={`${uid}-name`}>
            {isFlight ? t.trips.bookings.flightName : t.trips.bookings.hotelName}
          </label>
          <input id={`${uid}-name`}
            name="name"
            required
            defaultValue={booking?.name}
            placeholder={isFlight ? "TG 975" : t.trips.bookings.namePlaceholder}
            className="form-control form-control-sm"
          />
        </div>

        {isFlight ? (
          <>
            <div className="col-6 col-md-3">
              <label className="form-label small text-secondary" htmlFor={`${uid}-fromPlace`}>{t.trips.bookings.from}</label>
              <input id={`${uid}-fromPlace`}
                name="fromPlace"
                defaultValue={booking?.fromPlace ?? ""}
                placeholder={t.trips.bookings.fromPlaceholder}
                className="form-control form-control-sm"
              />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small text-secondary" htmlFor={`${uid}-toPlace`}>{t.trips.bookings.to}</label>
              <input id={`${uid}-toPlace`}
                name="toPlace"
                defaultValue={booking?.toPlace ?? ""}
                placeholder={t.trips.bookings.toPlaceholder}
                className="form-control form-control-sm"
              />
            </div>
            {whenField(t.trips.bookings.departure, "start", t.trips.bookings.departureTimeAria)}
            {whenField(t.trips.bookings.arrival, "end", t.trips.bookings.arrivalTimeAria)}
          </>
        ) : (
          <>
            <div className="col-12 col-md-6">
              <label className="form-label small text-secondary" htmlFor={`${uid}-address`}>{t.trips.bookings.address}</label>
              <input id={`${uid}-address`}
                name="address"
                defaultValue={booking?.address ?? ""}
                placeholder={t.trips.bookings.addressPlaceholder}
                className="form-control form-control-sm"
              />
            </div>
            {/* Время заезда и выезда — необязательное: точного часа
                заселения человек может и не знать. Но если оно есть,
                строка встаёт в ленте дня на своё место среди событий. */}
            {whenField(t.trips.bookings.checkIn, "start", t.trips.bookings.checkInTimeAria)}
            {whenField(t.trips.bookings.checkOut, "end", t.trips.bookings.checkOutTimeAria)}
          </>
        )}

        <div className="col-12 col-md-6">
          <label className="form-label small text-secondary" htmlFor={`${uid}-url`}>
            {isFlight ? t.trips.bookings.ticketUrl : t.trips.bookings.bookingUrl}
          </label>
          <input id={`${uid}-url`}
            name="url"
            defaultValue={booking?.url ?? ""}
            placeholder="https://"
            className="form-control form-control-sm"
          />
        </div>
        <div className="col-12 col-md-6">
          <FileDropzone
            name="fileUrl"
            label={isFlight ? t.trips.bookings.ticketFile : t.trips.bookings.bookingFile}
            defaultValue={booking?.fileUrl ?? ""}
            accept="image/*,application/pdf"
            endpoint="/api/upload-hotel"
          />
        </div>
        {/* Кто летит / живёт: один рейс на всех — одна запись, у каждого
            свой билет (правка владельца 2026-09-19). Показываем только в
            совместной поездке — в соло выбирать не из кого. */}
        {participantOptions.length > 1 && (
          <div className="col-12">
            <span className="form-label small text-secondary d-block">
              {isFlight ? t.trips.bookings.whoFlies : t.trips.bookings.whoStays}
            </span>
            <div className="d-flex flex-wrap gap-2">
              {participantOptions.map((p) => (
                <label key={p.id} className="booking-who-option d-inline-flex align-items-center gap-2">
                  <input
                    type="checkbox"
                    name="participants"
                    value={p.id}
                    defaultChecked={checkedIds.has(p.id)}
                    className="form-check-input m-0"
                  />
                  <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={1.5} />
                  <span className="small">{p.id === viewerId ? t.trips.bookings.you : p.name}</span>
                </label>
              ))}
            </div>
            <p className="small text-secondary mb-0 mt-1">{t.trips.bookings.whoHint}</p>
          </div>
        )}
        <div className="col-12">
          {/* Кто видит бронь. Значение по умолчанию — участники: адрес и
              номер брони не показывают всем подряд. */}
          <ItemVisibilityField
            defaultValue={booking?.visibility ?? "PARTICIPANTS"}
            options={visibilityOptions}
          />
        </div>
        {/* Цена: заполнили — строка сама появилась в расходах поездки
            (правка владельца 2026-09-16). Необязательная. */}
        <div className="col-12">
          <PriceFields priceMinor={booking?.priceMinor} currency={booking?.priceCurrency} />
        </div>
        <div className="col-12">
          <label className="form-label small text-secondary" htmlFor={`${uid}-note`}>{t.trips.bookings.note}</label>
          <input id={`${uid}-note`}
            name="note"
            defaultValue={booking?.note ?? ""}
            placeholder={
              isFlight
                ? t.trips.bookings.flightNotePlaceholder
                : t.trips.bookings.hotelNotePlaceholder
            }
            className="form-control form-control-sm"
          />
        </div>
      </div>
      {error && <p className="small text-danger mb-0">{error}</p>}
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm">
          {t.common.save}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
