"use client";

import { useState, useTransition } from "react";
import Modal from "@/components/Modal";
import CastGrid from "@/components/CastGrid";
import EntityMiniCard from "@/components/EntityMiniCard";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import SeenToggle from "@/components/SeenToggle";
import AppLink from "@/components/AppLink";
import {
  CheckIcon,
  PlusIcon,
  PencilIcon,
  UsersIcon,
  CalendarIcon,
  PinIcon,
} from "@/components/icons";
import { searchPerformersForList } from "@/app/(public)/artist-lists/actions";
import { performerHref } from "@/lib/performerSlug";
import { formatDayLongMonth, shortWeekdayName } from "@/lib/dates";
import { useLocale, useT } from "@/components/LocaleProvider";
import { ItemVisibilityBadge } from "./TripItemVisibility";
import {
  togglePersonalEventAttendance,
  togglePersonalEventSeen,
  addPersonalEventDayPerformer,
} from "./actions";
import type { PersonalEventData } from "./PersonalEventCard";

/**
 * Личное событие в попапе — «как обычный евент» (правка владельца
 * 2026-09-19: «строка становится очень длинной и некрасивой»). В ленте
 * поездки остаётся короткая строка, а весь состав, глазики «видела
 * здесь» и «+ Артист» живут здесь, в фото-капсулах того же вида, что
 * состав на странице события афиши.
 *
 * Отдельной страницы у личного события нет и не будет: запись
 * приватная, живёт внутри поездки, и адрес на неё вёл бы в никуда для
 * всех, кроме участников.
 */
