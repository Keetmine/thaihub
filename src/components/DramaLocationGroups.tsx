"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import VisitedButton from "@/components/VisitedButton";

export type DramaGroup = {
  id: string;
  title: string;
  href: string;
  locations: {
    id: string;
    name: string;
    href: string;
    photoUrl: string | null;
    visited: boolean;
  }[];
};

/**
 * Локации, сгруппированные по сериалам. Как и AlphabetDataList,
 * получает данные, а не готовую разметку: сервер отдавал сюда все
 * сериалы со всеми их локациями сразу, и вкладка весила 1.7 МБ.
 * Группы отрисовываются порциями по мере скролла, но весь список
 * остаётся на странице — переход по букве работает якорем.
 */
export default function DramaLocationGroups({
  groups,
  trailing,
  batch = 12,
}: {
  groups: DramaGroup[];
  /** Локации без сериала — отдельной секцией в конце. */
  trailing?: DramaGroup["locations"];
  batch?: number;
}) {
  const [visible, setVisible] = useState(batch);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= groups.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + batch, groups.length));
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, groups.length, batch]);

  if (groups.length === 0 && !trailing?.length) {
    return (
      <EmptyState
        emoji="📍"
        title="Локаций пока нет"
        hint="Мы добавляем места съёмок постепенно — загляните позже."
        compact
      />
    );
  }

  const letterOf = (title: string) => {
    const ch = title.trim().charAt(0) || "#";
    return /[0-9]/.test(ch) ? "0-9" : ch.toUpperCase();
  };
  const letters = Array.from(new Set(groups.map((g) => letterOf(g.title)))).sort();
  const firstIndexOfLetter = new Map<string, number>();
  groups.forEach((g, i) => {
    const l = letterOf(g.title);
    if (!firstIndexOfLetter.has(l)) firstIndexOfLetter.set(l, i);
  });

  const row = (loc: DramaGroup["locations"][number]) => (
    <div
      key={loc.id}
      className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
    >
      <Link
        href={loc.href}
        className="text-decoration-none d-flex align-items-center gap-3"
        style={{ minWidth: 0 }}
      >
        <div
          style={{
            width: "2.75rem",
            height: "2.75rem",
            borderRadius: "0.5rem",
            background: "var(--bs-secondary-bg)",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {loc.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              loading="lazy"
              decoding="async"
              src={loc.photoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>
        <span className="font-display fw-medium text-white text-truncate">{loc.name}</span>
      </Link>
      <VisitedButton locationId={loc.id} isVisited={loc.visited} className="flex-shrink-0" />
    </div>
  );

  return (
    <div className="performers-layout">
      <div className="performers-list">
        {groups.slice(0, visible).map((g) => (
          <section
            key={g.id}
            id={`letter-${letterOf(g.title)}`}
            className="performers-letter-section"
          >
            <Link href={g.href} className="day-group-heading mb-2">
              {g.title}
            </Link>
            <div className="d-flex flex-column gap-2 mt-2">{g.locations.map(row)}</div>
          </section>
        ))}

        {visible < groups.length && (
          <div ref={sentinelRef} className="small text-secondary py-3 text-center">
            Загружаем ещё…
          </div>
        )}

        {trailing && trailing.length > 0 && visible >= groups.length && (
          <section id="trailing-section" className="performers-letter-section">
            <h2 className="day-group-heading mb-2">Без сериала</h2>
            <div className="d-flex flex-column gap-2 mt-2">{trailing.map(row)}</div>
          </section>
        )}
      </div>

      <nav className="performers-index" aria-label="Быстрый переход по буквам">
        {letters.map((letter) => (
          <a
            key={letter}
            href={`#letter-${letter}`}
            className="performers-index-link"
            onClick={() => {
              // Группы этой буквы могут быть ещё не отрисованы — раскрываем
              // список до неё, иначе якорь ведёт в пустоту.
              const idx = firstIndexOfLetter.get(letter) ?? 0;
              if (idx + 1 > visible) setVisible(idx + batch);
            }}
          >
            {letter}
          </a>
        ))}
      </nav>
    </div>
  );
}
