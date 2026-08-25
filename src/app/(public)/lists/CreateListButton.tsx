"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createPlaceList } from "./actions";
import { VisibilityRadios } from "@/app/(public)/trips/TripVisibilityControls";
import { useT } from "@/components/LocaleProvider";

export default function CreateListButton() {
  const t = useT();
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
      setError(t.lists.form.createFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {/* Секционное действие: список теперь не главное на странице —
          главное «+ Добавить место», поэтому кнопка тихая. */}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        {t.lists.form.create}
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={t.lists.form.createTitle}
      >
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">{t.lists.form.title}</label>
            <input
              type="text"
              name="title"
              required
              autoFocus
              placeholder={t.lists.form.titlePlaceholder}
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary">{t.lists.form.description}</label>
            <textarea name="description" rows={2} className="form-control" />
          </div>
          <VisibilityRadios label={t.lists.form.visibility} />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t.lists.form.creating : t.lists.form.submitCreate}
          </button>
        </form>
      </Modal>
    </>
  );
}
