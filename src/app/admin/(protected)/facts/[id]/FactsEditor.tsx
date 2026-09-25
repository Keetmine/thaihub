"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyFacts, rejectFacts, saveFactsProposal } from "../actions";

/**
 * Ручная правка предложения (просьба владельца 2026-09-26: «разреши
 * мне руками править исходный вариант и перевод»). По факту на строку,
 * английский и русский — в одном порядке: строка N перевода — это
 * перевод строки N оригинала. Сохранение пересчитывает сравнение на
 * странице; «Применить» берёт сохранённый вариант.
 */
export default function FactsEditor({
  id,
  en,
  ru,
  canApply,
  decided,
}: {
  id: string;
  en: string[];
  ru: string[];
  canApply: boolean;
  decided: boolean;
}) {
  const router = useRouter();
  const [enText, setEnText] = useState(en.join("\n"));
  const [ruText, setRuText] = useState(ru.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const count = (t: string) => t.split("\n").filter((l) => l.trim()).length;
  const enCount = count(enText);
  const ruCount = count(ruText);
  const dirty = enText !== en.join("\n") || ruText !== ru.join("\n");

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("en", enText);
    fd.set("ru", ruText);
    start(async () => {
      const r = await saveFactsProposal(id, fd);
      if (!r.ok) setError(r.error ?? "Не сохранилось");
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function apply() {
    setError(null);
    start(async () => {
      const r = await applyFacts(id);
      if (!r.ok) setError(r.error ?? "Не применилось");
      else router.refresh();
    });
  }

  function reject() {
    start(async () => {
      await rejectFacts(id);
      router.refresh();
    });
  }

  return (
    <div className="surface p-3">
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <label className="form-label small text-secondary" htmlFor="facts-en">
            Английский — по факту на строку ({enCount})
          </label>
          <textarea
            id="facts-en"
            className="form-control small"
            rows={Math.min(24, Math.max(8, enCount + 2))}
            value={enText}
            onChange={(e) => setEnText(e.target.value)}
            disabled={decided}
          />
        </div>
        <div className="col-12 col-lg-6">
          <label className="form-label small text-secondary" htmlFor="facts-ru">
            Перевод — строка N = перевод строки N ({ruCount})
          </label>
          <textarea
            id="facts-ru"
            className="form-control small"
            rows={Math.min(24, Math.max(8, ruCount + 2))}
            value={ruText}
            onChange={(e) => setRuText(e.target.value)}
            disabled={decided}
          />
        </div>
      </div>

      {enCount !== ruCount && !decided && (
        <p className="small text-warning mt-2 mb-0">
          Строк в английском {enCount}, в переводе {ruCount} — должно быть поровну.
        </p>
      )}
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
      {saved && !dirty && <p className="small text-success mt-2 mb-0">Сохранено — сравнение выше обновлено.</p>}

      {!decided && (
        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={save} disabled={pending || !dirty}>
            {pending ? "Сохраняем…" : "Сохранить правку"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={apply}
            disabled={pending || dirty || !canApply}
            title={dirty ? "Сначала сохраните правку" : !canApply ? "Предложения ещё нет" : undefined}
          >
            Применить на сайт
          </button>
          <button type="button" className="btn btn-ghost btn-sm text-danger ms-auto" onClick={reject} disabled={pending}>
            Отклонить
          </button>
        </div>
      )}
    </div>
  );
}
