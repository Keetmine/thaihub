"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createPlaceList } from "./actions";
import { VisibilityRadios } from "@/app/(public)/trips/TripVisibilityControls";

export default function CreateListButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      // При успехе экшен уводит redirect'ом на страницу списка — сюда
      // возвращается только ошибка валидации.
      const result = await createPlaceList(formData);
      if (result) setError(result.error);
    } catch {
      setError("Не удалось создать список — попробуйте ещё раз");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {/* Секционное действие: список теперь не главное на странице —
          главное «+ Добавить место», поэтому кнопка тихая. */}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        + Создать список
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title="Новый список мест"
      >
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">Название</label>
            <input
              type="text"
              name="title"
              required
              autoFocus
              placeholder="Где вкусная еда"
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary">Описание</label>
            <textarea name="description" rows={2} className="form-control" />
          </div>
          <VisibilityRadios />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Создаём…" : "Создать"}
          </button>
        </form>
      </Modal>
    </>
  );
}
