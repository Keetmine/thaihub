"use client";

import { useId, useRef, useState } from "react";
import { UploadIcon } from "@/components/icons";
import ImageCropDialog from "@/components/ImageCropDialog";
import { useT } from "@/components/LocaleProvider";
import { uploadErrorMessage } from "@/lib/uploadErrors";

export default function FileDropzone({
  name,
  label,
  defaultValue,
  accept = "image/*",
  // Приватные файлы (брони отелей) грузятся через свой эндпоинт — в
  // приватное хранилище вместо public/uploads.
  endpoint = "/api/upload",
  // Компактный вариант для форм админки (просьба владельца): бокс ~3:4
  // размером с миниатюру постера, а не полоса на всю колонку — рядом
  // помещаются другие поля, и форму не приходится мотать.
  compact = false,
  // Кадрирование перед отправкой — только там, где человек ставит СВОЁ
  // фото: аватарка круглая, и без рамки вертикальный снимок обрезается
  // как попало. Каталожным картинкам админки (постеры, фото артистов)
  // квадрат не нужен и лишний шаг только мешает, поэтому по умолчанию
  // выключено.
  crop = false,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  accept?: string;
  endpoint?: string;
  compact?: boolean;
  crop?: boolean;
}) {
  const uid = useId();
  const t = useT();
  const [url, setUrl] = useState(defaultValue ?? "");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Выбранный файл: с кропом сначала показываем рамку, без кропа —
   *  сразу на сервер. Отмена в окне кропа не грузит ничего. */
  function pick(file: File) {
    setError(null);
    if (crop && file.type.startsWith("image/")) {
      setCropFile(file);
      return;
    }
    upload(file);
  }

  async function upload(file: File) {
    setIsUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
      const data = await res.json();
      // Ручка отдаёт код ошибки, а не фразу — язык страницы ей недоступен.
      if (!res.ok) {
        setError(uploadErrorMessage(t, data, t.widgets.file.failed));
        return;
      }
      setUrl(data.url);
    } catch {
      setError(t.widgets.file.failed);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div>
      <label className="form-label d-block" htmlFor={`${uid}-input`}>{label}</label>
      <input id={`${uid}-input`} type="hidden" name={name} value={url} />
      <div
        className={`file-dropzone ${compact ? "file-dropzone-compact" : ""} ${isDragging ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) pick(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        {url ? (
          <div className="file-dropzone-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
            loading="lazy"
            decoding="async" src={url} alt="" />
            <button
              type="button"
              className="btn btn-outline-danger btn-sm mt-2"
              onClick={(e) => {
                e.stopPropagation();
                setUrl("");
              }}
            >
              {t.widgets.file.remove}
            </button>
          </div>
        ) : (
          <>
            <UploadIcon />
            <p className="fw-semibold mb-0 mt-2">
              {isUploading ? t.widgets.file.uploading : t.widgets.file.drop}
            </p>
            <p className="small text-secondary mb-0">{t.widgets.file.hintImage}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="d-none"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Сбрасываем значение поля: без этого повторный выбор ТОГО
            // ЖЕ файла (отменил кроп — передумал) не поднимает change, и
            // окно кропа больше не открывается.
            e.target.value = "";
            if (file) pick(file);
          }}
        />
      </div>
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}

      {/* Окно кропа живёт СНАРУЖИ дропзоны: события портала всплывают
          по дереву React, а не по DOM, и внутри дропзоны любой клик в
          окне снова открывал бы выбор файла. */}
      {cropFile && (
        <ImageCropDialog
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(cropped) => {
            setCropFile(null);
            upload(cropped);
          }}
        />
      )}
    </div>
  );
}
