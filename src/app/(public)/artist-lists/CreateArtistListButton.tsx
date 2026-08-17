"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createPerformerList } from "./actions";

export default function CreateArtistListButton({ small = false }: { small?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={small ? "btn btn-ghost btn-sm" : "btn btn-primary"}
        onClick={() => setIsOpen(true)}
      >
        + Создать список{small ? "" : " актёров"}
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Новый список актёров">
        <form action={createPerformerList} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">Название</label>
            <input
              type="text"
              name="title"
              required
              autoFocus
              placeholder="Пил пиво"
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary">Описание</label>
            <textarea name="description" rows={2} className="form-control" />
          </div>
          <button type="submit" className="btn btn-primary">
            Создать
          </button>
        </form>
      </Modal>
    </>
  );
}
