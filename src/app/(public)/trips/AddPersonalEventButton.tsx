"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createTripPersonalEvent } from "./actions";
import { PersonalEventFields } from "./PersonalEventCard";

export default function AddPersonalEventButton({
  tripId,
  showShareToggle = false,
}: {
  tripId: string;
  showShareToggle?: boolean;
}) {
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
      setError("Не удалось добавить событие — попробуйте ещё раз");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        + Личное событие
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title="Личное событие"
      >
        <form action={handleCreate} className="d-flex flex-column gap-3">
          <PersonalEventFields showShareToggle={showShareToggle} />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Добавляем…" : "Добавить"}
          </button>
        </form>
      </Modal>
    </>
  );
}
