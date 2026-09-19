"use client";

import { useId, useState, useTransition } from "react";
import Modal from "@/components/Modal";
import TimeInput from "@/components/TimeInput";
import DatePickerInput from "@/components/DatePickerInput";
import FileDropzone from "@/components/FileDropzone";
import ConfirmForm from "@/components/ConfirmForm";
import { UserIcon, PencilIcon, TrashIcon, CheckIcon, PlusIcon } from "@/components/icons";
import {
  updateTripPersonalEvent,
  deleteTripPersonalEvent,
  togglePersonalEventAttendance,
  togglePersonalEventSeen,
  addPersonalEventDayPerformer,
} from "./actions";
import SeenToggle from "@/components/SeenToggle";
import LocationPickerField from "./LocationPickerField";
import PriceFields from "@/components/PriceFields";
import { performerHref } from "@/lib/performerSlug";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import { searchPerformersForList } from "@/app/(public)/artist-lists/actions";
import AppLink from "@/components/AppLink";
import { useLocale, useT } from "@/components/LocaleProvider";
import {
  ItemVisibilityBadge,
  ItemVisibilityField,
  type TripItemVisibilityValue,
} from "./TripItemVisibility";
import { shortMonthName, shortWeekdayName } from "@/lib/dates";

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
  /** Кто видит запись: только автор, участники, друзья автора или все,
   *  кому видна поездка. */
  visibility: TripItemVisibilityValue;
  // Ж11: показывать запись в блоке «Вы идёте» на главной.
  showOnHome: boolean;
  // Ж10: картинка к записи — скан билета, скрин брони, афиша.
  imageUrl: string | null;
  /** Ссылка «куда посмотреть»: бронь, страница мероприятия, карта.
   *  Только http(s) — проверено при сохранении. */
  url: string | null;
  // Артисты на событии: после даты события попадают в «видел(а)
  // вживую» — но только отметившимся «я там буду».
  /** Дни события с составом каждого (правка владельца 2026-09-18).
   *  Порядок — по дате; у записи без дней в базе (старые сиды) страница
   *  подставляет один день из startsAt. */
  days: {
    id: string;
    startsAt: Date;
    dateKey: string;
    timeValue: string;
    performers: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
    /** Кого из состава дня смотрящий отметил «видела здесь» (своя
     *  отметка, `TripPersonalEventSeen`, 2026-09-19). */
    seenPerformerIds: string[];
  }[];
  /** СВОЯ отметка «я там буду» смотрящего (у каждого участника своя). */
  attending: boolean;
  canEdit: boolean;
};

/** Форма создания/редактирования — общая для обеих модалок.
 *  showShareToggle — галочка «участники могут редактировать» (совместные
 *  поездки); в соло-поездке не показываем, чтобы не путать. */
