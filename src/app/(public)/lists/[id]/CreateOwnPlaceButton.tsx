"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createOwnPlace } from "../actions";
import FileDropzone from "@/components/FileDropzone";

/** Создание своего места (не из каталога) прямо в список: название +
 *  ссылка Google Maps (короткая или длинная) или координаты — точка
 *  сразу встаёт на карту списка. */
export default function CreateOwnPlaceButton({ listId }: { listId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boundCreate = createOwnPlace.bind(null, listId);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      await boundCreate(formData);
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
        + Создать своё место
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
          <FileDropzone name="photoUrl" label="Фото (необязательно)" defaultValue="" />
          <div>
            <label className="form-label small text-secondary">Заметка</label>
            <input type="text" name="note" placeholder="манго-рис брать обязательно" className="form-control" />
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Создаём…" : "Создать и добавить в список"}
          </button>
        </form>
      </Modal>
    </>
  );
}
