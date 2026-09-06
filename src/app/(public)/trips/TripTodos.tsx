"use client";

import AppLink from "@/components/AppLink";
import type { TripTodoKind } from "@/generated/prisma/client";
import { useId, useRef, useState, useTransition } from "react";
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
  /** Какой список: дела, чемодан, покупки (АА10/АА11). */
  kind: TripTodoKind;
};

/** Строка дела: чекбокс + текст + дата + правка/удаление. Используется
 *  и во вкладке «Дела», и в хронологии «Мой план» (датированные,
 *  showDate — та же дата-колонка, что у событий). */
export function TodoRow({
  showKind = false,
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
  /** Показывать ли значок списка (чемодан/покупки). Нужен только в
   *  ЛЕНТЕ плана, где строка стоит вперемешку с событиями; внутри
   *  своего списка все строки и так одного вида. */
  showKind?: boolean;
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
        {/* В ленте плана датированная строка стоит вперемешку с
            событиями и делами, и по тексту «магниты маме» не понять,
            это дело или покупка — помечаем список значком (АА10/АА11).
            Внутри своего списка значок не нужен: там и так все свои. */}
        {showKind && todo.kind !== "TODO" && (
          <span
            className="me-1"
            title={todo.kind === "PACKING" ? t.trips.todos.lists.packing : t.trips.todos.lists.shopping}
          >
            {todo.kind === "PACKING" ? "🧳" : "🛍️"}
          </span>
        )}
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

/** Кнопка «+ Дело» с модалкой — живёт в общем ряду действий над
 *  вкладками (страница поездки), а не внутри вкладки «Дела»: добавить
 *  дело можно с любой вкладки, и второй такой кнопки на странице нет
 *  (просьба владельца). Раньше форма и вовсе висела на вкладке
 *  развёрнутой и занимала первый экран ещё до того, как человек решил
 *  что-то добавить. */
export function AddTripTodoButton({
  tripId,
  kind = "TODO",
  showShareToggle = false,
  visibilityOptions,
}: {
  tripId: string;
  /** В какой список добавляем — от него зависят подпись кнопки,
   *  заголовок окна, подсказка в поле и видимость по умолчанию. */
  kind?: TripTodoKind;
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
        {/* Подпись постоянная: раньше она менялась вслед за сегментом
            («+ Дело» / «+ Вещь»), и кнопка «дёргалась» под курсором. */}
        {t.trips.todos.lists.withDate}
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={
          kind === "PACKING"
            ? t.trips.todos.lists.addPackingTitle
            : kind === "SHOPPING"
              ? t.trips.todos.lists.addShoppingTitle
              : t.trips.todos.addTitle
        }
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
            {/* Список едет полем формы: серверное действие не знает,
                какая вкладка была открыта. */}
            <input type="hidden" name="kind" value={kind} />
            <input id={`${uid}-text2`}
              name="text"
              required
              autoFocus
              placeholder={
                kind === "PACKING"
                  ? t.trips.todos.lists.packingPlaceholder
                  : kind === "SHOPPING"
                    ? t.trips.todos.lists.shoppingPlaceholder
                    : t.trips.todos.newPlaceholder
              }
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
          {/* Чемодан по умолчанию приватный: в совместной поездке он у
              каждого свой, и «мои лекарства» соседке по номеру не
              нужны. Покупками, наоборот, делятся. */}
          <ItemVisibilityField
            options={visibilityOptions}
            defaultValue={kind === "PACKING" ? "PRIVATE" : "PARTICIPANTS"}
          />
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

/** Вкладка «Дела»: список (невыполненные сверху). Кнопка добавления
 *  живёт в общем ряду действий над вкладками — здесь её нет. */
/**
 * Быстрый ввод прямо в списке: поле и «+», Enter добавляет и оставляет
 * фокус на месте — чемодан набивают десятком строк подряд, и открывать
 * ради каждой модалку было мучением (правка владельца 2026-09-06).
 * Дата, видимость и «могут править другие» остаются в правке пункта и
 * в кнопке «С датой…» рядом.
 */
function TripTodoQuickAdd({
  tripId,
  kind,
}: {
  tripId: string;
  kind: TripTodoKind;
}) {
  const t = useT();
  const l = t.trips.todos.lists;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const placeholder =
    kind === "PACKING" ? l.quickAddPacking : kind === "SHOPPING" ? l.quickAddShopping : l.quickAddTodo;

  function add() {
    const value = text.trim();
    if (!value || pending) return;
    setError(null);
    // Список очищаем сразу: строка появится после refresh, а поле
    // должно быть готово к следующей вещи немедленно.
    setText("");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("text", value);
      fd.set("kind", kind);
      // Чемодан у каждого свой; остальное — как обычные записи.
      fd.set("visibility", kind === "PACKING" ? "PRIVATE" : "PARTICIPANTS");
      const result = await createTripTodo(tripId, fd);
      if (!result.ok) {
        setError(result.error);
        setText(value);
        return;
      }
      router.refresh();
      inputRef.current?.focus();
    });
  }

  return (
    <div className="trip-quick-add">
      <div className="d-flex align-items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="form-control"
          placeholder={placeholder}
          aria-label={l.quickAddAria}
        />
        <button
          type="button"
          className="btn btn-primary flex-shrink-0"
          onClick={add}
          disabled={pending || !text.trim()}
          aria-label={l.quickAddAria}
        >
          +
        </button>
      </div>
      {error && <p className="small text-danger mb-0 mt-1">{error}</p>}
    </div>
  );
}

export default function TripTodos({
  todos,
  tripId,
  activeList = "TODO",
  segments = [],
  canAdd,
  showShareToggle = false,
  visibilityOptions,
}: {
  tripId: string;
  todos: TodoData[];
  /** Открытый список — он же решает вид пустого состояния. */
  activeList?: TripTodoKind;
  /** Переключатель списков: адрес, сколько всего и сколько собрано.
   *  Считает страница — она видит все три списка сразу. */
  segments?: { kind: TripTodoKind; href: string; total: number; done: number }[];
  /** Может ли текущий юзер добавлять дела (участник с подпиской) —
   *  от этого зависит только подсказка в пустом состоянии. */
  canAdd: boolean;
  showShareToggle?: boolean;
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const l = t.trips.todos.lists;
  const segmentLabel = (kind: TripTodoKind) =>
    kind === "PACKING" ? l.packing : kind === "SHOPPING" ? l.shopping : l.todo;
  // Пустая вкладка говорит про СВОЙ список: «чемодан пуст» вместо
  // общего «дел пока нет».
  const empty =
    activeList === "PACKING"
      ? { emoji: "🧳", title: l.packingEmptyTitle, own: l.packingEmptyOwn }
      : activeList === "SHOPPING"
        ? { emoji: "🛍️", title: l.shoppingEmptyTitle, own: l.shoppingEmptyOwn }
        : { emoji: "📝", title: t.trips.todos.emptyTitle, own: t.trips.todos.emptyHintOwn };

  const sorted = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  return (
    <div style={{ maxWidth: "44rem" }}>
      {/* Что это за вкладка вообще — одной строкой: «Списки» ни о чём
          не говорили (правка владельца 2026-09-06). */}
      <p className="small text-secondary mb-3">{l.hint}</p>

      {/* Три списка одной вкладки — сегментами, а не тремя вкладками
          верхнего ряда: там уже четыре, и «Чемодан» с «Покупками»
          рядом с «Афишей» смотрелись бы как равные ей разделы. У
          чемодана и покупок в сегменте видно, сколько собрано. */}
      {segments.length > 1 && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          {segments.map((segment) => (
            <AppLink
              key={segment.kind}
              href={segment.href}
              prefetch={false}
              className={`btn btn-sm ${
                segment.kind === activeList ? "btn-primary" : "btn-ghost"
              }`}
            >
              {segmentLabel(segment.kind)}
              {segment.total > 0 && (
                <span className="ms-2 small opacity-75">
                  {l.progress(segment.done, segment.total)}
                </span>
              )}
            </AppLink>
          ))}
        </div>
      )}
      {/* Добавление живёт ВНУТРИ списка, а не в ряду над вкладками:
          там кнопка «+ Дело» стояла в отрыве от того, куда добавляет, и
          меняла подпись при переключении сегментов. */}
      {canAdd && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <div className="flex-fill" style={{ minWidth: "16rem" }}>
            <TripTodoQuickAdd tripId={tripId} kind={activeList} />
          </div>
          <AddTripTodoButton
            tripId={tripId}
            kind={activeList}
            showShareToggle={showShareToggle}
            visibilityOptions={visibilityOptions}
          />
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          emoji={empty.emoji}
          title={empty.title}
          hint={canAdd ? empty.own : t.trips.todos.emptyHintGuest}
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
