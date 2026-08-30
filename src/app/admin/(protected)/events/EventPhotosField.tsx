"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/LocaleProvider";
import { uploadErrorMessage } from "@/lib/uploadErrors";

export type EventPhotoRow = { url: string };

/** На странице события фото стоят одним рядом по три — больше трёх
 *  ряд не вмещает, и лимит той же цифрой (решение владельца). */
export const EVENT_PHOTOS_MAX = 3;

/**
 * Фото события для покупающих билеты (Ж9): схема зала, цены, бенефиты —
 * до трёх штук одним списком, без типов и подписей (владелец сперва
 * просил раздельные озаглавленные блоки, потом упростил). Файлы
 * грузятся сразу (/api/upload, как постер), в форму уходит один hidden
 * с JSON — экшен пересобирает строки EventPhoto.
 */
export default function EventPhotosField({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: EventPhotoRow[];
}) {
  const t = useT();
  const [rows, setRows] = useState<EventPhotoRow[]>(
    (defaultValue ?? []).slice(0, EVENT_PHOTOS_MAX),
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    // Лимит проверяем ДО похода на сервер: раньше файл сначала
    // загружался, а лишний просто не попадал в rows — на диске оставался
    // сирота. Лишние отрезаем сразу и говорим об этом.
    const remaining = EVENT_PHOTOS_MAX - rows.length;
    const batch = Array.from(files).slice(0, Math.max(0, remaining));
    setError(
      batch.length < files.length ? `Не больше ${EVENT_PHOTOS_MAX} фото — лишние не загружались` : null,
    );
    if (batch.length === 0) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      // Одна пачка — один запрос: серверная ручка принимает до трёх
      // файлов за раз и сама держит тот же потолок (см. /api/upload).
      const body = new FormData();
      for (const file of batch) body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(uploadErrorMessage(t, data, t.widgets.file.failed));
        return;
      }
      const urls: string[] = Array.isArray(data.urls) ? data.urls : [data.url];
      setRows((prev) =>
        [...prev, ...urls.map((url) => ({ url }))].slice(0, EVENT_PHOTOS_MAX),
      );
    } catch {
      setError(t.widgets.file.failed);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function move(index: number, delta: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-2">
          {rows.map((row, i) => (
            <div key={row.url} className="d-flex flex-column gap-1">
              <a href={row.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: "7rem",
                    height: "9rem",
                    objectFit: "cover",
                    borderRadius: "0.5rem",
                    background: "var(--bs-secondary-bg)",
                  }}
                />
              </a>
              <div className="d-flex gap-1 justify-content-center">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Левее"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Убрать"
                >
                  ✕
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label="Правее"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {rows.length < EVENT_PHOTOS_MAX && (
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Загружаем…" : "+ Добавить фото"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="d-none"
        onChange={(e) => uploadFiles(e.target.files)}
      />
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
    </div>
  );
}
