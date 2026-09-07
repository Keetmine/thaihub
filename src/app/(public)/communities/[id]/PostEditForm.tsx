"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import { updatePost } from "../postActions";

/**
 * Правка темы обсуждения (правка владельца 2026-09-09: «обсуждения
 * сейчас нельзя отредактировать»).
 *
 * Свёртка, а не отдельная страница: правят обычно опечатку, и ради неё
 * уводить человека с разговора незачем. Открытая форма подменяет собой
 * текст темы — так видно, что именно правишь.
 *
 * Картинок тут нет намеренно: их выбирают при создании, и переписывать
 * набор задним числом — отдельная работа с загрузкой, которой в этой
 * форме нет. Кнопку показывает страница только тем, кто вправе править;
 * право всё равно перепроверяется в экшене.
 */
export default function PostEditForm({
  postId,
  initial,
}: {
  postId: string;
  initial: { title: string | null; text: string; isPrivate: boolean };
}) {
  const t = useT();
  const s = t.communities.posts;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm align-self-start"
        onClick={() => setOpen(true)}
      >
        {s.edit}
      </button>
    );
  }

  return (
    <form
      className="d-flex flex-column gap-2 mt-2"
      action={async (formData) => {
        setError(null);
        const result = await updatePost(postId, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      }}
    >
      <input
        name="title"
        maxLength={120}
        defaultValue={initial.title ?? ""}
        placeholder={s.titlePlaceholder}
        aria-label={s.titleAria}
        className="form-control form-control-sm"
      />
      <textarea
        name="text"
        rows={5}
        required
        maxLength={5000}
        defaultValue={initial.text}
        aria-label={s.textAria}
        className="form-control"
      />
      <label className="form-check small text-secondary mb-0 d-flex align-items-center gap-2">
        <input
          type="checkbox"
          name="isPrivate"
          defaultChecked={initial.isPrivate}
          className="form-check-input mt-0"
        />
        <span>{s.privateLabel}</span>
      </label>
      {error && <p className="small text-danger mb-0">{error}</p>}
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm">
          {s.save}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
