"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { updatePlaceList } from "../actions";

export default function EditListButton({
  list,
}: {
  list: { id: string; title: string; description: string | null };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const boundUpdate = updatePlaceList.bind(null, list.id);

  async function handleSubmit(formData: FormData) {
    await boundUpdate(formData);
    setIsOpen(false);
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        Редактировать
      </button>
      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Редактировать список">
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">Название</label>
            <input type="text" name="title" required defaultValue={list.title} className="form-control" />
          </div>
          <div>
            <label className="form-label small text-secondary">Описание</label>
            <textarea name="description" rows={2} defaultValue={list.description ?? ""} className="form-control" />
          </div>
          <button type="submit" className="btn btn-primary">
            Сохранить
          </button>
        </form>
      </Modal>
    </>
  );
}
