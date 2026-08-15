"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createTrip } from "./actions";
import { VisibilityRadios } from "./TripVisibilityControls";
import DatePickerInput from "@/components/DatePickerInput";

export default function CreateTripButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setIsOpen(true)}>
        + Создать поездку
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Новая поездка">
        <form action={createTrip} className="d-flex flex-column gap-3">
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
          <VisibilityRadios />
          <button type="submit" className="btn btn-primary">
            Создать
          </button>
        </form>
      </Modal>
    </>
  );
}
