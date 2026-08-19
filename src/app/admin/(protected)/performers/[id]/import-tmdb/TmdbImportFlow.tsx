"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  previewTmdbImport,
  commitTmdbImport,
  type TmdbImportPreview,
  type TmdbImportResult,
} from "../../tmdbActions";
import { DRAMA_STATUS_LABELS } from "@/lib/dramaStatus";

export default function TmdbImportFlow({
  performerId,
  initialTmdbId,
}: {
  performerId: string;
  initialTmdbId: string | null;
}) {
  const router = useRouter();
  const [input, setInput] = useState(initialTmdbId ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TmdbImportPreview | null>(null);
  const [placeOfBirth, setPlaceOfBirth] = useState("");
  const [selectedTvIds, setSelectedTvIds] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<TmdbImportResult | null>(null);

  async function handleLookup() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const found = await previewTmdbImport(input.trim());
      setPreview(found);
      setPlaceOfBirth(found.placeOfBirth ?? "");
      setSelectedTvIds(new Set(found.knownFor.filter((s) => !s.alreadyImported).map((s) => s.tvId)));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Не удалось найти актёра на TMDB");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleShow(tvId: number) {
    setSelectedTvIds((prev) => {
      const next = new Set(prev);
      if (next.has(tvId)) next.delete(tvId);
      else next.add(tvId);
      return next;
    });
  }

  async function handleConfirm() {
    if (!preview) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await commitTmdbImport({
        performerId,
        tmdbPersonId: preview.tmdbPersonId,
        placeOfBirth,
        selectedTvIds: Array.from(selectedTvIds),
      });
      setResult(res);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не удалось выполнить импорт");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="surface p-4" style={{ maxWidth: "34rem" }}>
        <p className="mb-2">
          Готово: {result.createdDramas} новых сериалов, {result.updatedDramas} обновлено,{" "}
          {result.createdPerformers} новых исполнителей в составе.
        </p>
        <a href={`/admin/performers/${performerId}/edit`} className="btn btn-primary btn-sm">
          К исполнителю
        </a>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-wrap gap-2" style={{ maxWidth: "34rem" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://www.themoviedb.org/person/1425729 или 1425729"
          className="form-control"
          style={{ flex: "1 1 16rem" }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={isLoading || !input.trim()}
          onClick={handleLookup}
        >
          {isLoading ? "Поиск…" : "Найти"}
        </button>
      </div>
      {loadError && <p className="small text-danger mb-0">{loadError}</p>}

      {preview && (
        <div className="d-flex flex-column gap-4">
          <div className="surface p-4 d-flex gap-3" style={{ maxWidth: "34rem" }}>
            {preview.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                loading="lazy"
                decoding="async"
                src={preview.photoUrl}
                alt={preview.name}
                style={{ width: "5rem", height: "5rem", borderRadius: "0.5rem", objectFit: "cover", flexShrink: 0 }}
              />
            )}
            <div className="flex-fill">
              <p className="font-display fw-medium text-white mb-2">{preview.name}</p>
              <label className="form-label small text-secondary mb-1">Место рождения</label>
              <input
                type="text"
                value={placeOfBirth}
                onChange={(e) => setPlaceOfBirth(e.target.value)}
                className="form-control form-control-sm"
              />
            </div>
          </div>

          <div>
            <label className="form-label d-block">
              Известные сериалы ({selectedTvIds.size} выбрано из {preview.knownFor.length})
            </label>
            <div className="d-flex flex-column gap-2">
              {preview.knownFor.map((show) => (
                <label
                  key={show.tvId}
                  className="surface d-flex align-items-center gap-3 p-3"
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTvIds.has(show.tvId)}
                    onChange={() => toggleShow(show.tvId)}
                    className="form-check-input flex-shrink-0"
                  />
                  <div
                    style={{
                      width: "2.75rem",
                      height: "3.75rem",
                      borderRadius: "0.5rem",
                      background: "var(--bs-secondary-bg)",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    {show.posterUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={show.posterUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                  </div>
                  <div className="flex-fill" style={{ minWidth: 0 }}>
                    <p className="font-display fw-medium text-white mb-0 text-truncate">
                      {show.name} {show.year ? `(${show.year})` : ""}
                    </p>
                    <p className="small text-secondary mb-0 text-truncate">роль: {show.character}</p>
                    <div className="d-flex gap-1 mt-1">
                      {show.status && (
                        <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.65rem" }}>
                          {DRAMA_STATUS_LABELS[show.status]}
                        </span>
                      )}
                      {show.alreadyImported && (
                        <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.65rem" }}>
                          уже в базе
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {submitError && <p className="small text-danger mb-0">{submitError}</p>}

          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSubmitting}
              onClick={handleConfirm}
            >
              {isSubmitting ? "Импорт…" : `Импортировать (${selectedTvIds.size})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
