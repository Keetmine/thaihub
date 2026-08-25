"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";
import Modal from "@/components/Modal";
import FileDropzone from "@/components/FileDropzone";
import DatePickerInput from "@/components/DatePickerInput";
import { BuildingIcon, PlaneIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { saveTripBooking, deleteTripBooking } from "../actions";
import { useT } from "@/components/LocaleProvider";

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
  /** «14:20» — только у перелётов. */
  startTime: string | null;
  endTime: string | null;
  /** Готовая подпись «29 авг → 5 сент» / «29 авг 14:20 → 18:05». */
  whenLabel: string | null;
};

/**
 * Бронирования поездки — отели и перелёты одним компактным списком:
 * файл брони, маршрут и даты лежат там же, где остальной план. Раньше
 * это был блок только под жильё, и он занимал пол-экрана даже пустым —
 * поэтому строки здесь однострочные, а пустого состояния нет вовсе:
 * когда броней нет, от блока остаётся только ряд кнопок. Форма
 * добавления и правки открывается в модалке — как у личного события.
 */
export default function TripBookings({
  tripId,
  bookings,
  canEdit = true,
  leadingAction,
}: {
  tripId: string;
  bookings: TripBookingRow[];
  canEdit?: boolean;
  /** Кнопка «+ Событие» — она главнее брони, поэтому идёт первой в
   *  том же ряду. Приходит готовым элементом со страницы: у неё своя
   *  модалка и своё состояние. */
  leadingAction?: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<"HOTEL" | "FLIGHT" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setError(null);
    const result = await saveTripBooking(tripId, formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    setAdding(null);
    router.refresh();
  }

  function close() {
    setEditing(null);
    setAdding(null);
    setError(null);
  }

  const form = (kind: "HOTEL" | "FLIGHT", booking?: TripBookingRow) => {
    const isFlight = kind === "FLIGHT";
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
              <div className="col-7 col-md-4">
                <label className="form-label small text-secondary">{t.trips.bookings.departure}</label>
                <DatePickerInput name="startAt" defaultValue={booking?.startDate ?? ""} />
              </div>
              <div className="col-5 col-md-2">
                <label className="form-label small text-secondary">{t.trips.bookings.time}</label>
                <input
                  type="time"
                  name="startTime"
                  defaultValue={booking?.startTime ?? ""}
                  aria-label={t.trips.bookings.departureTimeAria}
                  className="form-control form-control-sm"
                />
              </div>
              <div className="col-7 col-md-4">
                <label className="form-label small text-secondary">{t.trips.bookings.arrival}</label>
                <DatePickerInput name="endAt" defaultValue={booking?.endDate ?? ""} />
              </div>
              <div className="col-5 col-md-2">
                <label className="form-label small text-secondary">{t.trips.bookings.time}</label>
                <input
                  type="time"
                  name="endTime"
                  defaultValue={booking?.endTime ?? ""}
                  aria-label={t.trips.bookings.arrivalTimeAria}
                  className="form-control form-control-sm"
                />
              </div>
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
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">{t.trips.bookings.checkIn}</label>
                <DatePickerInput name="startAt" defaultValue={booking?.startDate ?? ""} />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">{t.trips.bookings.checkOut}</label>
                <DatePickerInput name="endAt" defaultValue={booking?.endDate ?? ""} />
              </div>
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
            {t.common.cancel}
          </button>
        </div>
      </form>
    );
  };

  // Подстрока брони: маршрут или адрес плюс даты — всё в одну строку,
  // чтобы бронь занимала ровно столько места, сколько несёт смысла.
  const subline = (b: TripBookingRow) => {
    const route =
      b.kind === "FLIGHT"
        ? [b.fromPlace, b.toPlace].filter(Boolean).join(" → ") || null
        : b.address;
    return [route, b.whenLabel, b.note].filter(Boolean).join(" · ");
  };

  // Модалка одна на весь блок: либо добавляем бронь выбранного вида,
  // либо правим существующую — вид тогда берём у неё.
  const editingBooking = editing ? (bookings.find((b) => b.id === editing) ?? null) : null;
  const modalKind = adding ?? editingBooking?.kind ?? null;

  return (
    <section className="mb-4">
      {/* Ряд добавления: событие первым и акцентом (его добавляют
          чаще), за ним бронь отеля и перелёт. Ряд виден всегда —
          форма открывается поверх, в модалке. */}
      {canEdit && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          {leadingAction}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setError(null);
              setEditing(null);
              setAdding("HOTEL");
            }}
          >
            {t.trips.bookings.addHotel}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setError(null);
              setEditing(null);
              setAdding("FLIGHT");
            }}
          >
            {t.trips.bookings.addFlight}
          </button>
        </div>
      )}

      {/* Заголовок нужен только когда под ним что-то есть: пустой блок
          должен занимать минимум места. */}
      {bookings.length > 0 && (
        <h2 className="section-heading mb-2">{t.trips.bookings.heading}</h2>
      )}

      {bookings.length > 0 && (
        <div className="d-flex flex-column gap-2">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="surface booking-row d-flex align-items-center gap-2 px-3 py-2"
            >
              <span className="text-secondary flex-shrink-0" aria-hidden>
                {b.kind === "FLIGHT" ? <PlaneIcon /> : <BuildingIcon />}
              </span>
              <span className="d-flex flex-wrap align-items-baseline gap-2" style={{ minWidth: 0 }}>
                <span className="text-white text-truncate">{b.name}</span>
                <span className="small text-secondary text-truncate">{subline(b)}</span>
              </span>
              <span className="d-flex align-items-center gap-1 flex-shrink-0 ms-auto">
                {b.fileUrl && (
                  <a
                    href={b.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    {b.kind === "FLIGHT" ? t.trips.bookings.ticketLink : t.trips.bookings.bookingLink}
                  </a>
                )}
                {b.url && (
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    {t.trips.bookings.link}
                  </a>
                )}
                {canEdit && (
                  <>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={
                        b.kind === "FLIGHT"
                          ? t.trips.bookings.editFlight
                          : t.trips.bookings.editBooking
                      }
                      onClick={() => {
                        setError(null);
                        setAdding(null);
                        setEditing(b.id);
                      }}
                    >
                      <PencilIcon />
                    </button>
                    <ConfirmForm
                      action={async () => {
                        // Ошибку возвращаем ConfirmForm — она покажет её в
                        // модалке подтверждения ({ error } из результата).
                        const result = await deleteTripBooking(tripId, b.id);
                        if (!result.ok) return result;
                        router.refresh();
                      }}
                      confirmMessage={t.trips.bookings.deleteConfirm(b.name)}
                    >
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        aria-label={
                          b.kind === "FLIGHT"
                            ? t.trips.bookings.deleteFlight
                            : t.trips.bookings.deleteBooking
                        }
                      >
                        <TrashIcon />
                      </button>
                    </ConfirmForm>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalKind !== null}
        onClose={close}
        title={modalKind === "FLIGHT" ? t.trips.bookings.flightTitle : t.trips.bookings.hotelTitle}
      >
        {modalKind && form(modalKind, editingBooking ?? undefined)}
      </Modal>
    </section>
  );
}
