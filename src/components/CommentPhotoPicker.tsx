"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/LocaleProvider";
import UploadImage from "@/components/UploadImage";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import { COMMENT_PHOTO_LIMIT } from "@/lib/commentPhotos";

/** Скрепка. Живёт здесь, а не в общем `icons.tsx`: она нужна ровно
 *  одному месту — так же сделан глаз в `PasswordInput`. */
function PaperclipIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l8.49-8.48a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
    </svg>
  );
}

/**
 * Прикрепить фото к комментарию — общий выбор картинок для отзывов о
 * событии (АА20) и обсуждений в сообществе.
 *
 * Один компонент на оба места намеренно: правила у них одни (сколько
 * можно, куда уходит файл, что показывать, пока грузится), и вторая
 * копия разъехалась бы с первой на первой же правке.
 *
 * Файл уезжает на `/api/upload` СРАЗУ при выборе, а не по «Отправить»:
 * так человек видит, что картинка принята, ещё до отправки формы, а
 * форме остаётся только адрес скрытым полем. Тот же приём у обложки
 * сообщества и афиши встречи.
 *
 * Кнопка — ИКОНКА со скрепкой, без подписи (правка владельца
 * 2026-09-09). Прикрепить фото — действие второго ряда: подпись
 * «Прикрепить фото» рядом с «до 3 фото» весила больше самой формы и
 * перетягивала внимание с «Отправить». Что делает кнопка, объясняет
 * подсказка по наведению (`data-tooltip` — так подсказки сделаны по
 * всему сайту), а сколько фото влезет, человек и так узнаёт: на третьей
 * кнопка гаснет.
 */
export default function CommentPhotoPicker({
  name = "photoUrl",
  trailing,
}: {
  name?: string;
  /** Что поставить СПРАВА от скрепки, в один ряд с ней, — обычно кнопку
   *  «Отправить» (правка владельца 2026-09-09). Слотом, а не жёсткой
   *  разметкой: под событием (`ReviewsAndComments`) кнопка отправки
   *  осталась своей строкой ниже, и ломать её ради обсуждений незачем. */
  trailing?: React.ReactNode;
}) {
  const t = useT();
  const s = t.reviews.photos;
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    setError(null);
    setBusy(true);
    try {
      const room = COMMENT_PHOTO_LIMIT - urls.length;
      for (const file of files.slice(0, Math.max(0, room))) {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch("/api/upload", { method: "POST", body });
        const data = await res.json();
        // Ручка отдаёт код ошибки, а не фразу: языка страницы она не знает.
        if (!res.ok) {
          setError(uploadErrorMessage(t, data, t.widgets.file.failed));
          return;
        }
        setUrls((prev) => [...prev, data.url as string].slice(0, COMMENT_PHOTO_LIMIT));
      }
    } catch {
      setError(t.widgets.file.failed);
    } finally {
      setBusy(false);
    }
  }

  const full = urls.length >= COMMENT_PHOTO_LIMIT;

  return (
    <div className="d-flex flex-column gap-2">
      {urls.length > 0 && (
        <div className="d-flex flex-wrap gap-2">
          {urls.map((url) => (
            <div key={url} className="comment-photo-thumb">
              <UploadImage src={url} alt="" sizes="6rem" />
              <button
                type="button"
                className="comment-photo-remove"
                aria-label={s.remove}
                onClick={() => setUrls((prev) => prev.filter((u) => u !== url))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="d-flex flex-wrap align-items-center gap-2">
        <button
          type="button"
          className="icon-btn"
          disabled={busy || full}
          data-tooltip={busy ? s.uploading : s.add}
          aria-label={busy ? s.uploading : s.add}
          onClick={() => inputRef.current?.click()}
        >
          <PaperclipIcon />
        </button>
        {trailing}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="d-none"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          // Сбрасываем поле: повторный выбор ТОГО ЖЕ файла иначе не
          // поднимает change.
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />

      {/* Адреса — скрытыми полями: форма остаётся обычной, серверной. */}
      {urls.map((url) => (
        <input key={url} type="hidden" name={name} value={url} />
      ))}
      {error && <p className="small text-danger mb-0">{error}</p>}
    </div>
  );
}
