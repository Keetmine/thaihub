"use client";

import { useId, useRef, useState } from "react";
import { UploadIcon } from "@/components/icons";
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
}: {
  name: string;
  label: string;
  defaultValue?: string;
  accept?: string;
  endpoint?: string;
}) {
  const uid = useId();
  const t = useT();
  const [url, setUrl] = useState(defaultValue ?? "");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        className={`file-dropzone ${isDragging ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
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
            if (file) upload(file);
          }}
        />
      </div>
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
    </div>
  );
}
