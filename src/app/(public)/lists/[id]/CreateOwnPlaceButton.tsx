"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createOwnPlace } from "../actions";
import FileDropzone from "@/components/FileDropzone";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";

/** Создание своего места (не из каталога): название + ссылка Google
 *  Maps (короткая или длинная) или координаты — точка сразу встаёт на
 *  карту. Куда именно сохранять, решает вызывающий: в список
 *  (createOwnPlace) или прямо в поездку (createTripOwnPlace) — форма
 *  одна и та же. */
export default function CreateOwnPlaceButton({
  listId,
  action,
  label = "+ Создать своё место",
  // Куда именно попадёт место, зависит от вызывающего — подпись кнопки
  // тоже: «в список» верно только на странице списка.
  submitLabel = listId ? "Создать и добавить в список" : "Создать место",
}: {
  /** Список, в который добавляем. Не нужен, если передан action. */
  listId?: string;
  /** Уже связанный экшен — для поездки и любых других мест сохранения. */
  action?: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  label?: string;
  submitLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boundCreate = action ?? createOwnPlace.bind(null, listId!);

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
      setError("Не удалось создать место — проверьте ссылку и попробуйте ещё раз");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        {label}
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Новое место">
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">Название</label>
            <input
              type="text"
              name="name"
              required
              autoFocus
              placeholder="Кафе с манго-райсом"
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary">
              Ссылка Google Maps или координаты
            </label>
            <input
              type="text"
              name="mapsUrl"
              placeholder="https://maps.app.goo.gl/… или 13.7563, 100.5018"
              className="form-control"
            />
            <p className="small text-secondary mt-1 mb-0">
              Вставьте ссылку «Поделиться» из Google Карт — координаты
              подтянутся автоматически, и место появится на карте. Короткие
              ссылки распознаются чуть дольше (несколько секунд).
            </p>
          </div>
          <div>
            <label className="form-label small text-secondary">Категория</label>
            {/* По категории строится фильтр в списках мест — задать её
                удобнее сразу, чем возвращаться потом. */}
            <select name="category" defaultValue="" className="form-select">
              <option value="">не указана</option>
              {LOCATION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </div>
          <FileDropzone name="photoUrl" label="Фото (необязательно)" defaultValue="" />
          <div>
            <label className="form-label small text-secondary">Заметка</label>
            <input type="text" name="note" placeholder="манго-рис брать обязательно" className="form-control" />
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Создаём…" : submitLabel}
          </button>
        </form>
      </Modal>
    </>
  );
}
