"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/LocaleProvider";
import { createPost } from "@/app/(public)/communities/postActions";

/**
 * Форма новой темы обсуждения.
 *
 * Клиентская, а не голый `<form action>`, ради двух вещей: свернуть
 * форму обратно и очистить поля после удачной отправки (иначе текст
 * висел бы в textarea и человек отправлял бы его вторым разом), и
 * показать ошибку экшена под полями — текст исключения из server action
 * в проде до клиента не доезжает, поэтому ошибки приезжают значением
 * (см. docs/architecture.md).
 *
 * Свёрнутая по умолчанию: обсуждения читают чаще, чем пишут, и большая
 * форма наверху отодвигала бы сами темы вниз.
 */
export default function PostForm({ communityId }: { communityId: string }) {
  const t = useT();
  const s = t.communities.posts;
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    // Кнопка по содержимому, а не во всю ширину: вкладка — flex-колонка,
    // и без align-self ребёнок растягивается на всю её ширину (жалоба
    // владельца 2026-09-08: «не такая большая кнопка»).
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm align-self-start"
        onClick={() => setOpen(true)}
      >
        {s.newTopic}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      className="surface p-3 d-flex flex-column gap-2"
      action={async (formData) => {
        setError(null);
        const result = await createPost(communityId, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        formRef.current?.reset();
        setOpen(false);
      }}
    >
      {/* Заголовок необязателен: половина обсуждений начинается репликой
          («кто идёт на фанмит?»), и обязательное поле заставляло бы
          придумывать ей название. */}
      <input
        name="title"
        maxLength={120}
        placeholder={s.titlePlaceholder}
        aria-label={s.titleAria}
        className="form-control form-control-sm"
      />
      <textarea
        name="text"
        rows={4}
        required
        maxLength={5000}
        placeholder={s.textPlaceholder}
        aria-label={s.textAria}
        className="form-control"
      />
      <p className="small text-secondary mb-0">{s.newTopicHint}</p>
      {error && <p className="small text-danger mb-0">{error}</p>}
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm">
          {s.publish}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {s.cancel}
        </button>
      </div>
    </form>
  );
}
