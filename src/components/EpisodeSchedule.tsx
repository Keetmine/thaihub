"use client";

import { useState } from "react";
import { useT } from "@/components/LocaleProvider";

export type EpisodeScheduleRow = {
  number: number;
  /** Готовая подпись даты; null — дату ещё не объявили. Форматируется на
   *  сервере (src/lib/dates.ts): в клиент дата-объект не едет, чтобы её
   *  негде было случайно прочитать в часовом поясе браузера. */
  dateLabel: string | null;
  title: string | null;
  aired: boolean;
  isToday: boolean;
};

/** Сколько строк видно свёрнутым. */
const WINDOW = 10;

/**
 * График выхода серий на странице сериала: номер, дата и видно, что уже
 * вышло, а что впереди (CSS — `.episode-schedule` в globals.css).
 *
 * Длинные расписания (а у лакорнов бывает и полсотни серий) свёрнуты, но
 * окно берётся не с первой серии, а от «сегодня»: у выходящего сериала
 * человек пришёл за «что вышло вчера и что дальше», и первые серии
 * сезона отвечают не на его вопрос. У завершённого и у ещё не
 * начавшегося сериала «сегодня» в списке нет — там обычный список с
 * начала.
 */
export default function EpisodeSchedule({ rows }: { rows: EpisodeScheduleRow[] }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const s = t.catalog.drama.schedule;

  const total = rows.length;
  const lastAired = rows.findLastIndex((r) => r.aired);
  const midRun = lastAired >= 0 && lastAired < total - 1;
  // Пара вышедших серий над границей — чтобы было видно, откуда счёт.
  const start = Math.min(
    midRun ? Math.max(0, lastAired - 2) : 0,
    Math.max(0, total - WINDOW),
  );
  const end = Math.min(total, start + WINDOW);
  // Прятать одну-две строки незачем — тогда сразу весь список.
  const collapsed = !expanded && total - (end - start) > 2;
  const visible = collapsed ? rows.slice(start, end) : rows;

  // Кнопка над списком, когда спрятано начало: список, открывающийся с
  // четвёртой серии, иначе выглядит обрезанным, а объяснение лежало бы
  // под ним. Список с первой серии — кнопка внизу, как обычно.
  const toggle = collapsed ? (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${start > 0 ? "mb-2" : "mt-2"}`}
      onClick={() => setExpanded(true)}
    >
      {s.showAll(total)}
    </button>
  ) : null;

  return (
    <>
      {start > 0 && toggle}
      <ol className="episode-schedule">
        {visible.map((r) => (
          <li
            key={r.number}
            className={`episode-schedule-row${r.aired ? " is-aired" : ""}${
              r.isToday ? " is-today" : ""
            }`}
          >
            <span className="episode-schedule-dot" aria-hidden />
            <span className="episode-schedule-label">
              {s.episode(r.number)}
              {r.title && <span className="episode-schedule-title"> · {r.title}</span>}
            </span>
            {r.isToday ? (
              <span className="date-chip episode-schedule-chip">{s.today}</span>
            ) : (
              <span className="episode-schedule-date">{r.dateLabel ?? s.noDate}</span>
            )}
          </li>
        ))}
      </ol>
      {start === 0 && toggle}
    </>
  );
}
