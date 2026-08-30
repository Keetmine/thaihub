"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/LocaleProvider";
import { uploadErrorMessage } from "@/lib/uploadErrors";

/** Одно фото списка: подпись правится на месте, порядок — стрелками. */
export type EventPhotoRow = { url: string; caption: string };

/**
 * Список фото одного типа в форме события (Ж9): схемы зала или бенефиты
 * билетов. Не общая галерея — у каждого типа своё поле и свой блок на
 * публичной странице. Файлы грузятся сразу (/api/upload, как постер), в
 * форму уходит один hidden с JSON — экшен пересобирает строки EventPhoto.
 */
export default function EventPhotosField({
  name,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue?: EventPhotoRow[];
}) {
  const t = useT();
  const [rows, setRows] = useState<EventPhotoRow[]>(defaultValue ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch("/api/upload", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) {
          setError(uploadErrorMessage(t, data, t.widgets.file.failed));
          continue;
        }
        setRows((prev) => [...prev, { url: data.url, caption: "" }]);
      }
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
      {/* span, а не label: подпись относится к списку, а не к одному
          контролу — несвязанный label валит e2e form-labels. */}
      <span className="form-label d-block mb-1">{label}</span>
      <p className="small text-secondary mb-2">{hint}</p>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.length > 0 && (
        <div className="d-flex flex-column gap-2 mb-2">
          {rows.map((row, i) => (
            <div key={row.url} className="d-flex align-items-center gap-2">
              <a href={row.url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: "5rem",
                    height: "5rem",
                    objectFit: "cover",
                    borderRadius: "0.5rem",
                    background: "var(--bs-secondary-bg)",
                  }}
                />
              </a>
              <input
                className="form-control form-control-sm"
                placeholder="Подпись (например: VIP, 1st press)"
                value={row.caption}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, j) => (j === i ? { ...r, caption: e.target.value } : r)),
                  )
                }
              />
              <div className="d-flex gap-1 flex-shrink-0">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Выше"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label="Ниже"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Убрать"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Загружаем…" : "+ Добавить фото"}
      </button>
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