export default function PersonalEventDetails({
  open,
  onClose,
  tripId,
  event,
  dayIndex,
  canAttend,
  canEdit,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  event: PersonalEventData;
  /** Какой день многодневной записи открыт — тот же, что у карточки. */
  dayIndex: number;
  /** Участник поездки: может отмечать «я там буду», глазики и артистов. */
  canAttend: boolean;
  canEdit: boolean;
  /** Открыть форму правки вместо попапа (кнопка «Редактировать»). */
  onEdit: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const day = event.days[dayIndex] ?? event.days[0];
  const dayStartsAt = day?.startsAt ?? event.startsAt;
  const dayTime = day?.timeValue ?? event.timeValue;
  const hasTime = dayTime !== "00:00";
  const performers = day?.performers ?? [];
  const seenIds = new Set(day?.seenPerformerIds ?? []);
  // Глазики — как на афише: только участнику и только на ПРОШЕДШЕМ дне.
  // У записи без дней в базе (старые сиды) id пустой, отметку положить
  // некуда — сначала правка формой заведёт день.
  const canMarkSeen = canAttend && !!day?.id && dayStartsAt < new Date();
  const canAddPerformer = canAttend && !!day?.id;
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Дата «настенная» и лежит в UTC (см. lib/dates.ts), а день недели
  // читает локальные компоненты — берём полдень тех же суток, как в
  // дата-блоке карточки.
  const noon = new Date(
    Date.UTC(dayStartsAt.getUTCFullYear(), dayStartsAt.getUTCMonth(), dayStartsAt.getUTCDate(), 12),
  );
  // Обложка — только картинка, которая открылась: PDF постером не
  // показать, а битый файл убираем совсем, как миниатюру в строке.
  const [heroFailed, setHeroFailed] = useState(false);
  const hasCover = !!event.imageUrl && !event.imageUrl.endsWith(".pdf") && !heroFailed;

  return (
    <Modal open={open} onClose={onClose} title={event.title} wide titleHidden>
      <div className="personal-event-modal">
        {/* Шапка-обложка: вложение размыто подложкой на всю ширину
            панели и чётким постером слева, как афиша концерта; без
            вложения остаётся тихий градиент. Вложение отдельной ссылкой
            не открывается (правка владельца 2026-09-19: «Открыть
            вложение — убираем»). */}
        <div className={`pe-hero ${hasCover ? "pe-hero--cover" : ""}`}>
          {hasCover && (
            <>
              <div className="pe-hero-bg" style={{ backgroundImage: `url(${event.imageUrl})` }} />
              <div className="pe-hero-shade" />
            </>
          )}
          {hasCover && (
            <div className="pe-poster">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.imageUrl!} alt="" onError={() => setHeroFailed(true)} />
            </div>
          )}
          <div className="pe-hero-body">
            <h2 className="pe-title display-1-tight mb-2">{event.title}</h2>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.6rem" }}>
                {t.trips.personal.badge}
              </span>
              <ItemVisibilityBadge visibility={event.visibility} />
              {event.author && <span className="small text-secondary">{event.author}</span>}
            </div>
            <div className="pe-chips mb-3">
              <span className="date-chip">
                <CalendarIcon className="icon-inline" />{" "}
                {formatDayLongMonth(dayStartsAt, locale)}, {shortWeekdayName(noon, locale)}
                {hasTime && ` · ${dayTime}`}
              </span>
              {event.days.length > 1 && (
                <span className="date-chip">{t.trips.personal.dayOf(dayIndex + 1, event.days.length)}</span>
              )}
              {event.location && (
                <AppLink
                  href={`/locations/${event.location.id}`}
                  className="date-chip text-decoration-none"
                >
                  <PinIcon className="icon-inline" /> {event.location.name}
                </AppLink>
              )}
              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="date-chip text-decoration-none"
                >
                  {t.trips.personal.urlOpen} ↗
                </a>
              )}
            </div>
            {(canAttend || canEdit) && (
              <div className="d-flex flex-wrap gap-2">
                {canAttend && (
                  <AttendanceToggle
                    tripId={tripId}
                    personalEventId={event.id}
                    attending={event.attending}
                    isPast={event.startsAt < new Date()}
                    variant="button"
                  />
                )}
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
                    onClick={onEdit}
                  >
                    <PencilIcon /> {t.common.edit}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {event.note && <p className="pe-note text-secondary mb-0">{event.note}</p>}

        {/* Состав дня — общий список «кто был», а глазик на углу фото —
            СВОЯ отметка «видела здесь» (в клубе были все, а видели
            разных). Те же капсулы и тот же .cast-chip-seen, что на
            странице события афиши. */}
        <h3 className="section-heading mb-3">
          <UsersIcon className="icon-inline" /> {t.trips.personal.performers}
        </h3>
        {performers.length > 0 ? (
          <CastGrid chips>
            {performers.map((p) => (
              <span key={p.id} className="cast-chip-seen">
                <EntityMiniCard href={performerHref(p)} photoUrl={p.photoUrl} name={p.name} />
                {canMarkSeen && (
                  <SeenToggle
                    eventId={day.id}
                    performerId={p.id}
                    initialSeen={seenIds.has(p.id)}
                    toggle={(dayId, performerId) =>
                      togglePersonalEventSeen(tripId, dayId, performerId)
                    }
                    size="chip"
                  />
                )}
              </span>
            ))}
          </CastGrid>
        ) : (
          <p className="small text-secondary mb-0">{t.trips.personal.noPerformers}</p>
        )}

        {canAddPerformer && (
          <div className="mt-3">
            {isAdding ? (
              <div style={{ maxWidth: "24rem" }}>
                <EntityMultiSelect
                  options={[]}
                  placeholder={t.trips.personal.addPerformerPlaceholder}
                  searchOptions={searchPerformersForList}
                  excludeIds={performers.map((p) => p.id)}
                  inputClassName="form-control-sm"
                  onPick={(option) => {
                    setAddError(null);
                    startTransition(async () => {
                      const result = await addPersonalEventDayPerformer(
                        tripId,
                        day.id,
                        option.id,
                      ).catch(() => ({ ok: false as const, error: t.trips.personal.addFailed }));
                      if (!result.ok) setAddError(result.error);
                    });
                  }}
                />
                <p className="small text-secondary mb-0 mt-1">{t.trips.personal.addPerformerHint}</p>
                {addError && <p className="small text-danger mb-0 mt-1">{addError}</p>}
                <button
                  type="button"
                  className="btn-link-accent small mt-1"
                  disabled={isPending}
                  onClick={() => {
                    setIsAdding(false);
                    setAddError(null);
                  }}
                >
                  {t.common.cancel}
                </button>
              </div>
            ) : (
              <button type="button" className="btn-link-accent small" onClick={() => setIsAdding(true)}>
                {t.trips.personal.addPerformer}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** «Я там буду» — зеркало иконки GoingButton с афиши (те же классы и
 *  подписи), но отметка живёт на личном событии. В углу карточки —
 *  круглой иконкой, в попапе — кнопкой с подписью: там есть место, и
 *  без подписи непонятно, что именно включено.
 *
 *  Оптимистично: галочка меняется по клику, откат при ошибке; проп с
 *  сервера пересинхронизирует при навигации. */
export function AttendanceToggle({
  tripId,
  personalEventId,
  attending,
  isPast,
  variant = "icon",
}: {
  tripId: string;
  personalEventId: string;
  attending: boolean;
  isPast: boolean;
  variant?: "icon" | "button";
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

  function toggle() {
    const next = !active;
    setActive(next);
    startTransition(async () => {
      const result = await togglePersonalEventAttendance(tripId, personalEventId).catch(() => ({
        ok: false as const,
        error: "",
      }));
      if (!result.ok) setActive(!next);
    });
  }

  if (variant === "button") {
    // Подпись — СОСТОЯНИЕ («Я там буду» / «Посещено»), а не действие:
    // это переключатель с aria-pressed, и длинное «убрать отметку…» из
    // подсказок иконки в кнопку не помещается.
    return (
      <button
        type="button"
        className={`btn btn-sm d-inline-flex align-items-center gap-2 ${active ? "btn-primary" : "btn-ghost"}`}
        disabled={isPending}
        aria-pressed={active}
        title={label}
        onClick={toggle}
      >
        {active ? <CheckIcon /> : <PlusIcon />}{" "}
        {isPast
          ? active
            ? t.trips.personal.attended
            : t.trips.personal.markAttended
          : t.trips.personal.attending}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`round-icon-btn ${active ? "is-going" : ""}`}
      disabled={isPending}
      aria-pressed={active}
      aria-label={label}
      data-tooltip={label}
      onClick={toggle}
    >
      {active ? <CheckIcon /> : <PlusIcon />}
    </button>
  );
}
