"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import PosterTile from "@/components/PosterTile";
import { useT } from "@/components/LocaleProvider";
import { pickDramas, type PickResult } from "@/app/(public)/dramas/pickActions";
import {
  DEFAULT_ANSWERS,
  MOODS,
  PICK_GENRES,
  SEEN_MODES,
  AIR_MODES,
  type PickAnswers,
} from "@/lib/dramaPicker";

/**
 * «Подобрать сериал» — кнопка и квиз в попапе (правка владельца
 * 2026-09-16).
 *
 * Зачем рядом с рулеткой: рулетка отдаёт случайное, это игра. Квиз
 * спрашивает, чего человек хочет сейчас, — «хочу поплакать над
 * чем-нибудь законченным» рулетка не понимает.
 *
 * Один вопрос на экран, а не анкета простынёй: четыре коротких выбора
 * проходятся быстрее, чем одна форма с четырьмя группами, и на каждом
 * шаге видно, сколько осталось. Назад можно — передумать на третьем
 * вопросе нормально.
 *
 * Вопрос «новое или пересмотреть» показывается ТОЛЬКО залогиненным: у
 * гостя отметок нет, и оба ответа означали бы одно и то же.
 */
export default function PickDramaButton({ loggedIn = false }: { loggedIn?: boolean }) {
  const t = useT();
  const p = t.catalog.picker;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<PickAnswers>(DEFAULT_ANSWERS);
  const [results, setResults] = useState<PickResult[] | null>(null);
  const [relaxed, setRelaxed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Шаги собираются здесь, а не константой: вопрос про отметки есть не
  // у всех, и «Вопрос 3 из 4» у гостя было бы враньём.
  const steps = [
    {
      key: "mood" as const,
      title: p.moodTitle,
      options: MOODS.map((v) => ({ value: v, label: p.mood[v] })),
    },
    {
      key: "genre" as const,
      title: p.genreTitle,
      options: PICK_GENRES.map((v) => ({ value: v, label: p.genre[v] })),
    },
    ...(loggedIn
      ? [
          {
            key: "seen" as const,
            title: p.seenTitle,
            options: SEEN_MODES.map((v) => ({ value: v, label: p.seen[v] })),
          },
        ]
      : []),
    {
      key: "air" as const,
      title: p.airTitle,
      options: AIR_MODES.map((v) => ({ value: v, label: p.air[v] })),
    },
  ];

  function reset() {
    setStep(0);
    setAnswers(DEFAULT_ANSWERS);
    setResults(null);
    setRelaxed(false);
    setFailed(false);
  }

  async function run(final: PickAnswers) {
    setBusy(true);
    setFailed(false);
    try {
      const res = await pickDramas(final);
      setResults(res.results);
      setRelaxed(res.relaxed);
    } catch {
      // Текст исключения из серверного действия до клиента в проде не
      // доезжает — показываем своё сообщение и даём попробовать снова.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function choose(value: string) {
    const current = steps[step];
    const next = { ...answers, [current.key]: value } as PickAnswers;
    setAnswers(next);
    if (step + 1 < steps.length) setStep(step + 1);
    else void run(next);
  }

  const current = steps[step];
  const showQuiz = results === null && !busy;

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm flex-shrink-0"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <span aria-hidden>🎯</span>
        <span className="d-none d-md-inline ms-1">{p.open}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={p.title} wide={results !== null}>
        {busy && <p className="text-secondary mb-0">{p.searching}</p>}

        {showQuiz && (
          <div>
            <p className="small text-secondary mb-2">{p.step(step + 1, steps.length)}</p>
            <p className="fw-semibold mb-3">{current.title}</p>
            <div className="d-flex flex-wrap gap-2">
              {current.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="chip-link chip-toggle"
                  onClick={() => choose(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {step > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-3"
                onClick={() => setStep(step - 1)}
              >
                ← {p.back}
              </button>
            )}
          </div>
        )}

        {failed && <p className="text-danger mb-0">{p.failed}</p>}

        {results !== null && !busy && (
          <div>
            <p className="fw-semibold mb-1">{p.results}</p>
            {/* Условия пришлось ослабить — говорим об этом прямо, иначе
                человек решит, что квиз его не услышал. */}
            {relaxed && <p className="small text-secondary mb-3">{p.relaxed}</p>}
            <div className="poster-grid">
              {results.map((r) => (
                <PosterTile
                  key={r.id}
                  href={r.href}
                  posterUrl={r.posterUrl}
                  title={r.title}
                  subtitle={r.year ? String(r.year) : undefined}
                />
              ))}
            </div>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void run(answers)}
              >
                {p.again}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                {p.restart}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
