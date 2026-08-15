"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createTripPersonalEvent } from "./actions";
import { PersonalEventFields } from "./PersonalEventCard";

export default function AddPersonalEventButton({ tripId }: { tripId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const boundCreate = createTripPersonalEvent.bind(null, tripId);

  async function handleCreate(formData: FormData) {
    await boundCreate(formData);
    setIsOpen(false);
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        + Личное событие
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Личное событие">
        <form action={handleCreate} className="d-flex flex-column gap-3">
          <PersonalEventFields />
          <button type="submit" className="btn btn-primary">
            Добавить
          </button>
        </form>
      </Modal>
    </>
  );
}
