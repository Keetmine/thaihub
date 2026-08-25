"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createTrip } from "./actions";
import { VisibilityRadios } from "./TripVisibilityControls";
import DatePickerInput from "@/components/DatePickerInput";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import { useT } from "@/components/LocaleProvider";

export default function CreateTripButton({ friends = [] }: { friends?: EntityOption[] }) {
  const t = useT();
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
      setError(t.trips.form.createFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setIsOpen(true)}>
        {t.trips.form.open}
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={t.trips.form.createTitle}
      >
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">{t.trips.form.title}</label>
            <input
              type="text"
              name="title"
              required
              autoFocus
              placeholder={t.trips.form.titlePlaceholder}
              className="form-control"
            />
          </div>
          <div className="row g-2">
            <div className="col">
              <label className="form-label small text-secondary">{t.trips.form.from}</label>
              <DatePickerInput name="startDate" required />
            </div>
            <div className="col">
              <label className="form-label small text-secondary">{t.trips.form.to}</label>
              <DatePickerInput name="endDate" required />
            </div>
          </div>
          {friends.length > 0 && (
            <div>
              <label className="form-label small text-secondary">{t.trips.form.members}</label>
              <EntityMultiSelect
                name="memberIds"
                options={friends}
                placeholder={t.trips.form.membersPlaceholder}
              />
            </div>
          )}
          <VisibilityRadios />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t.trips.form.creating : t.trips.form.submitCreate}
          </button>
        </form>
      </Modal>
    </>
  );
}
