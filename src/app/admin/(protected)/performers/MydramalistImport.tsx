"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importFromMydramalist } from "./actions";

export default function MydramalistImport({
  performerId,
  defaultUrl,
}: {
  performerId: string;
  defaultUrl: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed || isImporting) return;

    setIsImporting(true);
    setError(null);
    setSuccess(false);
    try {
      await importFromMydramalist(performerId, trimmed);
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить импорт");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="surface p-4" style={{ maxWidth: "50rem" }}>
      <label className="form-label d-block">mydramalist.com</label>
      <div className="d-flex flex-wrap gap-2">
        <input
          type="url"
          className="form-control flex-fill"
          style={{ minWidth: "16rem" }}
          placeholder="https://mydramalist.com/people/…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setSuccess(false);
          }}
        />
        <button
          type="button"
          className="btn btn-outline-primary"
          disabled={isImporting || !url.trim()}
          onClick={handleImport}
        >
          {isImporting ? "Импорт…" : "Импортировать с mydramalist.com"}
        </button>
      </div>
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
      {success && !error && (
        <p className="small text-success mt-2 mb-0">
          Импорт выполнен — профиль и фильмография обновлены.
        </p>
      )}
    </div>
  );
}
