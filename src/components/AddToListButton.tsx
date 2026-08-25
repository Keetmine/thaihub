"use client";

import { useState, useTransition } from "react";
import Modal from "./Modal";
import { PlusIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

export type ListOption = { id: string; title: string; hasPerformer: boolean };

/**
 * «+ в список» рядом с сердечком на странице актёра. Раньше добавить
 * актёра в свой список можно было только со страницы самого списка —
 * то есть надо было заранее знать, что такая возможность есть, и идти
 * туда отдельно.
 */
export default function AddToListButton({
  lists,
  onAdd,
}: {
  lists: ListOption[];
  /** Server action: кладёт актёра в выбранный список. */
  onAdd: (listId: string) => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const add = (listId: string) => {
    startTransition(async () => {
      await onAdd(listId);
      setDone((prev) => [...prev, listId]);
    });
  };

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.widgets.addToList.button}
        title={t.widgets.addToList.button}
        onClick={() => setOpen(true)}
      >
        <PlusIcon />
      </button>

      <Modal open={open} title={t.widgets.addToList.button} onClose={() => setOpen(false)}>
          {lists.length === 0 ? (
            <p className="small text-secondary mb-0">{t.widgets.addToList.empty}</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {lists.map((l) => {
                const added = l.hasPerformer || done.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3 text-start"
                    disabled={added || isPending}
                    onClick={() => add(l.id)}
                  >
                    <span className="text-white">{l.title}</span>
                    <span className="small text-secondary">
                      {added ? t.widgets.addToList.already : t.widgets.addToList.add}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
      </Modal>
    </>
  );
}
