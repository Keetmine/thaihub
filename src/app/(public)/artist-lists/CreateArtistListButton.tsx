"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { createPerformerList } from "./actions";
import { useT } from "@/components/LocaleProvider";

export default function CreateArtistListButton({ small = false }: { small?: boolean }) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={small ? "btn btn-ghost btn-sm" : "btn btn-primary"}
        onClick={() => setIsOpen(true)}
      >
        {small ? t.lists.artists.create : t.lists.artists.createLong}
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={t.lists.artists.createTitle}>
        <form action={createPerformerList} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">{t.lists.artists.title}</label>
            <input
              type="text"
              name="title"
              required
              autoFocus
              placeholder={t.lists.artists.titlePlaceholder}
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary">
              {t.lists.artists.description}
            </label>
            <textarea name="description" rows={2} className="form-control" />
          </div>
          <button type="submit" className="btn btn-primary">
            {t.lists.artists.submitCreate}
          </button>
        </form>
      </Modal>
    </>
  );
}
