"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createTrip } from "./actions";
import { VisibilityRadios } from "./TripVisibilityControls";
import DatePickerInput from "@/components/DatePickerInput";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";

export default function CreateTripButton({ friends = [] }: { friends?: EntityOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      // При успехе экшен уводит redirect'ом на страницу поездки — сюда
      // возвращается только ошибка валидации/подписки.
      const result = await createTrip(formData);
      if (result) setError(result.error);
    } catch {
      setError("Не удалось создать поездку — попробуйте ещё раз");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setIsOpen(true)}>
        + Создать поездку
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title="Новая поездка"
      >
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">Название</label>
            <input
              type="text"
              name="title"
              required
              autoFocus
              placeholder="Бангкок, октябрь"
              className="form-control"
            />
          </div>
          <div className="row g-2">
            <div className="col">
              <label className="form-label small text-secondary">С даты</label>
              <DatePickerInput name="startDate" required />
            </div>
            <div className="col">
              <label className="form-label small text-secondary">По дату</label>
              <DatePickerInput name="endDate" required />
            </div>
          </div>
          {friends.length > 0 && (
            <div>
              <label className="form-label small text-secondary">
                С кем едете (участники видят план и могут добавлять свои события)
              </label>
              <EntityMultiSelect
                name="memberIds"
                options={friends}
                placeholder="Выберите друзей…"
              />
            </div>
          )}
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
