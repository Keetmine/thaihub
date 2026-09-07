"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/LocaleProvider";
import UploadImage from "@/components/UploadImage";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import { COMMENT_PHOTO_LIMIT } from "@/lib/commentPhotos";

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
 */
export default function CommentPhotoPicker({ name = "photoUrl" }: { name?: string }) {
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
          className="btn btn-ghost btn-sm"
          disabled={busy || full}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? s.uploading : s.add}
        </button>
        <span className="small text-secondary">{s.limit(COMMENT_PHOTO_LIMIT)}</span>
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
