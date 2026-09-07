"use client";

import { useId, useRef, useState, useTransition } from "react";
import {
  addPlaceToList,
  movePlaceInList,
  removePlaceFromList,
  searchLocationOptions,
  setPlaceListVisibility,
  setPlaceNote,
  updateOwnPlace,
} from "../actions";
import Modal from "@/components/Modal";
import FileDropzone from "@/components/FileDropzone";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";
import { useT } from "@/components/LocaleProvider";
import { VISIBILITY_ORDER } from "@/app/(public)/trips/TripVisibilityControls";

/**
 * Селектор видимости списка — тому, кто вправе его менять.
 *
 * У списка СООБЩЕСТВА состояний два, а не три: «для друзей» здесь
 * бессмысленно — дружба это про человека, а список принадлежит
 * сообществу, и друзья заводившего к нему отношения не имеют. Сервер
 * это же и подстраховывает: `setPlaceListVisibility` сводит присланный
 * FRIENDS к «только участникам».
 */
export function ListVisibilitySelect({
  listId,
  visibility,
  isCommunity = false,
}: {
  listId: string;
  visibility: string;
  isCommunity?: boolean;
}) {
  const t = useT();
  const [current, setCurrent] = useState(visibility);
  const [isPending, startTransition] = useTransition();
  const options = isCommunity
    ? (["PRIVATE", "PUBLIC"] as const).map((value) => ({
        value,
        label: t.lists.communityVisibility[value],
      }))
    : VISIBILITY_ORDER.map((value) => ({ value, label: t.lists.visibility[value] }));
  return (
    <select
      className="form-select form-select-sm w-auto"
      value={current}
      disabled={isPending}
      aria-label={isCommunity ? t.lists.detail.communityVisibilityAria : t.lists.detail.visibilityAria}
      onChange={(e) => {
        const next = e.target.value;
        setCurrent(next);
        startTransition(async () => {
          try {
            const result = await setPlaceListVisibility(listId, next);
            if (!result.ok) setCurrent(current);
          } catch {
            setCurrent(current);
          }
        });
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Комбобокс «добавить место»: асинхронный поиск локаций, выбор — сразу
 *  добавление в список. */
export function AddPlaceBox({ listId }: { listId: string }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  function handleChange(next: string) {
    setQuery(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const q = next.trim();
    if (q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = ++seqRef.current;
    timeoutRef.current = setTimeout(async () => {
      try {
        const found = await searchLocationOptions(q);
        if (seq === seqRef.current) setResults(found);
      } finally {
        if (seq === seqRef.current) setIsSearching(false);
      }
    }, 300);
  }

  function pick(locationId: string) {
    setQuery("");
    setResults([]);
    setError(null);
    startTransition(async () => {
      const result = await addPlaceToList(listId, locationId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="performer-combobox" style={{ maxWidth: "24rem" }}>
      <input
        type="text"
        className="form-control"
        placeholder={t.lists.detail.addPlaceholder}
        aria-label={t.lists.detail.addAria}
        value={query}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
      />
      {isOpen && query.trim().length >= 2 && (
        <div className="performer-combobox-dropdown">
          {results.map((l) => (
            <button
              key={l.id}
              type="button"
              className="performer-combobox-option d-flex align-items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(l.id)}
            >
              {l.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
              loading="lazy"
              decoding="async" src={l.photoUrl} alt="" className="performer-select-avatar" />
              ) : (
                <span className="performer-select-avatar performer-select-avatar-placeholder">
                  {l.name.charAt(0).toUpperCase()}
                </span>
              )}
              {l.name}
            </button>
          ))}
          {results.length === 0 && (
            <div className="performer-combobox-option text-secondary" aria-disabled>
              {isSearching ? t.lists.detail.searching : t.common.nothingFound}
            </div>
          )}
        </div>
      )}
      {error && <p className="small text-danger mt-1 mb-0">{error}</p>}
    </div>
  );
}

/** Контролы строки места: порядок ↑↓, заметка, редактирование своего
 *  места (название/фото/координаты), удаление из списка. */
export function PlaceRowControls({
  listId,
  locationId,
  note,
  canEditPlace = false,
  place,
}: {
  listId: string;
  locationId: string;
  note: string | null;
  /** true — место создано этим пользователем и его можно редактировать. */
  canEditPlace?: boolean;
  place?: { name: string; photoUrl: string | null; category: string | null };
}) {
  const uid = useId();
  const t = useT();
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingPlace, setIsEditingPlace] = useState(false);
  // Ошибки: rowError — у контролов строки (порядок/заметка/удаление),
  // placeError — внутри модалки редактирования места.
  const [rowError, setRowError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const boundNote = setPlaceNote.bind(null, listId, locationId);
  const boundPlace = updateOwnPlace.bind(null, locationId);

  async function saveNote(formData: FormData) {
    try {
      const result = await boundNote(formData);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      setRowError(null);
      setIsEditing(false);
    } catch {
      setRowError(t.lists.detail.noteSaveFailed);
    }
  }

  async function savePlace(formData: FormData) {
    try {
      const result = await boundPlace(formData);
      if (!result.ok) {
        setPlaceError(result.error);
        return;
      }
      setPlaceError(null);
      setIsEditingPlace(false);
    } catch {
      setPlaceError(t.lists.placeForm.saveFailed);
    }
  }

  function runRowAction(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setRowError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setRowError(result.error);
    });
  }

  return (
    <div className="d-flex align-items-center gap-2 flex-shrink-0">
      {rowError && <span className="small text-danger">{rowError}</span>}
      <div className="d-flex flex-column">
        <button
          type="button"
          className="btn btn-link btn-sm p-0 text-secondary"
          aria-label={t.lists.detail.moveUp}
          title={t.lists.detail.moveUp}
          disabled={isPending}
          onClick={() => runRowAction(() => movePlaceInList(listId, locationId, "up"))}
        >
          ▲
        </button>
        <button
          type="button"
          className="btn btn-link btn-sm p-0 text-secondary"
          aria-label={t.lists.detail.moveDown}
          title={t.lists.detail.moveDown}
          disabled={isPending}
          onClick={() => runRowAction(() => movePlaceInList(listId, locationId, "down"))}
        >
          ▼
        </button>
      </div>
      {isEditing ? (
        <form action={saveNote} className="d-flex align-items-center gap-2">
          <input
            name="note"
            defaultValue={note ?? ""}
            aria-label={t.lists.detail.noteAria}
            placeholder={t.lists.detail.notePlaceholder}
            className="form-control form-control-sm"
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm">
            {t.lists.detail.noteOk}
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>
          {note ? "✎" : t.lists.detail.addNote}
        </button>
      )}
      {canEditPlace && place && (
        <button
          type="button"
          className="icon-btn"
          aria-label={t.lists.detail.editPlaceAria}
          title={t.lists.detail.editPlaceAria}
          onClick={() => setIsEditingPlace(true)}
        >
          ✎
        </button>
      )}
      <button
        type="button"
        className="icon-btn icon-btn-danger"
        aria-label={t.lists.detail.removeFromList}
        title={t.lists.detail.removeFromList}
        disabled={isPending}
        onClick={() => runRowAction(() => removePlaceFromList(listId, locationId))}
      >
        ×
      </button>

      {canEditPlace && place && (
        <Modal
          open={isEditingPlace}
          onClose={() => {
            setIsEditingPlace(false);
            setPlaceError(null);
          }}
          title={t.lists.placeForm.editTitle}
        >
          <form action={savePlace} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small text-secondary" htmlFor={`${uid}-name`}>{t.lists.placeForm.name}</label>
              <input id={`${uid}-name`} type="text" name="name" required defaultValue={place.name} className="form-control" />
            </div>
            <div>
              <label className="form-label small text-secondary" htmlFor={`${uid}-category`}>{t.lists.placeForm.category}</label>
              {/* По категории работает фильтр в списках мест — менять её
                  нужно там же, где остальное. */}
              <select id={`${uid}-category`} name="category" defaultValue={place.category ?? ""} className="form-select">
                <option value="">{t.lists.placeForm.categoryNone}</option>
                {LOCATION_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.emoji} {t.catalog.locationCategory[c.value]}
                  </option>
                ))}
              </select>
            </div>
            <FileDropzone
              name="photoUrl"
              label={t.lists.placeForm.photo}
              defaultValue={place.photoUrl ?? ""}
            />
            <div>
              <label className="form-label small text-secondary" htmlFor={`${uid}-mapsUrl`}>
                {t.lists.placeForm.mapsUpdate}
              </label>
              <input id={`${uid}-mapsUrl`} type="text" name="mapsUrl" placeholder="https://maps.app.goo.gl/…" className="form-control" />
            </div>
            {placeError && <p className="small text-danger mb-0">{placeError}</p>}
            <button type="submit" className="btn btn-primary">
              {t.common.save}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
