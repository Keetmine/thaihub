"use client";

import { useId, useState } from "react";
import Modal from "@/components/Modal";
import { createPerformerList } from "./actions";
import { useT } from "@/components/LocaleProvider";

export default function CreateArtistListButton({ small = false }: { small?: boolean }) {
  const uid = useId();
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        {/* Ошибка приходит значением (текст исключения в проде до
            клиента не доезжает); успех делает redirect на сервере. */}
        <form
          action={async (fd) => {
            setError(null);
            const result = await createPerformerList(fd);
            if (result && !result.ok) setError(result.error);
          }}
          className="d-flex flex-column gap-3"
        >
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>{t.lists.artists.title}</label>
            <input id={`${uid}-title`}
              type="text"
              name="title"
              required
              autoFocus
              placeholder={t.lists.artists.titlePlaceholder}
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-description`}>
              {t.lists.artists.description}
            </label>
            <textarea id={`${uid}-description`} name="description" rows={2} className="form-control" />
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary">
            {t.lists.artists.submitCreate}
          </button>
        </form>
      </Modal>
    </>
  );
}
