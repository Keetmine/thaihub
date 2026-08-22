"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";
import FileDropzone from "@/components/FileDropzone";
import DatePickerInput from "@/components/DatePickerInput";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { saveTripHotel, deleteTripHotel } from "../actions";

export type TripHotelRow = {
  id: string;
  name: string;
  address: string | null;
  url: string | null;
  fileUrl: string | null;
  note: string | null;
  checkIn: string | null;
  checkOut: string | null;
};

/**
 * Брони жилья внутри поездки: файл брони, адрес и даты заезда-выезда
 * лежат там же, где остальной план. Раньше бронь жила в почте, и в день
 * заселения её приходилось искать по переписке.
 */
export default function TripHotels({
  tripId,
  hotels,
}: {
  tripId: string;
  hotels: TripHotelRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function submit(formData: FormData) {
    await saveTripHotel(tripId, formData);
    setEditing(null);
    setAdding(false);
    router.refresh();
  }

  const dates = (h: TripHotelRow) =>
    [h.checkIn, h.checkOut].filter(Boolean).join(" → ") || null;

  const form = (hotel?: TripHotelRow) => (
    <form action={submit} className="surface p-3 d-flex flex-column gap-2">
      {hotel && <input type="hidden" name="hotelId" value={hotel.id} />}
      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="form-label small text-secondary">Отель *</label>
          <input
            name="name"
            required
            defaultValue={hotel?.name}
            placeholder="Название"
            className="form-control form-control-sm"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small text-secondary">Адрес</label>
          <input
            name="address"
            defaultValue={hotel?.address ?? ""}
            placeholder="Улица, район"
            className="form-control form-control-sm"
          />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small text-secondary">Заезд</label>
          <DatePickerInput name="checkIn" defaultValue={hotel?.checkIn ?? ""} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small text-secondary">Выезд</label>
          <DatePickerInput name="checkOut" defaultValue={hotel?.checkOut ?? ""} />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small text-secondary">Ссылка на бронь</label>
          <input
            name="url"
            defaultValue={hotel?.url ?? ""}
            placeholder="https://"
            className="form-control form-control-sm"
          />
        </div>
        <div className="col-12 col-md-6">
          <FileDropzone
            name="fileUrl"
            label="Файл брони"
            defaultValue={hotel?.fileUrl ?? ""}
            accept="image/*,application/pdf"
            endpoint="/api/upload-hotel"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small text-secondary">Заметка</label>
          <input
            name="note"
            defaultValue={hotel?.note ?? ""}
            placeholder="Код брони, этаж, во сколько заселение"
            className="form-control form-control-sm"
          />
        </div>
      </div>
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm">
          Сохранить
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setEditing(null);
            setAdding(false);
          }}
        >
          Отмена
        </button>
      </div>
    </form>
  );

  return (
    <section className="mb-4">
      <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
        <h2 className="section-heading mb-0">Жильё</h2>
        {!adding && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            + Добавить бронь
          </button>
        )}
      </div>

      <div className="d-flex flex-column gap-2">
        {adding && form()}

        {hotels.map((h) =>
          editing === h.id ? (
            <div key={h.id}>{form(h)}</div>
          ) : (
            <div
              key={h.id}
              className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3"
            >
              <div style={{ minWidth: 0 }}>
                <span className="text-white d-block">{h.name}</span>
                <span className="small text-secondary d-block">
                  {[dates(h), h.address].filter(Boolean).join(" · ") || "без дат"}
                </span>
                {h.note && <span className="small text-secondary d-block">{h.note}</span>}
              </div>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                {h.fileUrl && (
                  <a
                    href={h.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    Бронь ↗
                  </a>
                )}
                {h.url && (
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    Ссылка ↗
                  </a>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Редактировать"
                  onClick={() => setEditing(h.id)}
                >
                  <PencilIcon />
                </button>
                <ConfirmForm
                  action={async () => {
                    await deleteTripHotel(tripId, h.id);
                    router.refresh();
                  }}
                  confirmMessage={`Удалить бронь «${h.name}»?`}
                >
                  <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить">
                    <TrashIcon />
                  </button>
                </ConfirmForm>
              </div>
            </div>
          ),
        )}

        {hotels.length === 0 && !adding && (
          <p className="small text-secondary mb-0">
            Добавьте бронь — файл, адрес и даты будут под рукой в день заселения.
          </p>
        )}
      </div>
    </section>
  );
}
