"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon, PencilIcon } from "@/components/icons";
import { useLocale, useT } from "@/components/LocaleProvider";
import {
  ItemVisibilityBadge,
  ItemVisibilityField,
  type TripItemVisibilityValue,
} from "./TripItemVisibility";
import { shortMonthName, shortWeekdayName } from "@/lib/dates";
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
  // Совместные поездки: имя автора (когда участников >1), право текущего
  // юзера менять запись и разрешение автора на правку другими.
  author: string | null;
  canEdit: boolean;
  editableByOthers: boolean;
  /** Кто видит дело: только автор, участники, друзья автора или все,
   *  кому видна поездка. */
  visibility: TripItemVisibilityValue;
};

/** Строка дела: чекбокс + текст + дата + правка/удаление. Используется
 *  и во вкладке «Дела», и в хронологии «Мой план» (датированные,
 *  showDate — та же дата-колонка, что у событий). */
export function TodoRow({
  todo,
  showDate = false,
  showShareToggle = false,
  visibilityOptions,
}: {
  todo: TodoData;
  showDate?: boolean;
  showShareToggle?: boolean;
  /** Что можно выбрать в «кто это видит» — уже урезано видимостью
   *  поездки (см. `itemVisibilityChoices`). */
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const uid = useId();
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Ошибки: rowError — у строки (чекбокс/удаление), editError — в модалке.
  const [rowError, setRowError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const canEdit = todo.canEdit;

  async function toggle() {
    if (!canEdit || pending) return;
    setPending(true);
    setRowError(null);
    try {
      const result = await toggleTripTodo(todo.id);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const d = todo.date ? new Date(todo.date) : null;
  // Fixed 24-hour tag on purpose, not a language choice: the same string
  // is the defaultValue of <input type="time">, which only accepts "HH:mm".
  const timeLabel =
    d && todo.hasTime
      ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <div className="surface d-flex align-items-center gap-3 p-3">
      {showDate && d && (
        <div className="event-card-date flex-shrink-0">
          <span className="event-card-day">{d.getDate()}</span>
          <span className="event-card-month">{shortMonthName(d, locale)}</span>
          <span className="event-card-weekday">{shortWeekdayName(d, locale)}</span>
        </div>
      )}
      <input
        type="checkbox"
        className="form-check-input flex-shrink-0 m-0"
        checked={todo.done}
        onChange={toggle}
        disabled={!canEdit || pending}
        aria-label={todo.done ? t.trips.todos.markUndone : t.trips.todos.markDone}
      />
      <span
        className={`flex-fill ${todo.done ? "text-secondary text-decoration-line-through" : ""}`}
        style={{ minWidth: 0 }}
      >
        {todo.text}
        <span className="ms-2">
          <ItemVisibilityBadge visibility={todo.visibility} />
        </span>
        {todo.author && (
          <span className="small text-secondary ms-2">{todo.author}</span>
        )}
      </span>
      {rowError && <span className="small text-danger flex-shrink-0">{rowError}</span>}
      {timeLabel && <span className="small text-secondary flex-shrink-0">{timeLabel}</span>}
      {!showDate && d && (
        <span className="small text-secondary flex-shrink-0">
          {d.getDate()} {shortMonthName(d, locale)}
        </span>
      )}
      {canEdit && (
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <button
            type="button"
            className="icon-btn"
            aria-label={t.trips.todos.editAria}
            onClick={() => setEditOpen(true)}
          >
            <PencilIcon />
          </button>
          <ConfirmForm
            action={async () => {
              // Ошибку возвращаем ConfirmForm — она покажет её в модалке
              // подтверждения ({ error } из результата).
              const result = await deleteTripTodo(todo.id);
              if (!result.ok) return result;
              router.refresh();
            }}
            confirmMessage={t.trips.todos.deleteConfirm}
          >
            <button type="button" className="icon-btn icon-btn-danger" aria-label={t.trips.todos.deleteAria}>
              <TrashIcon />
            </button>
          </ConfirmForm>
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditError(null);
        }}
        title={t.trips.todos.editTitle}
      >
        <form
          action={async (fd) => {
            setEditError(null);
            const result = await updateTripTodo(todo.id, fd);
            if (!result.ok) {
              setEditError(result.error);
              return;
            }
            setEditOpen(false);
            router.refresh();
          }}
          className="d-flex flex-column gap-3"
        >
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-text`}>{t.trips.todos.text}</label>
            <input id={`${uid}-text`} name="text" required defaultValue={todo.text} className="form-control" />
          </div>
          <div className="row g-2">
            <div className="col-7">
              <label className="form-label small text-secondary" htmlFor={`${uid}-date`}>
                {t.trips.todos.dateOptional}
              </label>
              <DatePickerInput id={`${uid}-date`}
                name="date"
                defaultValue={todo.date ? todo.date.slice(0, 10) : ""}
              />
            </div>
            <div className="col-5">
              <label className="form-label small text-secondary" htmlFor={`${uid}-time`}>{t.trips.todos.time}</label>
              <input id={`${uid}-time`}
                type="time"
                name="time"
                defaultValue={timeLabel ?? ""}
                className="form-control"
              />
            </div>
          </div>
          <ItemVisibilityField defaultValue={todo.visibility} options={visibilityOptions} />
          {showShareToggle ? (
            <label className="form-check d-flex align-items-center gap-2 mb-0">
              <input
                type="checkbox"
                name="editableByOthers"
                defaultChecked={todo.editableByOthers}
                className="form-check-input m-0"
              />
              <span className="form-check-label small">
                {t.trips.todos.editableByOthers}
              </span>
            </label>
          ) : (
            // Сохраняем прежний флаг, когда галочка скрыта (соло-поездка).
            todo.editableByOthers && <input type="hidden" name="editableByOthers" value="on" />
          )}
          {editError && <p className="small text-danger mb-0">{editError}</p>}
          <button type="submit" className="btn btn-primary">
            {t.common.save}
          </button>
        </form>
      </Modal>
    </div>
  );
}

/** Кнопка «+ Дело» с модалкой — на вкладке дел и в общем ряду действий.
 *  Раньше форма висела на вкладке развёрнутой и занимала первый экран
 *  ещё до того, как человек решил что-то добавить (просьба владельца:
 *  «добавлять дело тоже по кнопке»). */
export function AddTripTodoButton({
  tripId,
  showShareToggle = false,
  visibilityOptions,
}: {
  tripId: string;
  showShareToggle?: boolean;
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const uid = useId();
  const t = useT();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        {t.trips.todos.addButton}
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={t.trips.todos.addTitle}
      >
        {/* Форма живёт внутри модалки, поэтому после закрытия она
            размонтируется целиком — прежний ремоунт по ключу (иначе
            DatePickerInput молча тащил дату в следующее дело) больше не
            нужен. */}
        <form
          action={async (fd) => {
            setError(null);
            const result = await createTripTodo(tripId, fd);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setIsOpen(false);
            router.refresh();
          }}
          className="d-flex flex-column gap-3"
        >
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-text2`}>{t.trips.todos.newText}</label>
            <input id={`${uid}-text2`}
              name="text"
              required
              autoFocus
              placeholder={t.trips.todos.newPlaceholder}
              className="form-control"
            />
          </div>
          <div className="row g-2">
            <div className="col-7">
              <label className="form-label small text-secondary" htmlFor={`${uid}-date2`}>
                {t.trips.todos.dateOptional}
              </label>
              <DatePickerInput id={`${uid}-date2`} name="date" />
            </div>
            <div className="col-5">
              <label className="form-label small text-secondary" htmlFor={`${uid}-time2`}>{t.trips.todos.time}</label>
              <input id={`${uid}-time2`} type="time" name="time" className="form-control" />
            </div>
          </div>
          <ItemVisibilityField options={visibilityOptions} />
          {showShareToggle && (
            <label className="form-check d-flex align-items-center gap-2 mb-0">
              <input type="checkbox" name="editableByOthers" className="form-check-input m-0" />
              <span className="form-check-label small">
                {t.trips.todos.editableByOthersShort}
              </span>
            </label>
          )}
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary">
            {t.common.add}
          </button>
        </form>
      </Modal>
    </>
  );
}

/** Вкладка «Дела»: кнопка добавления + список (невыполненные сверху). */
export default function TripTodos({
  tripId,
  todos,
  canAdd,
  showShareToggle = false,
  visibilityOptions,
}: {
  tripId: string;
  todos: TodoData[];
  /** Может ли текущий юзер добавлять дела (участник с подпиской). */
  canAdd: boolean;
  showShareToggle?: boolean;
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();

  const sorted = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  return (
    <div style={{ maxWidth: "44rem" }}>
      {canAdd && (
        <div className="mb-3">
          <AddTripTodoButton
            tripId={tripId}
            showShareToggle={showShareToggle}
            visibilityOptions={visibilityOptions}
          />
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          emoji="📝"
          title={t.trips.todos.emptyTitle}
          hint={canAdd ? t.trips.todos.emptyHintOwn : t.trips.todos.emptyHintGuest}
          compact
        />
      ) : (
        <div className="d-flex flex-column gap-2">
          {sorted.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              showShareToggle={showShareToggle}
              visibilityOptions={visibilityOptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
