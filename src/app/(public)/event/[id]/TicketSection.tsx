"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClockIcon, PencilIcon, TicketIcon, TrashIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";
import DatePickerInput from "@/components/DatePickerInput";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import {
  setAttendanceTicket,
  removeAttendanceTicket,
  setTicketOnlineBooking,
  removeTicketOnlineBooking,
} from "./ticketActions";

/** Онлайн-бронирование у билета — уже отформатировано сервером:
 *  `label` — «12 сент · 10:00 (МСК 06:00)» (null, если записана одна
 *  ссылка), `date`/`time` — сырые значения для формы редактирования. */
export type TicketOnlineBooking = {
  date: string;
  time: string;
  url: string;
  label: string | null;
};

export type TicketRow = {
  occurrenceId: string;
  dateLabel: string;
  ticketUrl: string | null;
  onlineBooking: TicketOnlineBooking | null;
};

/** «Мои билеты» — видный блок на странице события: к каждой дате, куда
 *  идёшь, можно прикрепить купленный билет (PDF или скрин), а у билета —
 *  записать, когда открывается онлайн-бронирование (напомним за час). */
export default function TicketSection({ rows }: { rows: TicketRow[] }) {
  const t = useT();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  if (rows.length === 0) return null;

  async function upload(occurrenceId: string, file: File) {
    setBusyId(occurrenceId);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-ticket", { method: "POST", body: fd });
      const data = await res.json();
      // Ручка отдаёт код ошибки, а не фразу — язык страницы ей недоступен.
      if (!res.ok) {
        setError(uploadErrorMessage(t, data, t.events.tickets.uploadFailed));
        return;
      }
      // Экшен возвращает ошибку значением (текст исключения в проде до
      // клиента не доезжает) — показываем её тут же, у формы.
      const result = await setAttendanceTicket(occurrenceId, data.url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError(t.events.tickets.uploadFailedLong);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(occurrenceId: string) {
    setBusyId(occurrenceId);
    try {
      await removeAttendanceTicket(occurrenceId);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="surface p-4 mb-3"
      style={{ borderLeft: "3px solid var(--bs-primary)" }}
    >
      <h2 className="section-heading mb-2">
        <TicketIcon className="icon-inline" /> {t.events.tickets.heading}
      </h2>
      <div className="d-flex flex-column gap-2">
        {rows.map((row) => (
          <div key={row.occurrenceId} data-ticket-row={row.occurrenceId}>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="small text-secondary" style={{ minWidth: "5.5rem" }}>
                {row.dateLabel}
              </span>
              {row.ticketUrl ? (
                <>
                  <a
                    href={row.ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
                  >
                    <TicketIcon /> {t.events.tickets.open}
                  </a>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label={t.events.tickets.detach}
                    title={t.events.tickets.detach}
                    disabled={busyId === row.occurrenceId}
                    onClick={() => remove(row.occurrenceId)}
                  >
                    <TrashIcon />
                  </button>
                </>
              ) : (
                <>
                  <input
                    ref={(el) => {
                      if (el) inputRefs.current.set(row.occurrenceId, el);
                    }}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="d-none"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(row.occurrenceId, f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === row.occurrenceId}
                    onClick={() => inputRefs.current.get(row.occurrenceId)?.click()}
                  >
                    {busyId === row.occurrenceId
                      ? t.events.tickets.uploading
                      : t.events.tickets.attach}
                  </button>
                </>
              )}
            </div>
            {/* Онлайн-бронирование — только у прикреплённого билета: запись
                EventTicket без файла не существует (fileUrl обязателен). */}
            {row.ticketUrl && (
              <OnlineBookingLine
                occurrenceId={row.occurrenceId}
                booking={row.onlineBooking}
                onError={setError}
                onSaved={() => router.refresh()}
              />
            )}
          </div>
        ))}
      </div>
      {error && <p className="small text-danger mb-0 mt-2">{error}</p>}
    </div>
  );
}

/** Строка «Онлайн-бронирование откроется …» под билетом с кнопкой
 *  «Открыть» (если есть ссылка), карандашом и корзиной; без записи —
 *  кнопка «+ Онлайн-бронирование». Форма — инлайн, под строкой. */
function OnlineBookingLine({
  occurrenceId,
  booking,
  onError,
  onSaved,
}: {
  occurrenceId: string;
  booking: TicketOnlineBooking | null;
  onError: (message: string | null) => void;
  onSaved: () => void;
}) {
  const t = useT();
  const ob = t.events.tickets.onlineBooking;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(booking?.date ?? "");
  // Нули вместо пустоты: пустое поле времени браузер рисует призрачным
  // «12:30» (правка владельца 2026-09-09). Сервер понимает «00:00» как
  // «время не назначено» (optionalFormTime), а тут его всё равно
  // спрашивают вместе с датой — обе половины проверяются парой.
  const [time, setTime] = useState(booking?.time ?? "00:00");
  const [url, setUrl] = useState(booking?.url ?? "");

  function openForm() {
    setDate(booking?.date ?? "");
    setTime(booking?.time ?? "");
    setUrl(booking?.url ?? "");
    onError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    onError(null);
    try {
      const result = await setTicketOnlineBooking(occurrenceId, { date, time, url });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await removeTicketOnlineBooking(occurrenceId);
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const fieldId = (name: string) => `online-booking-${name}-${occurrenceId}`;

  return (
    <div className="ms-0 ms-sm-5 mt-1" data-online-booking={occurrenceId}>
      {!editing && !booking && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={openForm}>
          {ob.add}
        </button>
      )}
      {!editing && booking && (
        <div className="d-flex flex-wrap align-items-center gap-2 small">
          <span>
            <ClockIcon className="icon-inline" />{" "}
            {booking.label ? (
              ob.opensAt(booking.label)
            ) : (
              ob.linkOnly
            )}
          </span>
          {booking.url && (
            <a
              href={booking.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
            >
              {ob.open}
            </a>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={ob.edit}
            title={ob.edit}
            disabled={busy}
            onClick={openForm}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            aria-label={ob.remove}
            title={ob.remove}
            disabled={busy}
            onClick={clear}
          >
            <TrashIcon />
          </button>
        </div>
      )}
      {editing && (
        <div className="row g-2 align-items-end">
          <div className="col-6 col-sm-3">
            <label className="form-label small mb-1" htmlFor={fieldId("date")}>
              {ob.date}
            </label>
            <DatePickerInput
              id={fieldId("date")}
              value={date}
              onValueChange={setDate}
              yearsBack={1}
              yearsForward={2}
            />
          </div>
          <div className="col-6 col-sm-2">
            <label className="form-label small mb-1" htmlFor={fieldId("time")}>
              {ob.time}
            </label>
            <input
              id={fieldId("time")}
              type="time"
              className="form-control form-control-sm"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="col-12 col-sm-4">
            <label className="form-label small mb-1" htmlFor={fieldId("url")}>
              {ob.url}
            </label>
            <input
              id={fieldId("url")}
              type="url"
              className="form-control form-control-sm"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="col-12 col-sm-3 d-flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
              {ob.save}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              {ob.cancel}
            </button>
          </div>
          <div className="col-12">
            <p className="small text-secondary mb-0">{ob.reminderHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
