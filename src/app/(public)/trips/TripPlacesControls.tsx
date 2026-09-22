"use client";

import { useState, useTransition } from "react";
import {
  addPlaceToTrip,
  attachListToTrip,
  detachListFromTrip,
  removePlaceFromTrip,
  setTripPlaceNote,
} from "./actions";
import AppLink from "@/components/AppLink";
import UploadImage from "@/components/UploadImage";
import { categoryEmoji } from "@/lib/locationCategories";
import type { LocationCategory } from "@/generated/prisma/client";
import { searchLocationOptions } from "@/app/(public)/lists/actions";
import PlaceOptions from "@/components/PlaceOption";
import type { LocationOption } from "@/lib/locationSearch";
import { useT } from "@/components/LocaleProvider";
import { useRef } from "react";

/** Прикрепление своего списка к поездке. */
export function AttachListSelect({
  tripId,
  availableLists,
}: {
  tripId: string;
  availableLists: { id: string; title: string }[];
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (availableLists.length === 0) return null;
  return (
    <>
      <select
        className="form-select form-select-sm w-auto"
        disabled={isPending}
        value=""
        aria-label={t.trips.places.attachAria}
        onChange={(e) => {
          const listId = e.target.value;
          if (!listId) return;
          setError(null);
          startTransition(async () => {
            const result = await attachListToTrip(tripId, listId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        <option value="">{t.trips.places.attachOption}</option>
        {availableLists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.title}
          </option>
        ))}
      </select>
      {error && <span className="small text-danger">{error}</span>}
    </>
  );
}

export function DetachListButton({ tripId, listId }: { tripId: string; listId: string }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm text-danger"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await detachListFromTrip(tripId, listId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {t.trips.places.detach}
      </button>
      {error && <span className="small text-danger">{error}</span>}
    </>
  );
}

export function RemoveTripPlaceButton({ tripId, locationId }: { tripId: string; locationId: string }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="icon-btn icon-btn-danger flex-shrink-0"
        aria-label={t.trips.places.removeAria}
        title={t.trips.places.removeAria}
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await removePlaceFromTrip(tripId, locationId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        ×
      </button>
      {error && <span className="small text-danger">{error}</span>}
    </>
  );
}

/**
 * Поиск места для поездки: поле и результаты КАРТОЧКАМИ В ПОТОКЕ
 * (правка владельца 2026-09-22). Прежняя выпадашка поверх поля
 * обрезалась прокруткой модалки, а в строке результата стояло одно
 * название — из десятка «Siam …» выбрать было невозможно.
 *
 * Модалка после добавления не закрывается: мест обычно добавляют
 * несколько подряд, добавленное убирается из выдачи, а список под
 * модалкой обновляет сам экшен (revalidatePath).
 */
export function AddTripPlaceBox({
  id,
  tripId,
  /** Уже добавленные — их из выдачи убираем, чтобы не тыкать дважды. */
  addedIds = [],
}: {
  id?: string;
  tripId: string;
  addedIds?: string[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const hidden = new Set([...addedIds, ...added]);

  function handleChange(next: string) {
    setQuery(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const q = next.trim();
    if (q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    const seq = ++seqRef.current;
    setIsSearching(true);
    timeoutRef.current = setTimeout(async () => {
      const found = await searchLocationOptions(q).catch(() => []);
      if (seq !== seqRef.current) return;
      setResults(found);
      setIsSearching(false);
    }, 300);
  }

  const shown = results.filter((r) => !hidden.has(r.id));

  return (
    <div>
      <input
        id={id}
        type="text"
        className="form-control"
        placeholder={t.trips.places.addPlaceholder}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
      />
      <p className="small text-secondary mb-0 mt-1">{t.trips.places.searchHint}</p>
      <PlaceOptions
        options={shown}
        disabled={isPending}
        onPick={(option) => {
          setError(null);
          setAdded((prev) => [...prev, option.id]);
          startTransition(async () => {
            const result = await addPlaceToTrip(tripId, option.id);
            if (!result.ok) {
              setError(result.error);
              setAdded((prev) => prev.filter((p) => p !== option.id));
            }
          });
        }}
      />
      {/* «Ничего не нашлось» — только когда поиск отработал: иначе
          подсказка мигала бы между вводом и ответом. */}
      {query.trim().length >= 2 && !isSearching && shown.length === 0 && (
        <p className="small text-secondary mb-0 mt-2">{t.trips.places.nothingFound}</p>
      )}
      {error && <p className="small text-danger mt-1 mb-0">{error}</p>}
    </div>
  );
}

/**
 * Место в поездке карточкой: фото, название ссылкой, категория, заметка
 * «зачем сюда» и кнопка убрать (правка владельца 2026-09-22 — раньше
 * это была голая строка с крестиком, по которой не понять даже, кафе
 * это или торговый центр).
 */
export function TripPlaceCard({
  tripId,
  place,
  href,
  canEdit,
}: {
  tripId: string;
  place: {
    locationId: string;
    name: string;
    photoUrl: string | null;
    category: LocationCategory | null;
    note: string | null;
  };
  href: string;
  canEdit: boolean;
}) {
  const t = useT();
  const [note, setNote] = useState(place.note ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const emoji = categoryEmoji(place.category);
  const category = place.category ? t.catalog.locationCategory[place.category] : null;

  function save(next: string) {
    setError(null);
    setNote(next);
    setIsEditing(false);
    startTransition(async () => {
      const result = await setTripPlaceNote(tripId, place.locationId, next);
      if (!result.ok) {
        setError(result.error);
        setNote(place.note ?? "");
      }
    });
  }

  return (
    <div className="surface trip-place-card">
      <span className="place-option-photo">
        {place.photoUrl ? (
          <UploadImage src={place.photoUrl} alt="" sizes="3.25rem" />
        ) : (
          <span aria-hidden>{emoji ?? "📍"}</span>
        )}
      </span>
      <div className="flex-fill" style={{ minWidth: 0 }}>
        <AppLink href={href} className="text-decoration-none text-white d-block text-truncate">
          {place.name}
        </AppLink>
        {/* Категория и «+ Заметка» — одной строкой через промежуток:
            встык они слипались в «Кафе+ Заметка» (жалоба владельца
            2026-09-22). Готовая заметка уезжает на свою строку: она
            бывает длинной. */}
        {(category || (!note && !isEditing && canEdit)) && (
          <span className="d-flex flex-wrap align-items-center gap-2">
            {category && <span className="small text-secondary">{category}</span>}
            {!note && !isEditing && canEdit && (
              <button
                type="button"
                className="btn-link-accent small"
                disabled={isPending}
                onClick={() => setIsEditing(true)}
              >
                {t.trips.places.noteAdd}
              </button>
            )}
          </span>
        )}
        {isEditing ? (
          <input
            autoFocus
            defaultValue={note}
            maxLength={500}
            className="form-control form-control-sm mt-1"
            placeholder={t.trips.places.notePlaceholder}
            aria-label={t.trips.places.noteLabel}
            onBlur={(e) => save(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save((e.target as HTMLInputElement).value);
              }
              if (e.key === "Escape") setIsEditing(false);
            }}
          />
        ) : note ? (
          // Заметку правит клик по ней самой: отдельный карандаш в
          // карточке спорил бы с крестиком «убрать».
          canEdit ? (
            <button
              type="button"
              className="btn-link-secondary small d-block text-start"
              onClick={() => setIsEditing(true)}
            >
              {note}
            </button>
          ) : (
            <span className="small text-secondary d-block">{note}</span>
          )
        ) : null}
        {error && <span className="small text-danger d-block">{error}</span>}
      </div>
      {canEdit && <RemoveTripPlaceButton tripId={tripId} locationId={place.locationId} />}
    </div>
  );
}
