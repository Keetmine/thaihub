"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import {
  updatePerformerList,
  setPerformerListVisibility,
} from "../actions";
import type { TripVisibility } from "@/generated/prisma/client";

const VISIBILITY_OPTIONS: { value: TripVisibility; label: string }[] = [
  { value: "PRIVATE", label: "Приватный" },
  { value: "FRIENDS", label: "Для друзей" },
  { value: "PUBLIC", label: "Публичный" },
];

export default function ArtistListControls({
  list,
}: {
  list: { id: string; title: string; description: string | null; visibility: TripVisibility };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <select
        className="form-select form-select-sm w-auto"
        aria-label="Кто видит список"
        defaultValue={list.visibility}
        onChange={async (e) => {
          await setPerformerListVisibility(list.id, e.target.value as TripVisibility);
          router.refresh();
        }}
      >
        {VISIBILITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Редактировать
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Редактировать список">
        <form
          action={async (fd) => {
            await updatePerformerList(list.id, fd);
            setOpen(false);
            router.refresh();
          }}
          className="d-flex flex-column gap-3"
        >
          <div>
            <label className="form-label small text-secondary">Название</label>
            <input name="title" required defaultValue={list.title} className="form-control" />
          </div>
          <div>
            <label className="form-label small text-secondary">Описание</label>
            <textarea
              name="description"
              rows={2}
              defaultValue={list.description ?? ""}
              className="form-control"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Сохранить
          </button>
        </form>
      </Modal>
    </>
  );
}
