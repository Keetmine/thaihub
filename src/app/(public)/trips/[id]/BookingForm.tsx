"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileDropzone from "@/components/FileDropzone";
import DatePickerInput from "@/components/DatePickerInput";
import { saveTripBooking } from "../actions";
import { useT } from "@/components/LocaleProvider";
import { ItemVisibilityField, type TripItemVisibilityValue } from "../TripItemVisibility";

export type TripBookingRow = {
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
  onSaved,
  onCancel,
}: {
  tripId: string;
  kind: "HOTEL" | "FLIGHT";
  booking?: TripBookingRow;
  /** Что можно выбрать в «кто это видит» — уже урезано видимостью
   *  поездки (см. `itemVisibilityChoices`). */
  visibilityOptions: readonly TripItemVisibilityValue[];
  onSaved: () => void;
  onCancel: () => void;
}) {
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
        <label className="form-label small text-secondary">{label}</label>
        <DatePickerInput
          name={side === "start" ? "startAt" : "endAt"}
          defaultValue={(side === "start" ? booking?.startDate : booking?.endDate) ?? ""}
        />
      </div>
      <div style={{ width: "6.4rem" }}>
        <label className="form-label small text-secondary">{t.trips.bookings.time}</label>
        <input
          type="time"
          name={side === "start" ? "startTime" : "endTime"}
          defaultValue={(side === "start" ? booking?.startTime : booking?.endTime) ?? ""}
          aria-label={timeAria}
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
          <label className="form-label small text-secondary">
            {isFlight ? t.trips.bookings.flightName : t.trips.bookings.hotelName}
          </label>
          <input
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
              <label className="form-label small text-secondary">{t.trips.bookings.from}</label>
              <input
                name="fromPlace"
                defaultValue={booking?.fromPlace ?? ""}
                placeholder={t.trips.bookings.fromPlaceholder}
                className="form-control form-control-sm"
              />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small text-secondary">{t.trips.bookings.to}</label>
              <input
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
              <label className="form-label small text-secondary">{t.trips.bookings.address}</label>
              <input
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
          <label className="form-label small text-secondary">
            {isFlight ? t.trips.bookings.ticketUrl : t.trips.bookings.bookingUrl}
          </label>
          <input
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
        <div className="col-12">
          {/* Кто видит бронь. Значение по умолчанию — участники: адрес и
              номер брони не показывают всем подряд. */}
          <ItemVisibilityField
            defaultValue={booking?.visibility ?? "PARTICIPANTS"}
            options={visibilityOptions}
          />
        </div>
        <div className="col-12">
          <label className="form-label small text-secondary">{t.trips.bookings.note}</label>
          <input
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
