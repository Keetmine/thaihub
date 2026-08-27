"use client";

import { useId, useState } from "react";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import { PencilIcon } from "@/components/icons";
import { updateTrip } from "./actions";
import { useT } from "@/components/LocaleProvider";

export default function EditTripButton({
  trip,
}: {
  trip: { id: string; title: string; startKey: string; endKey: string };
}) {
  const uid = useId();
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boundUpdate = updateTrip.bind(null, trip.id);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      const result = await boundUpdate(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsOpen(false);
    } catch {
      setError(t.trips.form.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {/* Карандаш у названия (просьба владельца): раньше это была
          подписанная кнопка в общем ряду действий над поездкой. */}
      <button
        type="button"
        className="icon-btn"
        // Кнопка живёт внутри h1: без явного размера иконка (0.95em)
        // унаследовала бы 2.5rem заголовка и вылезла из кружка.
        style={{ fontSize: "1rem" }}
        aria-label={t.trips.form.editAria}
        data-tooltip={t.common.edit}
        onClick={() => setIsOpen(true)}
      >
        <PencilIcon />
      </button>
      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={t.trips.form.editTitle}
      >
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>{t.trips.form.title}</label>
            <input id={`${uid}-title`} type="text" name="title" required defaultValue={trip.title} className="form-control" />
          </div>
          <div className="row g-2">
            <div className="col">
              <label className="form-label small text-secondary" htmlFor={`${uid}-startDate`}>{t.trips.form.from}</label>
              <DatePickerInput id={`${uid}-startDate`} name="startDate" required defaultValue={trip.startKey} />
            </div>
            <div className="col">
              <label className="form-label small text-secondary" htmlFor={`${uid}-endDate`}>{t.trips.form.to}</label>
              <DatePickerInput id={`${uid}-endDate`} name="endDate" required defaultValue={trip.endKey} />
            </div>
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t.trips.form.saving : t.common.save}
          </button>
        </form>
      </Modal>
    </>
  );
}
