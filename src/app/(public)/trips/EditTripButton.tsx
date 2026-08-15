"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import { updateTrip } from "./actions";

export default function EditTripButton({
  trip,
}: {
  trip: { id: string; title: string; startKey: string; endKey: string };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const boundUpdate = updateTrip.bind(null, trip.id);

  async function handleSubmit(formData: FormData) {
    await boundUpdate(formData);
    setIsOpen(false);
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        Редактировать
      </button>
      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Редактировать поездку">
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">Название</label>
            <input type="text" name="title" required defaultValue={trip.title} className="form-control" />
          </div>
          <div className="row g-2">
            <div className="col">
              <label className="form-label small text-secondary">С даты</label>
              <DatePickerInput name="startDate" required defaultValue={trip.startKey} />
            </div>
            <div className="col">
              <label className="form-label small text-secondary">По дату</label>
              <DatePickerInput name="endDate" required defaultValue={trip.endKey} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            Сохранить
          </button>
        </form>
      </Modal>
    </>
  );
}
