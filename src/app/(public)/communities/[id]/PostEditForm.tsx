"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useT } from "@/components/LocaleProvider";
import { PencilIcon } from "@/components/icons";
import { updatePost } from "../postActions";

/**
 * Правка темы обсуждения (правка владельца 2026-09-09: «обсуждения
 * сейчас нельзя отредактировать»).
 *
 * Форма — в модальном окне, тем же способом, что и создание темы
 * (`PostForm`): правят обычно опечатку, и ради неё уводить человека с
 * разговора незачем, а разворачивать форму прямо в строке списка тем
 * некуда — строка встала бы враспор.
 *
 * Живёт в ДВУХ местах (правка владельца 2026-09-09), потому что тема
 * читается из обоих:
 *
 * - на странице темы — подписанной кнопкой «Изменить» под текстом;
 * - в строке списка обсуждений (`PostCard`) — иконкой рядом с
 *   удалением, `compact`: там у действий свой ряд иконок, и подпись в
 *   нём была бы единственным словом среди значков.
 *
 * Картинок тут нет намеренно: их выбирают при создании, и переписывать
 * набор задним числом — отдельная работа с загрузкой, которой в этой
 * форме нет. Кнопку показывают только тем, кто вправе править; право всё
 * равно перепроверяется в экшене — кнопка правом не является.
 */
export default function PostEditForm({
  postId,
  initial,
  compact = false,
}: {
  postId: string;
  initial: { title: string | null; text: string; isPrivate: boolean };
  /** Иконка вместо подписанной кнопки — для ряда действий в строке списка. */
  compact?: boolean;
}) {
  const t = useT();
  const s = t.communities.posts;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="icon-btn"
          aria-label={s.edit}
          data-tooltip={s.edit}
          onClick={() => setOpen(true)}
        >
          <PencilIcon />
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm align-self-start"
          onClick={() => setOpen(true)}
        >
          {s.edit}
        </button>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title={s.editTitle}
      >
        <form
          className="d-flex flex-column gap-2"
          action={async (formData) => {
            setError(null);
            const result = await updatePost(postId, formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            // Список тем и страница темы — серверные: без refresh правка
            // осталась бы только в базе, а на экране висел бы старый текст.
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
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