export function PersonalEventFields({
  defaults,
  showShareToggle = false,
  visibilityOptions,
}: {
  defaults?: {
    title: string;
    note: string | null;
    /** Дни с составом; пусто — форма создания с одним пустым днём. */
    days?: {
      id: string | null;
      dateKey: string;
      timeValue: string;
      performers: { id: string; name: string; photoUrl?: string | null }[];
    }[];
    location?: { id: string; name: string } | null;
    editableByOthers?: boolean;
    visibility?: TripItemVisibilityValue;
    showOnHome?: boolean;
    imageUrl?: string | null;
    url?: string | null;
    attending?: boolean;
    /** Цена — она же строка в расходах поездки, если заполнена. */
    priceMinor?: number | null;
    priceCurrency?: "THB" | "RUB" | "BYN" | "USD" | null;
  };
  showShareToggle?: boolean;
  /** Что можно выбрать в «кто это видит» — уже урезано видимостью
   *  поездки (см. `itemVisibilityChoices`). */
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const uid = useId();
  // Дни — локальное состояние формы: ряд «дата · время · артисты» на
  // день, «+ Ещё день» добавляет ряд. Имена полей индексные по ПОЗИЦИИ
  // ряда (day-0-…), экшен читает их подряд, поэтому после удаления
  // ряда индексы пересчитываются сами при рендере.
  const [days, setDays] = useState<
    { key: number; id: string | null; dateKey: string; timeValue: string; performers: { id: string; name: string; photoUrl?: string | null }[] }[]
  >(() =>
    defaults?.days && defaults.days.length > 0
      ? defaults.days.map((d, i) => ({ key: i, ...d }))
      : [{ key: 0, id: null, dateKey: "", timeValue: "", performers: [] }],
  );
  const [nextKey, setNextKey] = useState(days.length);
  // Какие дни раскрыли поле артистов (по ключу ряда).
  const [openPerformers, setOpenPerformers] = useState<Set<number>>(() => new Set());
  return (
    <>
      <div>
        <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>{t.trips.personal.title}</label>
        <input id={`${uid}-title`}
          type="text"
          name="title"
          required
          autoFocus
          defaultValue={defaults?.title}
          placeholder={t.trips.personal.titlePlaceholder}
          className="form-control"
        />
      </div>
      {/* Дни события (правка владельца 2026-09-18): у каждого своя дата,
          время и состав. Один ряд — обычный ужин с актёром; три ряда —
          фестиваль, где каждый день выступают разные. Артисты выбираются
          общим комбобоксом с серверным поиском, уже выбранные приезжают
          options'ами, чтобы капсулы нарисовались сразу. */}
      <div className="d-flex flex-column gap-3">
        {days.map((day, i) => (
          <div key={day.key} className="personal-day">
            {days.length > 1 && (
              <div className="d-flex align-items-center justify-content-between mb-1">
                <span className="small text-secondary">{t.trips.personal.dayN(i + 1)}</span>
                <button
                  type="button"
                  className="btn-link-accent small"
                  onClick={() => setDays((prev) => prev.filter((_, j) => j !== i))}
                >
                  {t.trips.personal.removeDay}
                </button>
              </div>
            )}
            {day.id && <input type="hidden" name={`day-${i}-id`} value={day.id} />}
            <div className="row g-2">
              <div className="col-7">
                <label className="form-label small text-secondary" htmlFor={`${uid}-day-${i}-date`}>
                  {t.trips.personal.date}
                </label>
                <DatePickerInput
                  id={`${uid}-day-${i}-date`}
                  name={`day-${i}-date`}
                  required={i === 0}
                  defaultValue={day.dateKey || undefined}
                />
              </div>
              <div className="col-5">
                <label className="form-label small text-secondary" htmlFor={`${uid}-day-${i}-time`}>
                  {t.trips.personal.time}
                </label>
                <TimeInput id={`${uid}-day-${i}-time`} name={`day-${i}-time`} defaultValue={day.timeValue} />
              </div>
            </div>
            {/* Артисты — свёрнуты по умолчанию, как в админке (правка
                владельца 2026-09-18): у большинства записей состава нет,
                и поле только удлиняло форму. День с уже выбранными
                артистами открыт сразу. */}
            {day.performers.length > 0 || openPerformers.has(day.key) ? (
              <div className="mt-2">
                <label className="form-label small text-secondary" htmlFor={`${uid}-day-${i}-performers`}>
                  {t.trips.personal.performers}
                </label>
                <EntityMultiSelect
                  id={`${uid}-day-${i}-performers`}
                  name={`day-${i}-performerIds`}
                  options={day.performers}
                  defaultSelectedIds={day.performers.map((p) => p.id)}
                  placeholder={t.trips.personal.performersPlaceholder}
                  searchOptions={searchPerformersForList}
                />
              </div>
            ) : (
              <div className="mt-2">
                <button
                  type="button"
                  className="btn-link-accent small"
                  onClick={() => setOpenPerformers((prev) => new Set(prev).add(day.key))}
                >
                  {t.trips.personal.showPerformers}
                </button>
              </div>
            )}
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setDays((prev) => [...prev, { key: nextKey, id: null, dateKey: "", timeValue: "", performers: [] }]);
              setNextKey((k) => k + 1);
            }}
          >
            {t.trips.personal.addDay}
          </button>
        </div>
      </div>
      <LocationPickerField defaultLocation={defaults?.location} />
      {/* Цена: заполнили — строка сама появилась в расходах поездки
          (правка владельца 2026-09-16). Необязательная. */}
      <PriceFields priceMinor={defaults?.priceMinor} currency={defaults?.priceCurrency} />
      <div>
        <label className="form-label small text-secondary" htmlFor={`${uid}-note`}>{t.trips.personal.note}</label>
        <textarea id={`${uid}-note`} name="note" rows={2} defaultValue={defaults?.note ?? ""} className="form-control" />
      </div>
      {/* Ссылка на бронь, страницу мероприятия или точку на карте
          (просьба владельца 2026-09-10). type="url" — чтобы на телефоне
          открывалась подходящая клавиатура; пустое поле и мусор без
          http(s) просто не сохраняются, запись из-за них не теряется. */}
      <div>
        <label className="form-label small text-secondary" htmlFor={`${uid}-url`}>
          {t.trips.personal.url}
        </label>
        <input
          id={`${uid}-url`}
          name="url"
          type="url"
          inputMode="url"
          placeholder={t.trips.personal.urlPlaceholder}
          defaultValue={defaults?.url ?? ""}
          className="form-control"
        />
      </div>
      {/* Ж10: картинка к записи. Личные события приватные, поэтому файл
          уходит в приватное хранилище (/files/personal/…), а не в
          public/uploads. */}
      <FileDropzone
        name="imageUrl"
        label={t.trips.personal.image}
        defaultValue={defaults?.imageUrl ?? ""}
        accept="image/*,application/pdf"
        endpoint="/api/upload-personal"
      />
      {/* «Я там буду» — СВОЯ отметка, по умолчанию стоит (создала =
          собираюсь; для планов-кандидатов снимается). Артисты события
          идут в «видел(а) вживую» только отметившимся — и только после
          даты. */}
      <label className="form-check d-flex align-items-center gap-2 mb-0">
        <input
          type="checkbox"
          name="attending"
          defaultChecked={defaults?.attending ?? true}
          className="form-check-input m-0"
        />
        <span className="form-check-label small">{t.trips.personal.attending}</span>
      </label>
      {/* Ж11: галочка есть и в соло-, и в совместной поездке — это про
          мою главную, а не про доступ участников. */}
      <label className="form-check d-flex align-items-center gap-2 mb-0">
        <input
          type="checkbox"
          name="showOnHome"
          defaultChecked={defaults?.showOnHome ?? false}
          className="form-check-input m-0"
        />
        <span className="form-check-label small">{t.trips.personal.showOnHome}</span>
      </label>
      {/* Видимость записи — поле, а не галочка «приватное»: вариантов
          четыре, и они осмысленны и в соло-поездке (друзья и «все» видят
          её, если сама поездка им видна). */}
      <ItemVisibilityField
        defaultValue={defaults?.visibility ?? "PARTICIPANTS"}
        options={visibilityOptions}
      />
      {showShareToggle ? (
        <label className="form-check d-flex align-items-center gap-2 mb-0">
          <input
            type="checkbox"
            name="editableByOthers"
            defaultChecked={defaults?.editableByOthers ?? false}
            className="form-check-input m-0"
          />
          <span className="form-check-label small">
            {t.trips.personal.editableByOthers}
          </span>
        </label>
      ) : (
        // Без галочки сохраняем прежнее значение флага, иначе update
        // сбросил бы его (чекбокс в FormData отличим от «не показан»
        // только этим hidden).
        defaults?.editableByOthers && <input type="hidden" name="editableByOthers" value="on" />
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
  dayIndex = 0,
  canEdit = true,
  canAttend = false,
  showShareToggle = false,
  visibilityOptions,
}: {
  tripId: string;
  event: PersonalEventData;
  canEdit?: boolean;
  /** Участник поездки: может отметить «я там буду» с карточки. Гостю
   *  публичной поездки переключатель не показываем — прав нет. */
  canAttend?: boolean;
  showShareToggle?: boolean;
  visibilityOptions: readonly TripItemVisibilityValue[];
  /** Какой день события рисует эта карточка: в ленте поездки у
   *  многодневного события карточка на каждый день, со своей датой и
   *  составом. */
  dayIndex?: number;
}) {
  const t = useT();
  const locale = useLocale();
  const [isEditing, setIsEditing] = useState(false);
  const day = event.days[dayIndex] ?? event.days[0];
  const dayStartsAt = day?.startsAt ?? event.startsAt;
  const dayTime = day?.timeValue ?? event.timeValue;
  const dayPerformers = day?.performers ?? [];
  const seenIds = new Set(day?.seenPerformerIds ?? []);
  // Глазики — участнику поездки на ПРОШЕДШЕМ дне: до него отмечать
  // нечего, как и на афише. У записи без дней в базе (id пустой)
  // отметку положить некуда — сначала правка формой заведёт день.
  const canMarkSeen = canAttend && !!day?.id && dayStartsAt < new Date();
  const canAddPerformer = canAttend && !!day?.id;
  const [isAdding, setIsAdding] = useState(false);
  // Файл мог не открыться (удалён, нет прав) — тогда вместо битой
  // картинки показываем ссылку.
  const [thumbFailed, setThumbFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Дата записи «настенная» и лежит в UTC (см. lib/dates.ts), а дата-блок
  // читает локальные компоненты: у записи в 22:30 браузер в МСК рисовал
  // уже следующий день. Берём полдень тех же суток — в любой зоне это
  // остаётся тем же днём.
  const d = new Date(
    Date.UTC(
      dayStartsAt.getUTCFullYear(),
      dayStartsAt.getUTCMonth(),
      dayStartsAt.getUTCDate(),
      12,
    ),
  );
  const hasTime = dayTime !== "00:00";

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
      setError(t.trips.personal.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="event-card">
      {(canEdit || canAttend) && (
        <div className="corner-actions corner-actions-row">
          {canAttend && (
            <AttendanceToggle
              tripId={tripId}
              personalEventId={event.id}
              attending={event.attending}
              isPast={event.startsAt < new Date()}
            />
          )}
          {canEdit && (
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label={t.common.edit}
                title={t.common.edit}
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
                confirmMessage={t.trips.personal.deleteConfirm(event.title)}
              >
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  aria-label={t.common.delete}
                  title={t.common.delete}
                >
                  <TrashIcon />
                </button>
              </ConfirmForm>
            </>
          )}
        </div>
      )}

      <div className="event-card-date">
        <span className="event-card-day">{d.getDate()}</span>
        <span className="event-card-month">{shortMonthName(d, locale)}</span>
        <span className="event-card-weekday">{shortWeekdayName(d, locale)}</span>
      </div>

      {/* Ж10: миниатюра приложенной картинки — открывается по клику в
          новой вкладке (PDF тоже). Файл приватный, раздаётся через
          /files/personal/… с проверкой прав.

          Стоит СЛЕВА, между датой и текстом — там же, где постер у
          каталожного события (правка владельца 2026-09-10: «а тут фото
          специально снизу? надо бы выводить слева, как на других
          событиях»). Раньше лежала в конце текстового блока и
          получалась снизу. */}
      {event.imageUrl && (
        <a
          href={event.imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="personal-event-thumb flex-shrink-0"
          aria-label={t.trips.personal.attachmentOf(event.title)}
        >
          {event.imageUrl.endsWith(".pdf") || thumbFailed ? (
            // PDF миниатюрой не показать, а битая ссылка иначе
            // нарисовала бы иконку сломанной картинки. Заглушка — того
            // же размера, что и миниатюра, иначе строка бы прыгала.
            <span className="personal-event-thumb-file">{t.trips.personal.file}</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setThumbFailed(true)}
            />
          )}
        </a>
      )}

      <div className="event-card-body">
        {/* flex-wrap и min-width: 0 — на телефоне длинное название с
            бейджами и именем автора не переносилось и уносило страницу
            вбок на 20px (поймано 2026-09-19). .event-row-head — ради
            мобильного отступа под угловые кнопки: без него бейдж
            «личное» уезжал под галочку «я там буду». */}
        <h3 className="event-row-head h5 font-display mb-1 flex-wrap gap-2" style={{ minWidth: 0 }}>
          {event.title}
          <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.6rem" }}>
            {t.trips.personal.badge}
          </span>
          <ItemVisibilityBadge visibility={event.visibility} />
          {event.author && (
            <span className="small text-secondary fw-normal">{event.author}</span>
          )}
        </h3>
        <p className="small text-secondary mb-0">
          {hasTime && dayTime}
          {hasTime && (event.note || event.location) && " · "}
          {event.location && (
            <AppLink
              href={`/locations/${event.location.id}`}
              className="agenda-performer-link"
            >
              📍 {event.location.name}
            </AppLink>
          )}
          {event.location && event.note && " · "}
          {event.note}
        </p>
        {/* Ссылка отдельной строкой, а не в общей: адрес бывает длинным,
            и в одной строке с местом и заметкой он бы её порвал. */}
        {event.url && (
          <p className="small mb-0 text-truncate">
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="agenda-performer-link"
            >
              🔗 {t.trips.personal.urlOpen}
            </a>
          </p>
        )}
        {/* Многодневное: какой это день из скольких — карточка на каждый
            день стоит в своей дате ленты, и без подписи два «Фестиваля»
            читались бы как дубль. */}
        {event.days.length > 1 && (
          <p className="small text-secondary mb-0">
            {t.trips.personal.dayOf(dayIndex + 1, event.days.length)}
          </p>
        )}
        {/* Состав дня — общий список «кто был», а глазик у имени — СВОЯ
            отметка «видела здесь» (правка владельца 2026-09-19: в клубе
            были все, а видели разных). «+ Артист» — дописать того, кого
            видели сами; у остальных участников он отметится, только
            когда они сами нажмут глазик. */}
        {(dayPerformers.length > 0 || canAddPerformer) && (
          <div className="event-row-cast d-flex flex-wrap align-items-center gap-2 mb-0">
            {dayPerformers.length > 0 && <UserIcon className="icon-inline" />}
            {dayPerformers.map((p) => (
              <span key={p.id} className="personal-cast-chip">
                <AppLink href={performerHref(p)} className="agenda-performer-link">
                  {p.name}
                </AppLink>
                {canMarkSeen && (
                  <SeenToggle
                    eventId={day.id}
                    performerId={p.id}
                    initialSeen={seenIds.has(p.id)}
                    toggle={(dayId, performerId) => togglePersonalEventSeen(tripId, dayId, performerId)}
                    size="chip"
                  />
                )}
              </span>
            ))}
            {canAddPerformer && (
              <button type="button" className="btn-link-accent small" onClick={() => setIsAdding(true)}>
                {t.trips.personal.addPerformer}
              </button>
            )}
          </div>
        )}
      </div>

      {canAddPerformer && (
        <AddPerformerModal
          open={isAdding}
          onClose={() => setIsAdding(false)}
          tripId={tripId}
          dayId={day.id}
          excludeIds={dayPerformers.map((p) => p.id)}
        />
      )}

      <Modal
        open={isEditing}
        onClose={() => {
          setIsEditing(false);
          setError(null);
        }}
        title={t.trips.personal.editTitle}
      >
        <form action={handleUpdate} className="d-flex flex-column gap-3">
          <PersonalEventFields
            defaults={{
              title: event.title,
              note: event.note,
              days: event.days.map((dd) => ({
                id: dd.id,
                dateKey: dd.dateKey,
                timeValue: dd.timeValue !== "00:00" ? dd.timeValue : "",
                performers: dd.performers,
              })),
              location: event.location,
              editableByOthers: event.editableByOthers,
              visibility: event.visibility,
              showOnHome: event.showOnHome,
              imageUrl: event.imageUrl,
              url: event.url,
              attending: event.attending,
            }}
            showShareToggle={showShareToggle}
            visibilityOptions={visibilityOptions}
          />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t.trips.form.saving : t.common.save}
          </button>
        </form>
      </Modal>
    </div>
  );
}

/** «Я там буду» в углу карточки — зеркало иконки GoingButton с афиши
 *  (те же классы и подписи), но отметка живёт на личном событии.
 *  Оптимистично, как и там: галочка меняется по клику, откат при
 *  ошибке; проп с сервера пересинхронизирует при навигации. */
function AttendanceToggle({
  tripId,
  personalEventId,
  attending,
  isPast,
}: {
  tripId: string;
  personalEventId: string;
  attending: boolean;
  isPast: boolean;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState(attending);
  const [prevProp, setPrevProp] = useState(attending);
  if (attending !== prevProp) {
    setPrevProp(attending);
    setActive(attending);
  }
  const label = isPast
    ? active
      ? t.widgets.going.unwent
      : t.widgets.going.went
    : active
      ? t.widgets.going.notGoing
      : t.widgets.going.going;
  return (
    <button
      type="button"
      className={`round-icon-btn ${active ? "is-going" : ""}`}
      disabled={isPending}
      aria-pressed={active}
      aria-label={label}
      data-tooltip={label}
      onClick={() => {
        const next = !active;
        setActive(next);
        startTransition(async () => {
          const result = await togglePersonalEventAttendance(tripId, personalEventId).catch(
            () => ({ ok: false as const, error: "" }),
          );
          if (!result.ok) setActive(!next);
        });
      }}
    >
      {active ? <CheckIcon /> : <PlusIcon />}
    </button>
  );
}

/** «+ Артист» на карточке: поиск по каталогу, выбранный сразу
 *  дописывается в состав дня и отмечается «видела» у добавившего.
 *  Модалка не закрывается сама — можно добавить нескольких подряд. */
function AddPerformerModal({
  open,
  onClose,
  tripId,
  dayId,
  excludeIds,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  dayId: string;
  excludeIds: string[];
}) {
  const t = useT();
  const uid = useId();
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <Modal
      open={open}
      onClose={() => {
        setAdded([]);
        setError(null);
        onClose();
      }}
      title={t.trips.personal.addPerformerTitle}
    >
      <div className="d-flex flex-column gap-2">
        <label className="form-label small text-secondary mb-0" htmlFor={`${uid}-performer`}>
          {t.trips.personal.performers}
        </label>
        <EntityMultiSelect
          id={`${uid}-performer`}
          options={[]}
          placeholder={t.trips.personal.addPerformerPlaceholder}
          searchOptions={searchPerformersForList}
          excludeIds={[...excludeIds, ...added.map((a) => a.id)]}
          onPick={(option) => {
            setError(null);
            startTransition(async () => {
              const result = await addPersonalEventDayPerformer(tripId, dayId, option.id).catch(
                () => ({ ok: false as const, error: t.trips.personal.addFailed }),
              );
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setAdded((prev) => [...prev, { id: option.id, name: option.name }]);
            });
          }}
        />
        <p className="small text-secondary mb-0">{t.trips.personal.addPerformerHint}</p>
        {added.length > 0 && (
          <p className="small mb-0">
            ✓ {added.map((a) => a.name).join(", ")}
          </p>
        )}
        {error && <p className="small text-danger mb-0">{error}</p>}
        <div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setAdded([]);
              setError(null);
              onClose();
            }}
          >
            {t.ui.close}
          </button>
        </div>
      </div>
    </Modal>
  );
}
