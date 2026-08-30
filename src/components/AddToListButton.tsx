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
  /** Server action: кладёт актёра в выбранный список. Может вернуть
   *  `{ ok: false, error }` значением — текст исключения в проде до
   *  клиента не доезжает (см. promoActions.ts). */
  onAdd: (listId: string) => Promise<void | { ok: boolean; error?: string }>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const add = (listId: string) => {
    startTransition(async () => {
      setError(null);
      const result = await onAdd(listId);
      if (result && !result.ok && result.error) {
        setError(result.error);
        return;
      }
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
          {error && <p className="small text-danger mb-0 mt-2">{error}</p>}
      </Modal>
    </>
  );
}
