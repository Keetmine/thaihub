"use client";

import { useId, useState } from "react";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import FileDropzone from "@/components/FileDropzone";
import ConfirmForm from "@/components/ConfirmForm";
import { UserIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { updateTripPersonalEvent, deleteTripPersonalEvent } from "./actions";
import LocationPickerField from "./LocationPickerField";
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
  // Артисты на событии: после даты события попадают в «видел(а)
  // вживую» создателя записи.
  performers: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
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
    dateKey: string;
    timeValue: string;
    location?: { id: string; name: string } | null;
    performers?: { id: string; name: string; photoUrl?: string | null }[];
    editableByOthers?: boolean;
    visibility?: TripItemVisibilityValue;
    showOnHome?: boolean;
    imageUrl?: string | null;
  };
  showShareToggle?: boolean;
  /** Что можно выбрать в «кто это видит» — уже урезано видимостью
   *  поездки (см. `itemVisibilityChoices`). */
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const uid = useId();
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
      <div className="row g-2">
        <div className="col-7">
          <label className="form-label small text-secondary" htmlFor={`${uid}-date`}>{t.trips.personal.date}</label>
          <DatePickerInput id={`${uid}-date`} name="date" required defaultValue={defaults?.dateKey} />
        </div>
        <div className="col-5">
          <label className="form-label small text-secondary" htmlFor={`${uid}-time`}>{t.trips.personal.time}</label>
          <input id={`${uid}-time`}
            type="time"
            name="time"
            defaultValue={defaults?.timeValue}
            className="form-control"
          />
        </div>
      </div>
      <LocationPickerField defaultLocation={defaults?.location} />
      <div>
        <label className="form-label small text-secondary" htmlFor={`${uid}-performers`}>
          {t.trips.personal.performers}
        </label>
        <p className="small text-secondary mb-1" style={{ opacity: 0.75 }}>
          {t.trips.personal.performersHint}
        </p>
        {/* Каталог артистов не приезжает пропсом (их тысячи) — общий
            комбобокс ищет на сервере по мере ввода; уже выбранные
            приходят options'ами, чтобы капсулы нарисовались сразу. */}
        <EntityMultiSelect
          id={`${uid}-performers`}
          name="performerIds"
          options={defaults?.performers ?? []}
          defaultSelectedIds={(defaults?.performers ?? []).map((p) => p.id)}
          placeholder={t.trips.personal.performersPlaceholder}
          searchOptions={searchPerformersForList}
        />
      </div>
      <div>
        <label className="form-label small text-secondary" htmlFor={`${uid}-note`}>{t.trips.personal.note}</label>
        <textarea id={`${uid}-note`} name="note" rows={2} defaultValue={defaults?.note ?? ""} className="form-control" />
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
  canEdit = true,
  showShareToggle = false,
  visibilityOptions,
}: {
  tripId: string;
  event: PersonalEventData;
  canEdit?: boolean;
  showShareToggle?: boolean;
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const locale = useLocale();
  const [isEditing, setIsEditing] = useState(false);
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
      event.startsAt.getUTCFullYear(),
      event.startsAt.getUTCMonth(),
      event.startsAt.getUTCDate(),
      12,
    ),
  );
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
      setError(t.trips.personal.saveFailed);
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
        </div>
      )}

      <div className="event-card-date">
        <span className="event-card-day">{d.getDate()}</span>
        <span className="event-card-month">{shortMonthName(d, locale)}</span>
        <span className="event-card-weekday">{shortWeekdayName(d, locale)}</span>
      </div>

      <div className="event-card-body">
        <h3 className="h5 font-display mb-1 d-flex align-items-center gap-2">
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
          {hasTime && event.timeValue}
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
        {event.performers.length > 0 && (
          <p className="event-row-cast mb-0">
            <UserIcon className="icon-inline" />{" "}
            {event.performers.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <AppLink href={performerHref(p)} className="agenda-performer-link">
                  {p.name}
                </AppLink>
              </span>
            ))}
          </p>
        )}
        {/* Ж10: миниатюра приложенной картинки — открывается по клику
            в новой вкладке (PDF тоже). Файл приватный, раздаётся через
            /files/personal/… с проверкой прав. */}
        {event.imageUrl && (
          <a
            href={event.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="personal-event-thumb mt-2 d-inline-block"
            aria-label={t.trips.personal.attachmentOf(event.title)}
          >
            {event.imageUrl.endsWith(".pdf") || thumbFailed ? (
              // PDF миниатюрой не показать, а битая ссылка иначе
              // нарисовала бы иконку сломанной картинки.
              <span className="btn btn-ghost btn-sm">{t.trips.personal.file}</span>
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
      </div>

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
              dateKey: event.dateKey,
              timeValue: hasTime ? event.timeValue : "",
              location: event.location,
              editableByOthers: event.editableByOthers,
              visibility: event.visibility,
              showOnHome: event.showOnHome,
              imageUrl: event.imageUrl,
              performers: event.performers,
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
