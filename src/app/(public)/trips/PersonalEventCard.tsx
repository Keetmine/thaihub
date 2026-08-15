"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import ConfirmForm from "@/components/ConfirmForm";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { updateTripPersonalEvent, deleteTripPersonalEvent } from "./actions";

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export type PersonalEventData = {
  id: string;
  title: string;
  note: string | null;
  startsAt: Date;
  // "YYYY-MM-DD" и "HH:mm" для формы редактирования — сериализуем на
  // сервере, чтобы не дублировать dateKey/formatTime в клиенте.
  dateKey: string;
  timeValue: string;
};

/** Форма создания/редактирования — общая для обеих модалок. */
export function PersonalEventFields({
  defaults,
}: {
  defaults?: { title: string; note: string | null; dateKey: string; timeValue: string };
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
      <div>
        <label className="form-label small text-secondary">Заметка</label>
        <textarea name="note" rows={2} defaultValue={defaults?.note ?? ""} className="form-control" />
      </div>
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
}: {
  tripId: string;
  event: PersonalEventData;
  canEdit?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const d = event.startsAt;
  const monthShort = d.toLocaleDateString("ru-RU", { month: "short" }).replace(/\.$/, "");
  const hasTime = event.timeValue !== "00:00";

  const boundUpdate = updateTripPersonalEvent.bind(null, tripId, event.id);
  const boundDelete = deleteTripPersonalEvent.bind(null, tripId, event.id);

  async function handleUpdate(formData: FormData) {
    await boundUpdate(formData);
    setIsEditing(false);
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
          <ConfirmForm action={boundDelete} confirmMessage={`Удалить «${event.title}»?`}>
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
        </h3>
        <p className="small text-secondary mb-0">
          {hasTime && event.timeValue}
          {hasTime && event.note && " · "}
          {event.note}
        </p>
      </div>

      <Modal open={isEditing} onClose={() => setIsEditing(false)} title="Редактировать событие">
        <form action={handleUpdate} className="d-flex flex-column gap-3">
          <PersonalEventFields
            defaults={{
              title: event.title,
              note: event.note,
              dateKey: event.dateKey,
              timeValue: hasTime ? event.timeValue : "",
            }}
          />
          <button type="submit" className="btn btn-primary">
            Сохранить
          </button>
        </form>
      </Modal>
    </div>
  );
}
