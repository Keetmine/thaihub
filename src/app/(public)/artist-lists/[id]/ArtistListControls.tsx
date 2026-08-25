"use client";

import { useState } from "react";
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
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <select
        className="form-select form-select-sm w-auto"
        aria-label={t.lists.artists.visibilityAria}
        defaultValue={list.visibility}
        onChange={async (e) => {
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
            await updatePerformerList(list.id, fd);
            setOpen(false);
            router.refresh();
          }}
          className="d-flex flex-column gap-3"
        >
          <div>
            <label className="form-label small text-secondary">{t.lists.artists.title}</label>
            <input name="title" required defaultValue={list.title} className="form-control" />
          </div>
          <div>
            <label className="form-label small text-secondary">
              {t.lists.artists.description}
            </label>
            <textarea
              name="description"
              rows={2}
              defaultValue={list.description ?? ""}
              className="form-control"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            {t.common.save}
          </button>
        </form>
      </Modal>
    </>
  );
}
