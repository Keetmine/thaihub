"use client";

import type { TripTodoKind } from "@/generated/prisma/client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import TimeInput from "@/components/TimeInput";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import ConfirmForm from "@/components/ConfirmForm";
import PriceFields from "@/components/PriceFields";
import { formatMoney } from "@/lib/tripMoney";
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
  /** Цена — только у покупок. В расходы поездки уходит, когда пункт
   *  отмечен купленным: список покупок это хотелки. */
  priceMinor?: number | null;
  priceCurrency?: "THB" | "RUB" | "BYN" | "USD" | null;
  /** Описание и ссылка — только у дел (правка владельца 2026-09-16). */
  note?: string | null;
  url?: string | null;
};

/**
 * Подписи по виду списка: у покупки в заголовке правки стояло «дело», а
 * поле называлось «Что сделать» (жалоба владельца 2026-09-22). Дела
 * остаются как были, у чемодана и покупок — свои слова.
 */
function kindLabels(t: ReturnType<typeof useT>, kind: TripTodoKind) {
  const l = t.trips.todos.lists;
  if (kind === "SHOPPING") {
    return {
      editTitle: l.editShoppingTitle,
      text: l.textShopping,
      deleteConfirm: l.deleteShoppingConfirm,
      urlLabel: l.shopUrl,
      noteLabel: l.noteLabel,
    };
  }
  if (kind === "PACKING") {
    return {
      editTitle: l.editPackingTitle,
      text: l.textPacking,
      deleteConfirm: l.deletePackingConfirm,
      urlLabel: t.trips.todos.url,
      noteLabel: l.noteLabel,
    };
  }
  return {
    editTitle: t.trips.todos.editTitle,
    text: t.trips.todos.text,
    deleteConfirm: t.trips.todos.deleteConfirm,
    urlLabel: t.trips.todos.url,
    noteLabel: t.trips.todos.note,
  };
}

/** Заметка и ссылка есть у дел и у ПОКУПОК (правка владельца
 *  2026-09-22: «в покупках нужно поле с заметкой и ссылкой на шоп»). У
 *  чемодана их нет: «взять переходник» описывать нечем. */
