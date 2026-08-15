"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createPlaceList } from "./actions";
import { VisibilityRadios } from "@/app/(public)/trips/TripVisibilityControls";

export default function CreateListButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setIsOpen(true)}>
        + Создать список
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Новый список мест">
        <form action={createPlaceList} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">Название</label>
            <input
              type="text"
              name="title"
              required
              autoFocus
              placeholder="Где вкусная еда"
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary">Описание</label>
            <textarea name="description" rows={2} className="form-control" />
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
