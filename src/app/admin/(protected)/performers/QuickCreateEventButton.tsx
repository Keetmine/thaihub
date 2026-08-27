"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import type { EntityOption } from "@/components/EntityMultiSelect";
import { createEventMinimal } from "../events/actions";
import DatePickerInput from "@/components/DatePickerInput";

export default function QuickCreateEventButton({
  onCreated,
}: {
  onCreated: (event: EntityOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      const created = await createEventMinimal(
        String(fd.get("title") ?? ""),
        String(fd.get("venue") ?? ""),
        String(fd.get("date") ?? ""),
        String(fd.get("startTime") ?? ""),
      );
      onCreated({ id: created.id, name: created.title });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать событие");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm mt-2"
        onClick={() => setOpen(true)}
      >
        + Создать новое событие
      </button>

      <Modal open={open} onClose={close} title="Новое событие">
        <form key={open ? "open" : "closed"} className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
          <div>
            <label className="form-label" htmlFor="quick-create-event-button-title">Название *</label>
            <input id="quick-create-event-button-title" name="title" required className="form-control" />
          </div>
          <div>
            <label className="form-label" htmlFor="quick-create-event-button-venue">Место *</label>
            <input id="quick-create-event-button-venue" name="venue" required className="form-control" />
          </div>
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label" htmlFor="quick-create-event-button-date">Дата *</label>
              <DatePickerInput id="quick-create-event-button-date" name="date" required />
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="quick-create-event-button-startTime">Начало *</label>
              <input id="quick-create-event-button-startTime" type="time" name="startTime" required className="form-control" />
            </div>
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Создание…" : "Создать"}
          </button>
        </form>
      </Modal>
    </>
  );
}
