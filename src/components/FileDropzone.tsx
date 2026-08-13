"use client";

import { useRef, useState } from "react";
import { UploadIcon } from "@/components/icons";

export default function FileDropzone({
  name,
  label,
  defaultValue,
  accept = "image/*",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  accept?: string;
}) {
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
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить файл");
      setUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div>
      <label className="form-label d-block">{label}</label>
      <input type="hidden" name={name} value={url} />
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
            <img src={url} alt="" />
            <button
              type="button"
              className="btn btn-outline-danger btn-sm mt-2"
              onClick={(e) => {
                e.stopPropagation();
                setUrl("");
              }}
            >
              Убрать
            </button>
          </div>
        ) : (
          <>
            <UploadIcon />
            <p className="fw-semibold mb-0 mt-2">
              {isUploading ? "Загрузка…" : "Перетащите файл сюда или выберите"}
            </p>
            <p className="small text-secondary mb-0">Изображение, до 8MB</p>
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
