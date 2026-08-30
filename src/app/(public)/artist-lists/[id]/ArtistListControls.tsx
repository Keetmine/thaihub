"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import {
  updatePerformerList,
  setPerformerListVisibility,
} from "../actions";
import type { TripVisibility } from "@/generated/prisma/client";
import { useT } from "@/components/LocaleProvider";
import { VISIBILITY_ORDER } from "@/app/(public)/trips/TripVisibilityControls";

export default function ArtistListControls({
  list,
}: {
  list: { id: string; title: string; description: string | null; visibility: TripVisibility };
}) {
  const uid = useId();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <select
        className="form-select form-select-sm w-auto"
        aria-label={t.lists.artists.visibilityAria}
        defaultValue={list.visibility}
        onChange={async (e) => {
          // Ошибка приходит значением — при отказе селект вернёт
          // серверное значение после refresh.
          await setPerformerListVisibility(list.id, e.target.value as TripVisibility);
          router.refresh();
        }}
      >
        {VISIBILITY_ORDER.map((value) => (
          <option key={value} value={value}>
            {t.lists.artists.visibility[value]}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {t.common.edit}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t.lists.artists.editTitle}>
        <form
          action={async (fd) => {
            setError(null);
            // Ошибка приходит значением (см. ActionResult в actions.ts) —
            // показываем её в модалке, не закрывая форму.
            const result = await updatePerformerList(list.id, fd);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          }}
          className="d-flex flex-column gap-3"
        >
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>{t.lists.artists.title}</label>
            <input id={`${uid}-title`} name="title" required defaultValue={list.title} className="form-control" />
          </div>
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-description`}>
              {t.lists.artists.description}
            </label>
            <textarea id={`${uid}-description`}
              name="description"
              rows={2}
              defaultValue={list.description ?? ""}
              className="form-control"
            />
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary">
            {t.common.save}
          </button>
        </form>
      </Modal>
    </>
  );
}
