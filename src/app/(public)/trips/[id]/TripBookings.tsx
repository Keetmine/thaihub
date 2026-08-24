"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";
import FileDropzone from "@/components/FileDropzone";
import DatePickerInput from "@/components/DatePickerInput";
import { BuildingIcon, PlaneIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { saveTripBooking, deleteTripBooking } from "../actions";

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
 * когда броней нет, от блока остаётся заголовок с двумя кнопками.
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
      <form action={submit} className="surface p-3 d-flex flex-column gap-2">
        {booking && <input type="hidden" name="bookingId" value={booking.id} />}
        <input type="hidden" name="kind" value={kind} />
        <div className="row g-2">
          <div className="col-12 col-md-6">
            <label className="form-label small text-secondary">
              {isFlight ? "Рейс или авиакомпания *" : "Отель *"}
            </label>
            <input
              name="name"
              required
              defaultValue={booking?.name}
              placeholder={isFlight ? "TG 975" : "Название"}
              className="form-control form-control-sm"
            />
          </div>

          {isFlight ? (
            <>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">Откуда</label>
                <input
                  name="fromPlace"
                  defaultValue={booking?.fromPlace ?? ""}
                  placeholder="Москва"
                  className="form-control form-control-sm"
                />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">Куда</label>
                <input
                  name="toPlace"
                  defaultValue={booking?.toPlace ?? ""}
                  placeholder="Бангкок"
                  className="form-control form-control-sm"
                />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">Вылет</label>
                <DatePickerInput name="startAt" defaultValue={booking?.startDate ?? ""} />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">Время вылета</label>
                <input
                  type="time"
                  name="startTime"
                  defaultValue={booking?.startTime ?? ""}
                  aria-label="Время вылета"
                  className="form-control form-control-sm"
                />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">Прилёт</label>
                <DatePickerInput name="endAt" defaultValue={booking?.endDate ?? ""} />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">Время прилёта</label>
                <input
                  type="time"
                  name="endTime"
                  defaultValue={booking?.endTime ?? ""}
                  aria-label="Время прилёта"
                  className="form-control form-control-sm"
                />
              </div>
            </>
          ) : (
            <>
              <div className="col-12 col-md-6">
                <label className="form-label small text-secondary">Адрес</label>
                <input
                  name="address"
                  defaultValue={booking?.address ?? ""}
                  placeholder="Улица, район"
                  className="form-control form-control-sm"
                />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">Заезд</label>
                <DatePickerInput name="startAt" defaultValue={booking?.startDate ?? ""} />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small text-secondary">Выезд</label>
                <DatePickerInput name="endAt" defaultValue={booking?.endDate ?? ""} />
              </div>
            </>
          )}

          <div className="col-12 col-md-6">
            <label className="form-label small text-secondary">
              {isFlight ? "Ссылка на билет" : "Ссылка на бронь"}
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
              label={isFlight ? "Файл билета" : "Файл брони"}
              defaultValue={booking?.fileUrl ?? ""}
              accept="image/*,application/pdf"
              endpoint="/api/upload-hotel"
            />
          </div>
          <div className="col-12">
            <label className="form-label small text-secondary">Заметка</label>
            <input
              name="note"
              defaultValue={booking?.note ?? ""}
              placeholder={
                isFlight ? "Место, багаж, номер брони" : "Код брони, этаж, во сколько заселение"
              }
              className="form-control form-control-sm"
            />
          </div>
        </div>
        {error && <p className="small text-danger mb-0">{error}</p>}
        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-primary btn-sm">
            Сохранить
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
            Отмена
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

  return (
    <section className="mb-4">
      {/* Ряд добавления: событие первым и акцентом (его добавляют
          чаще), за ним бронь отеля и перелёт. */}
      {canEdit && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          {leadingAction}
          {!adding && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditing(null);
                  setAdding("HOTEL");
                }}
              >
                + Отель
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditing(null);
                  setAdding("FLIGHT");
                }}
              >
                + Перелёт
              </button>
            </>
          )}
        </div>
      )}

      {/* Заголовок нужен только когда под ним что-то есть: пустой блок
          должен занимать минимум места. */}
      {(adding || bookings.length > 0) && (
        <h2 className="section-heading mb-2">Жильё и перелёты</h2>
      )}

      {(adding || bookings.length > 0) && (
        <div className="d-flex flex-column gap-2">
          {adding && form(adding)}

          {bookings.map((b) =>
            editing === b.id ? (
              <div key={b.id}>{form(b.kind, b)}</div>
            ) : (
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
                      {b.kind === "FLIGHT" ? "Билет ↗" : "Бронь ↗"}
                    </a>
                  )}
                  {b.url && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      Ссылка ↗
                    </a>
                  )}
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={
                          b.kind === "FLIGHT" ? "Редактировать перелёт" : "Редактировать бронь"
                        }
                        onClick={() => {
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
                        confirmMessage={`Удалить «${b.name}»?`}
                      >
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          aria-label={b.kind === "FLIGHT" ? "Удалить перелёт" : "Удалить бронь"}
                        >
                          <TrashIcon />
                        </button>
                      </ConfirmForm>
                    </>
                  )}
                </span>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
