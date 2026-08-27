"use client";

import { useId, useState } from "react";
import Modal from "@/components/Modal";
import { createOwnPlace } from "../actions";
import FileDropzone from "@/components/FileDropzone";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";
import { useT } from "@/components/LocaleProvider";

/** Создание своего места (не из каталога): название + ссылка Google
 *  Maps (короткая или длинная) или координаты — точка сразу встаёт на
 *  карту. Куда именно сохранять, решает вызывающий: в список
 *  (createOwnPlace) или прямо в поездку (createTripOwnPlace) — форма
 *  одна и та же. */
export default function CreateOwnPlaceButton({
  listId,
  action,
  label,
  // Куда именно попадёт место, зависит от вызывающего — подпись кнопки
  // тоже: «в список» верно только на странице списка.
  submitLabel,
}: {
  /** Список, в который добавляем. Не нужен, если передан action. */
  listId?: string;
  /** Уже связанный экшен — для поездки и любых других мест сохранения. */
  action?: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  label?: string;
  submitLabel?: string;
}) {
  const uid = useId();
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boundCreate = action ?? createOwnPlace.bind(null, listId!);
  const submitText =
    submitLabel ?? (listId ? t.lists.placeForm.submitToList : t.lists.placeForm.submitPlain);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      // Валидационные ошибки экшен возвращает значением; catch остаётся
      // для настоящих сбоев (упавший резолвер координат, сеть).
      const result = await boundCreate(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsOpen(false);
    } catch {
      setError(t.lists.placeForm.createFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        {label ?? t.lists.placeForm.open}
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={t.lists.placeForm.createTitle}>
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-name`}>{t.lists.placeForm.name}</label>
            <input id={`${uid}-name`}
              type="text"
              name="name"
              required
              autoFocus
              placeholder={t.lists.placeForm.namePlaceholder}
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-mapsUrl`}>{t.lists.placeForm.maps}</label>
            <input id={`${uid}-mapsUrl`}
              type="text"
              name="mapsUrl"
              placeholder={t.lists.placeForm.mapsPlaceholder}
              className="form-control"
            />
            <p className="small text-secondary mt-1 mb-0">{t.lists.placeForm.mapsHint}</p>
          </div>
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-category`}>{t.lists.placeForm.category}</label>
            {/* По категории строится фильтр в списках мест — задать её
                удобнее сразу, чем возвращаться потом. */}
            <select id={`${uid}-category`} name="category" defaultValue="" className="form-select">
              <option value="">{t.lists.placeForm.categoryNone}</option>
              {LOCATION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.emoji} {t.catalog.locationCategory[c.value]}
                </option>
              ))}
            </select>
          </div>
          <FileDropzone name="photoUrl" label={t.lists.placeForm.photoOptional} defaultValue="" />
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-note`}>{t.lists.placeForm.note}</label>
            <input id={`${uid}-note`}
              type="text"
              name="note"
              placeholder={t.lists.placeForm.notePlaceholder}
              className="form-control"
            />
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t.lists.placeForm.creating : submitText}
          </button>
        </form>
      </Modal>
    </>
  );
}
