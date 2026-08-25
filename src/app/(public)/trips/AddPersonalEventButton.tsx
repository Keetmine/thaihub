"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createTripPersonalEvent } from "./actions";
import { PersonalEventFields } from "./PersonalEventCard";
import { useT } from "@/components/LocaleProvider";

export default function AddPersonalEventButton({
  tripId,
  showShareToggle = false,
  // На странице поездки кнопка стоит первой в ряду «Событие / Отель /
  // Перелёт» и выделена акцентом: своё событие добавляют чаще всего.
  accent = false,
  label,
}: {
  tripId: string;
  showShareToggle?: boolean;
  accent?: boolean;
  label?: string;
}) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boundCreate = createTripPersonalEvent.bind(null, tripId);

  async function handleCreate(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      const result = await boundCreate(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsOpen(false);
    } catch {
      setError(t.trips.personal.addFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm ${accent ? "btn-primary" : "btn-ghost"}`}
        onClick={() => setIsOpen(true)}
      >
        {label ?? t.trips.personal.addLabel}
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={t.trips.personal.addTitle}
      >
        <form action={handleCreate} className="d-flex flex-column gap-3">
          <PersonalEventFields showShareToggle={showShareToggle} />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t.trips.personal.adding : t.common.add}
          </button>
        </form>
      </Modal>
    </>
  );
}
