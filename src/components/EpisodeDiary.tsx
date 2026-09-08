"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  toggleEpisodeWatch,
  setEpisodeNote,
} from "@/app/(public)/dramas/episodeActions";
import { useT } from "@/components/LocaleProvider";

/** Строка дневника, как её отдаёт сервер: дата уже отформатирована там
 *  же, где и даты графика серий, — чтобы её негде было случайно
 *  прочитать в часовом поясе браузера. */
export type EpisodeDiaryEntry = {
  episode: number;
  dateLabel: string;
  note: string;
};

/**
 * Дневник серий (аудит 2026-09 §7): свёртка рядом со счётчиком серий на
 * странице сериала. Внутри — список серий, у каждой галочка «смотрела»
 * (создаёт/удаляет `EpisodeWatch` с датой «сейчас») и однострочная
 * заметка, сохраняющаяся по уходу из поля.
 *
 * Свёртка нативная, на details/summary — тем же приёмом (и теми же
 * классами .schedule-fold*), что график выхода серий: состояние и работа
 * с клавиатуры достаются от summary, клиентский код тут нужен только
 * строкам. По умолчанию свёрнут: дневник — инструмент на любителя, и
 * разворачивать десятки строк каждому посетителю страницы незачем.
 *
 * Заметки — личные: сервер отдаёт сюда только строки владельца, и нигде
 * больше (чужой профиль, каталог) они не показываются.
 */
export default function EpisodeDiary({
  dramaId,
  episodes,
  entries,
  todayLabel,
}: {
  dramaId: string;
  /** Номера серий для списка, по возрастанию: 1..N при известном числе
   *  серий, иначе отмеченные плюс одна следующая (считает сервер). */
  episodes: number[];
  entries: EpisodeDiaryEntry[];
  /** Подпись сегодняшней даты — для только что поставленной галочки,
   *  пока router.refresh() не привёз серверную. Форматируется на
   *  сервере, как и остальные даты. */
  todayLabel: string;
}) {
  const t = useT();
  const byEpisode = new Map(entries.map((e) => [e.episode, e]));
  return (
    <details className="schedule-fold episode-diary small text-secondary">
      <summary>
        <span className="drama-fact-label">{t.catalog.diary.title}</span>{" "}
        <span className="episode-diary-hint">
          {t.catalog.diary.privacyHint}
        </span>{" "}
        <span className="schedule-fold-toggle">
          <span className="schedule-fold-more">{t.catalog.diary.open}</span>
          <span className="schedule-fold-less">{t.catalog.diary.hide}</span>
          <span className="schedule-fold-caret" aria-hidden>
            ▾
          </span>
        </span>
      </summary>
      <div className="schedule-fold-body episode-diary-list">
        {episodes.map((n) => (
          <DiaryRow
            key={n}
            dramaId={dramaId}
            episode={n}
            entry={byEpisode.get(n) ?? null}
            todayLabel={todayLabel}
          />
        ))}
      </div>
    </details>
  );
}

/**
 * Одна серия: галочка, заметка, дата отметки.
 *
 * Галочка оптимистичная, как счётчик серий: щёлкнул — видно сразу,
 * `router.refresh()` следом подтягивает страницу (отметка серии N
 * двигает счётчик до N и может переставить статус — см. комментарий в
 * episodeActions.ts). Ошибка приходит значением и откатывает галочку.
 *
 * Синхронизация с пропами — приёмом EpisodeProgress: сравниваем
 * примитивы прямо в рендере, а не в useEffect. Сравнение именно
 * примитивов (а не ссылки на entry) — чтобы refresh после действия в
 * СОСЕДНЕЙ строке не стирал недописанный черновик заметки в этой.
 */
function DiaryRow({
  dramaId,
  episode,
  entry,
  todayLabel,
}: {
  dramaId: string;
  episode: number;
  entry: EpisodeDiaryEntry | null;
  todayLabel: string;
}) {
  const t = useT();
  const router = useRouter();
  const propWatched = entry !== null;
  const propNote = entry?.note ?? "";
  const propDate = entry?.dateLabel ?? null;

  const [watched, setWatched] = useState(propWatched);
  const [dateLabel, setDateLabel] = useState(propDate);
  const [draft, setDraft] = useState(propNote);
  const [savedNote, setSavedNote] = useState(propNote);
  const [seen, setSeen] = useState(`${propWatched}|${propNote}|${propDate}`);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const propKey = `${propWatched}|${propNote}|${propDate}`;
  if (propKey !== seen) {
    setSeen(propKey);
    setWatched(propWatched);
    setDateLabel(propDate);
    setDraft(propNote);
    setSavedNote(propNote);
  }

  function toggle() {
    const next = !watched;
    const prevDate = dateLabel;
    setWatched(next);
    setDateLabel(next ? todayLabel : null);
    setError(null);
    startTransition(async () => {
      const result = await toggleEpisodeWatch(dramaId, episode);
      if (!result.ok) {
        setWatched(!next);
        setDateLabel(prevDate);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function commitNote() {
    // Сравниваем обрезанное: сервер всё равно хранит trim, и «нота » за
    // «нота» не должна гонять запрос впустую.
    if (draft.trim() === savedNote.trim()) return;
    startTransition(async () => {
      const result = await setEpisodeNote(dramaId, episode, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedNote(draft.trim());
      setError(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="episode-diary-row">
        <input
          type="checkbox"
          className="form-check-input episode-diary-check"
          checked={watched}
          disabled={isPending}
          aria-label={
            watched ? t.catalog.diary.unmark(episode) : t.catalog.diary.mark(episode)
          }
          onChange={toggle}
        />
        <span className="episode-diary-num">
          {t.catalog.diary.episode(episode)}
        </span>
        {/* Поле у неотмеченной серии выключено: заметка живёт на самой
            отметке, и писать впечатление о непросмотренном некуда. */}
        <input
          type="text"
          className="episode-diary-note"
          value={draft}
          maxLength={500}
          placeholder={watched ? t.catalog.diary.notePlaceholder : ""}
          disabled={!watched || isPending}
          aria-label={t.catalog.diary.noteLabel(episode)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitNote()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitNote();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {dateLabel && <span className="episode-diary-date">{dateLabel}</span>}
      </div>
      {error && <p className="small text-danger mb-0">{error}</p>}
    </div>
  );
}
