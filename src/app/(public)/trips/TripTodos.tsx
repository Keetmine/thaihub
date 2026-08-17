"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon, PencilIcon } from "@/components/icons";
import {
  createTripTodo,
  toggleTripTodo,
  updateTripTodo,
  deleteTripTodo,
} from "./actions";

export type TodoData = {
  id: string;
  text: string;
  done: boolean;
  /** ISO-строка (клиентский компонент — Date не сериализуем). */
  date: string | null;
  hasTime: boolean;
};

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/** Строка дела: чекбокс + текст + дата + правка/удаление. Используется
 *  и во вкладке «Дела», и в хронологии «Мой план» (датированные,
 *  showDate — та же дата-колонка, что у событий). */
export function TodoRow({
  todo,
  canEdit,
  showDate = false,
}: {
  todo: TodoData;
  canEdit: boolean;
  showDate?: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!canEdit || pending) return;
    setPending(true);
    try {
      await toggleTripTodo(todo.id);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const d = todo.date ? new Date(todo.date) : null;
  const timeLabel =
    d && todo.hasTime
      ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <div className="surface d-flex align-items-center gap-3 p-3">
      {showDate && d && (
        <div className="event-card-date flex-shrink-0">
          <span className="event-card-day">{d.getDate()}</span>
          <span className="event-card-month">
            {d.toLocaleDateString("ru-RU", { month: "short" }).replace(/\.$/, "")}
          </span>
          <span className="event-card-weekday">{WEEKDAYS_SHORT[d.getDay()]}</span>
        </div>
      )}
      <input
        type="checkbox"
        className="form-check-input flex-shrink-0 m-0"
        checked={todo.done}
        onChange={toggle}
        disabled={!canEdit || pending}
        aria-label={todo.done ? "Отметить невыполненным" : "Отметить выполненным"}
      />
      <span
        className={`flex-fill ${todo.done ? "text-secondary text-decoration-line-through" : ""}`}
        style={{ minWidth: 0 }}
      >
        {todo.text}
      </span>
      {timeLabel && <span className="small text-secondary flex-shrink-0">{timeLabel}</span>}
      {!showDate && todo.date && (
        <span className="small text-secondary flex-shrink-0">{fmtDate(todo.date)}</span>
      )}
      {canEdit && (
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <button
            type="button"
            className="icon-btn"
            aria-label="Редактировать дело"
            onClick={() => setEditOpen(true)}
          >
            <PencilIcon />
          </button>
          <ConfirmForm
            action={async () => {
              await deleteTripTodo(todo.id);
              router.refresh();
            }}
            confirmMessage="Удалить дело?"
          >
            <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить дело">
              <TrashIcon />
            </button>
          </ConfirmForm>
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Редактировать дело">
        <form
          action={async (fd) => {
            await updateTripTodo(todo.id, fd);
            setEditOpen(false);
            router.refresh();
          }}
          className="d-flex flex-column gap-3"
        >
          <div>
            <label className="form-label small text-secondary">Что сделать</label>
            <input name="text" required defaultValue={todo.text} className="form-control" />
          </div>
          <div className="row g-2">
            <div className="col-7">
              <label className="form-label small text-secondary">Дата (необязательно)</label>
              <DatePickerInput
                name="date"
                defaultValue={todo.date ? todo.date.slice(0, 10) : ""}
              />
            </div>
            <div className="col-5">
              <label className="form-label small text-secondary">Время</label>
              <input
                type="time"
                name="time"
                defaultValue={timeLabel ?? ""}
                className="form-control"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            Сохранить
          </button>
        </form>
      </Modal>
    </div>
  );
}

/** Вкладка «Дела»: форма добавления + список (невыполненные сверху). */
export default function TripTodos({
  tripId,
  todos,
  canEdit,
}: {
  tripId: string;
  todos: TodoData[];
  canEdit: boolean;
}) {
  const router = useRouter();
  // Ключ формы: после добавления форму ремоунтим, иначе DatePickerInput
  // удерживает прошлую дату и следующее дело получает её молча.
  const [formKey, setFormKey] = useState(0);

  const sorted = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  return (
    <div style={{ maxWidth: "44rem" }}>
      {canEdit && (
        <form
          key={formKey}
          action={async (fd) => {
            await createTripTodo(tripId, fd);
            setFormKey((k) => k + 1);
            router.refresh();
          }}
          className="d-flex flex-wrap align-items-end gap-2 mb-4"
        >
          <div className="flex-fill" style={{ minWidth: "14rem" }}>
            <label className="form-label small text-secondary">Новое дело</label>
            <input
              name="text"
              required
              placeholder="Купить симку, обменять деньги…"
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary">Дата (необязательно)</label>
            <DatePickerInput name="date" />
          </div>
          <div>
            <label className="form-label small text-secondary">Время</label>
            <input type="time" name="time" className="form-control" style={{ width: "7rem" }} />
          </div>
          <button type="submit" className="btn btn-primary">
            Добавить
          </button>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="text-secondary">
          {canEdit ? "Пока пусто — добавьте первое дело." : "Список дел пуст."}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {sorted.map((t) => (
            <TodoRow key={t.id} todo={t} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
