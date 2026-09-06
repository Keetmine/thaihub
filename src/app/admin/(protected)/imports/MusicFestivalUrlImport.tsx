"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  importMusicFestivalEvent,
} from "@/app/admin/(protected)/events/importActions";
import type { MusicFestivalSingleImport } from "@/lib/musicFestivalCrawl";
import { adminEntityHref } from "@/app/admin/entityHref";

/**
 * Разовый импорт одного фестиваля musicfestival.in.th по ссылке — не
 * дожидаясь суточной задачи (просьба владельца 2026-09-06). Экрана
 * проверки, как у билетных сайтов, здесь нет намеренно: у этого
 * источника событие создаётся сразу со всем составом и расписанием —
 * ровно так же, как это делает обход.
 */
export default function MusicFestivalUrlImport() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MusicFestivalSingleImport | null>(null);

  async function handleImport() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const imported = await importMusicFestivalEvent(url);
      setResult(imported);
      if (imported.status === "created") {
        setUrl("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось спарсить страницу");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mt-3" style={{ maxWidth: "40rem" }}>
      <label className="form-label small text-secondary" htmlFor="musicfestival-url">
        Фестиваль по ссылке
      </label>
      <div className="d-flex flex-wrap gap-2">
        <input
          id="musicfestival-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim() && !isRunning) handleImport();
          }}
          placeholder="https://www.musicfestival.in.th/en/festivals/…"
          className="form-control flex-fill"
          style={{ minWidth: "18rem" }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleImport}
          disabled={isRunning || !url.trim()}
        >
          {isRunning ? "Парсинг…" : "Спарсить"}
        </button>
      </div>
      {error && <p className="small text-danger mb-0 mt-2">{error}</p>}
      {result && (
        <p className="small mb-0 mt-2">
          {result.status === "created" && (
            <>
              Готово: «{result.title}» — дней {result.dates}, привязано{" "}
              {result.performersLinked}, заготовок +{result.performersCreated}.{" "}
            </>
          )}
          {result.status === "exists" && <>Это событие уже заведено: «{result.title}». </>}
          {result.status === "duplicate" && (
            <>
              Похоже на уже заведённое «{result.existingTitle}» — не создавала, посмотрите
              сами.{" "}
            </>
          )}
          <a href={adminEntityHref("Event", result.eventId)!}>Открыть событие</a>
        </p>
      )}
    </div>
  );
}
