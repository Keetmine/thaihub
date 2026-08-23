"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import ConfirmForm from "@/components/ConfirmForm";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { updateTripPersonalEvent, deleteTripPersonalEvent } from "./actions";
import LocationPickerField from "./LocationPickerField";
import Link from "next/link";

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export type PersonalEventData = {
  id: string;
  title: string;
  note: string | null;
  location: { id: string; name: string } | null;
  startsAt: Date;
  // "YYYY-MM-DD" и "HH:mm" для формы редактирования — сериализуем на
  // сервере, чтобы не дублировать dateKey/formatTime в клиенте.
  dateKey: string;
  timeValue: string;
  // Совместные поездки: имя автора (показывается, когда участников >1)
  // и разрешение другим участникам править/удалять запись.
  author: string | null;
  editableByOthers: boolean;
  isPrivate: boolean;
  canEdit: boolean;
};

/** Форма создания/редактирования — общая для обеих модалок.
 *  showShareToggle — галочка «участники могут редактировать» (совместные
 *  поездки); в соло-поездке не показываем, чтобы не путать. */
export function PersonalEventFields({
  defaults,
  showShareToggle = false,
}: {
  defaults?: {
    title: string;
    note: string | null;
    dateKey: string;
    timeValue: string;
    location?: { id: string; name: string } | null;
    editableByOthers?: boolean;
    isPrivate?: boolean;
  };
  showShareToggle?: boolean;
}) {
  return (
    <>
      <div>
        <label className="form-label small text-secondary">Название</label>
        <input
          type="text"
          name="title"
          required
          autoFocus
          defaultValue={defaults?.title}
          placeholder="Ужин с друзьями"
          className="form-control"
        />
      </div>
      <div className="row g-2">
        <div className="col-7">
          <label className="form-label small text-secondary">Дата</label>
          <DatePickerInput name="date" required defaultValue={defaults?.dateKey} />
        </div>
        <div className="col-5">
          <label className="form-label small text-secondary">Время</label>
          <input
            type="time"
            name="time"
            defaultValue={defaults?.timeValue}
            className="form-control"
          />
        </div>
      </div>
      <LocationPickerField defaultLocation={defaults?.location} />
      <div>
        <label className="form-label small text-secondary">Заметка</label>
        <textarea name="note" rows={2} defaultValue={defaults?.note ?? ""} className="form-control" />
      </div>
      {showShareToggle ? (
        <>
          <label className="form-check d-flex align-items-center gap-2 mb-0">
            <input
              type="checkbox"
              name="editableByOthers"
              defaultChecked={defaults?.editableByOthers ?? false}
              className="form-check-input m-0"
            />
            <span className="form-check-label small">
              Участники поездки могут редактировать и удалять
            </span>
          </label>
          <label className="form-check d-flex align-items-center gap-2 mb-0">
            <input
              type="checkbox"
              name="isPrivate"
              defaultChecked={defaults?.isPrivate ?? false}
              className="form-check-input m-0"
            />
            <span className="form-check-label small">Приватное — видно только мне</span>
          </label>
        </>
      ) : (
        // Без галочек сохраняем прежние значения флагов, иначе update
        // сбросил бы их (чекбокс в FormData отличим от «не показан»
        // только этим hidden).
        <>
          {defaults?.editableByOthers && <input type="hidden" name="editableByOthers" value="on" />}
          {defaults?.isPrivate && <input type="hidden" name="isPrivate" value="on" />}
        </>
      )}
    </>
  );
}

/** Карточка личного события в списке поездки — тот же макет .event-card,
 *  но с бейджем «личное» и кнопками редактировать/удалить вместо
 *  избранного/«иду». */
export default function PersonalEventCard({
  tripId,
  event,
  canEdit = true,
  showShareToggle = false,
}: {
  tripId: string;
  event: PersonalEventData;
  canEdit?: boolean;
  showShareToggle?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = event.startsAt;
  const monthShort = d.toLocaleDateString("ru-RU", { month: "short" }).replace(/\.$/, "");
  const hasTime = event.timeValue !== "00:00";

  const boundUpdate = updateTripPersonalEvent.bind(null, tripId, event.id);
  const boundDelete = deleteTripPersonalEvent.bind(null, tripId, event.id);

  async function handleUpdate(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      const result = await boundUpdate(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
    } catch {
      setError("Не удалось сохранить — попробуйте ещё раз");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="event-card">
      {canEdit && (
        <div className="corner-actions corner-actions-row">
          <button
            type="button"
            className="icon-btn"
            aria-label="Редактировать"
            title="Редактировать"
            onClick={() => setIsEditing(true)}
          >
            <PencilIcon />
          </button>
          <ConfirmForm
            // Ошибку возвращаем ConfirmForm — она покажет её в модалке
            // подтверждения ({ error } из результата).
            action={async () => {
              const result = await boundDelete();
              if (!result.ok) return result;
            }}
            confirmMessage={`Удалить «${event.title}»?`}
          >
            <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить" title="Удалить">
              <TrashIcon />
            </button>
          </ConfirmForm>
        </div>
      )}

      <div className="event-card-date">
        <span className="event-card-day">{d.getDate()}</span>
        <span className="event-card-month">{monthShort}</span>
        <span className="event-card-weekday">{WEEKDAYS_SHORT[d.getDay()]}</span>
      </div>

      <div className="event-card-body">
        <h3 className="h5 font-display mb-1 d-flex align-items-center gap-2">
          {event.title}
          <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.6rem" }}>
            личное
          </span>
          {event.isPrivate && (
            <span className="badge rounded-pill text-bg-dark border" style={{ fontSize: "0.6rem" }}>
              приватное
            </span>
          )}
          {event.author && (
            <span className="small text-secondary fw-normal">{event.author}</span>
          )}
        </h3>
        <p className="small text-secondary mb-0">
          {hasTime && event.timeValue}
          {hasTime && (event.note || event.location) && " · "}
          {event.location && (
            <Link
              href={`/locations/${event.location.id}`}
              className="agenda-performer-link"
            >
              📍 {event.location.name}
            </Link>
          )}
          {event.location && event.note && " · "}
          {event.note}
        </p>
      </div>

      <Modal
        open={isEditing}
        onClose={() => {
          setIsEditing(false);
          setError(null);
        }}
        title="Редактировать событие"
      >
        <form action={handleUpdate} className="d-flex flex-column gap-3">
          <PersonalEventFields
            defaults={{
              title: event.title,
              note: event.note,
              dateKey: event.dateKey,
              timeValue: hasTime ? event.timeValue : "",
              location: event.location,
              editableByOthers: event.editableByOthers,
              isPrivate: event.isPrivate,
            }}
            showShareToggle={showShareToggle}
          />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