function hasNoteAndUrl(kind: TripTodoKind): boolean {
  return kind === "TODO" || kind === "SHOPPING";
}

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
  const labels = kindLabels(t, todo.kind);
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
            title={
              todo.kind === "PACKING"
                ? t.trips.detail.tabPacking(0).replace(/\s*\(0\)$/, "")
                : t.trips.detail.tabShopping(0).replace(/\s*\(0\)$/, "")
            }
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
        {/* Ссылка — иконкой сразу за текстом, а не отдельной строкой:
            она есть у немногих дел, и своя строка раздувала бы список.
            rel/noreferrer обязательны: ссылку вводит участник поездки,
            и открывать чужой адрес с доступом к нашей вкладке нельзя. */}
        {todo.url && (
          <a
            href={todo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ms-2 small"
            title={t.trips.todos.openLink}
            aria-label={t.trips.todos.openLink}
          >
            🔗
          </a>
        )}
        {/* Описание — строкой под делом, приглушённо: это пояснение, а
            не сам пункт. */}
        {todo.note && (
          <span className="d-block small text-secondary" style={{ whiteSpace: "pre-wrap" }}>
            {todo.note}
          </span>
        )}
      </span>
      {/* Цена покупки — прямо в строке (правка владельца 2026-09-22):
          без неё список хотелок ничего не говорит о бюджете, а открывать
          правку ради одной цифры незачем. */}
      {todo.priceMinor != null && todo.priceCurrency && (
        <span className={`small flex-shrink-0 ${todo.done ? "text-secondary" : ""}`}>
          {formatMoney(todo.priceMinor, todo.priceCurrency, locale)}
        </span>
      )}
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
            confirmMessage={labels.deleteConfirm}
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
        title={labels.editTitle}
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
            <label className="form-label small text-secondary" htmlFor={`${uid}-text`}>{labels.text}</label>
            <input id={`${uid}-text`} name="text" required defaultValue={todo.text} className="form-control" />
          </div>
          {/* Цена — только у ПОКУПОК (правка владельца 2026-09-16):
              «взять переходник» на сумму не назначают, а у дела цены не
              бывает. У остальных списков поля нет вовсе, и прежнее
              значение им записать неоткуда. */}
          {todo.kind === "SHOPPING" && (
            <PriceFields priceMinor={todo.priceMinor} currency={todo.priceCurrency} />
          )}
          {/* Описание и ссылка — у дел и покупок (правки владельца
              2026-09-16 и 2026-09-22): «записаться в визовый центр» без
              ссылки на запись — половина дела, а у покупки заметка про
              размер и адрес магазина нужна не меньше. У чемодана полей
              нет: «взять переходник» описывать нечем. */}
          {hasNoteAndUrl(todo.kind) && (
            <>
              <div>
                <label className="form-label small text-secondary" htmlFor={`${uid}-note`}>
                  {labels.noteLabel}
                </label>
                <textarea
                  id={`${uid}-note`}
                  name="note"
                  rows={2}
                  defaultValue={todo.note ?? ""}
                  className="form-control"
                />
              </div>
              <div>
                <label className="form-label small text-secondary" htmlFor={`${uid}-url`}>
                  {labels.urlLabel}
                </label>
                {/* type="url" — чтобы на телефоне открывалась подходящая
                    клавиатура; мусор без http(s) просто не сохраняется,
                    запись из-за него не теряется. */}
                <input
                  id={`${uid}-url`}
                  name="url"
                  type="url"
                  inputMode="url"
                  defaultValue={todo.url ?? ""}
                  placeholder={t.trips.todos.urlPlaceholder}
                  className="form-control"
                />
              </div>
            </>
          )}
          {/* Даты — только у дел: датированное дело уходит в ленту
              плана, а «взять переходник» на число не назначают (правка
              владельца 2026-09-06). У старых записей чемодана дата
              могла остаться — форма её не показывает, но и не стирает:
              скрытые поля сохраняют, что было. */}
          {todo.kind === "TODO" ? (
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
                <TimeInput id={`${uid}-time`} name="time" defaultValue={timeLabel ?? ""} />
              </div>
            </div>
          ) : (
            <>
              <input type="hidden" name="date" value={todo.date ? todo.date.slice(0, 10) : ""} />
              <input type="hidden" name="time" value={timeLabel ?? ""} />
            </>
          )}
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
  variant = "button",
  label,
}: {
  tripId: string;
  /** В какой список добавляем — от него зависят подпись кнопки,
   *  заголовок окна, подсказка в поле и видимость по умолчанию. */
  kind?: TripTodoKind;
  showShareToggle?: boolean;
  visibilityOptions: readonly TripItemVisibilityValue[];
  /** «link» — тихая ссылка под быстрым вводом: там рядом уже есть своя
   *  кнопка «Добавить», и вторая такая же сбивала бы прицел. */
  variant?: "button" | "link";
  /** Подпись вместо стандартной — у ссылки она объясняет, чем этот
   *  способ отличается от быстрого ввода. */
  label?: string;
}) {
  const uid = useId();
  const t = useT();
  const addLabels = kindLabels(t, kind);
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={variant === "link" ? "btn-link-accent small" : "btn btn-ghost btn-sm"}
        onClick={() => setIsOpen(true)}
      >
        {/* В общем ряду над вкладками эта кнопка — единственный способ
            завести ДЕЛО, и зовётся она по своему списку. Внутри
            чемодана и покупок рядом уже стоит быстрый ввод, и кнопка
            там — про то, чего он не умеет: цену, заметку и ссылку. */}
        {label ?? (kind === "TODO" ? t.trips.todos.addButton : t.trips.todos.lists.addButton)}
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
            <label className="form-label small text-secondary" htmlFor={`${uid}-text2`}>
              {kind === "TODO" ? t.trips.todos.newText : addLabels.text}
            </label>
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
          {/* См. выше: дата есть только у дел. */}
          {kind === "TODO" && (
            <div className="row g-2">
              <div className="col-7">
                <label className="form-label small text-secondary" htmlFor={`${uid}-date2`}>
                  {t.trips.todos.dateOptional}
                </label>
                <DatePickerInput id={`${uid}-date2`} name="date" />
              </div>
              <div className="col-5">
                <label className="form-label small text-secondary" htmlFor={`${uid}-time2`}>{t.trips.todos.time}</label>
                <TimeInput id={`${uid}-time2`} name="time" />
              </div>
            </div>
          )}
          {/* У покупки — цена, заметка и ссылка на магазин (правка
              владельца 2026-09-22). Раньше цену можно было поставить
              только быстрым вводом или потом в правке. */}
          {kind === "SHOPPING" && <PriceFields />}
          {hasNoteAndUrl(kind) && (
            <>
              <div>
                <label className="form-label small text-secondary" htmlFor={`${uid}-note2`}>
                  {addLabels.noteLabel}
                </label>
                <textarea id={`${uid}-note2`} name="note" rows={2} className="form-control" />
              </div>
              <div>
                <label className="form-label small text-secondary" htmlFor={`${uid}-url2`}>
                  {addLabels.urlLabel}
                </label>
                <input
                  id={`${uid}-url2`}
                  name="url"
                  type="url"
                  placeholder={t.trips.todos.urlPlaceholder}
                  className="form-control"
                />
              </div>
            </>
          )}
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
 * Быстрый ввод для ЧЕМОДАНА: название, «кто это видит» селектом и «+».
 * Enter добавляет и оставляет фокус на месте — такой список набивают
 * десятком строк подряд (правки владельца 2026-09-06). У покупок
 * быстрого ввода больше нет (правка владельца 2026-09-22): там к
 * названию почти всегда прилагаются цена, заметка и ссылка на магазин,
 * и строка всё равно отправляла за ними в форму.
 *
 * Даты здесь нет намеренно: «взять переходник» и «купить магниты» — это
 * не дела на число, и поле только мешало бы. У списка ДЕЛ дата
 * осталась: датированное дело уходит в ленту плана.
 *
 * Видимость — select, а не радио-группа как в модалке: в одну строку с
 * полем ввода четыре варианта с подсказками не поместятся, а выбирают
 * здесь между «только я» и «участники» на автомате.
 */
function TripTodoQuickAdd({
  tripId,
  visibilityOptions,
}: {
  tripId: string;
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const kind: TripTodoKind = "PACKING";
  const t = useT();
  const l = t.trips.todos.lists;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  // Чемодан у каждого свой — но выбранное человеком держится до конца
  // сессии ввода: подряд заводят однотипные строки.
  const preferred: TripItemVisibilityValue = "PRIVATE";
  const [visibility, setVisibility] = useState<TripItemVisibilityValue>(
    visibilityOptions.includes(preferred) ? preferred : (visibilityOptions[0] ?? "PARTICIPANTS"),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    const value = text.trim();
    if (!value || pending) return;
    setError(null);
    // Поле очищаем сразу: строка появится после refresh, а вводить
    // следующую вещь можно уже сейчас.
    setText("");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("text", value);
      fd.set("kind", kind);
      fd.set("visibility", visibility);
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
    <div className="mb-3">
      <div className="d-flex flex-wrap flex-sm-nowrap align-items-center gap-2">
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
          className="form-control flex-fill"
          style={{ minWidth: "12rem" }}
          placeholder={l.quickAddPacking}
          aria-label={l.quickAddAria}
        />
        {visibilityOptions.length > 1 && (
          <select
            className="form-select flex-shrink-0"
            style={{ width: "auto" }}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as TripItemVisibilityValue)}
            aria-label={t.trips.itemVisibility.label}
          >
            {visibilityOptions.map((option) => (
              <option key={option} value={option}>
                {t.trips.itemVisibility.options[option]}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn btn-primary flex-shrink-0"
          onClick={add}
          disabled={pending || !text.trim()}
        >
          {t.common.add}
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
  canAdd,
  showShareToggle = false,
  visibilityOptions,
}: {
  tripId: string;
  todos: TodoData[];
  /** Открытый список — он же решает вид пустого состояния. */
  activeList?: TripTodoKind;
  /** Может ли текущий юзер добавлять дела (участник с подпиской) —
   *  от этого зависит только подсказка в пустом состоянии. */
  canAdd: boolean;
  showShareToggle?: boolean;
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const l = t.trips.todos.lists;
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
    // Во всю ширину колонки (правка владельца 2026-09-06): у чемодана
    // строки короткие, и узкая колонка гнала список в длинную простыню.
    <div>
      {/* Сколько готово — только у чемодана и покупок: в списке дел
          «собрано 2 из 5» звучало бы про вещи. Слово тоже по списку:
          вещи собирают, покупки покупают. */}
      {/* «Собрано N из M» у чемодана стоит над строкой быстрого ввода:
          та занимает всю ширину, рядом с ней места нет. У покупок
          счётчик уехал в один ряд с кнопкой, справа (правка владельца
          2026-09-22). */}
      {activeList === "PACKING" && sorted.length > 0 && (
        <p className="small text-secondary mb-3">
          {l.progressPacking(sorted.filter((item) => item.done).length, sorted.length)}
        </p>
      )}
      {/* Чемодан набивается строкой быстрого ввода прямо здесь: там
          пункты короткие и заводят их десятками подряд. У покупок
          быстрого ввода больше НЕТ (правка владельца 2026-09-22: «все
          покупки добавлять через кнопку и попап») — у покупки, кроме
          названия, обычно есть цена, заметка и ссылка на магазин, и
          строка ввода всё равно отправляла за ними в форму. Дела
          заводятся общей кнопкой над вкладками: их создают и с плана, и
          из «Что посетить» (правки владельца 2026-09-06). */}
      {canAdd && activeList === "PACKING" && (
        <TripTodoQuickAdd tripId={tripId} visibilityOptions={visibilityOptions} />
      )}
      {/* Единственный способ завести покупку — эта кнопка: в попапе
          сразу цена, заметка и ссылка на магазин. */}
      {activeList === "SHOPPING" && (canAdd || sorted.length > 0) && (
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          {canAdd ? (
            <AddTripTodoButton
              tripId={tripId}
              kind="SHOPPING"
              showShareToggle={showShareToggle}
              visibilityOptions={visibilityOptions}
            />
          ) : (
            <span />
          )}
          {sorted.length > 0 && (
            <span className="small text-secondary">
              {l.progressShopping(sorted.filter((item) => item.done).length, sorted.length)}
            </span>
          )}
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
