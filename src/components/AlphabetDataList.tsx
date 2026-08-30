"use client";

import UploadImage from "@/components/UploadImage";
import { useEffect, useRef, useState } from "react";
import AppLink from "@/components/AppLink";
import { useT } from "@/components/LocaleProvider";
import AlphabetRail from "./AlphabetRail";
import VisitedButton from "@/components/VisitedButton";
import FavoriteButton from "@/components/FavoriteButton";
import AddToListButton from "@/components/AddToListButton";

export type AlphabetRow = {
  id: string;
  name: string;
  href: string;
  photoUrl?: string | null;
  /** Мелкая подпись под названием (например, «3 сериала»). */
  subtitle?: string | null;
  /** Приписка справа от названия серым — «(реальное имя)». */
  nameSuffix?: string | null;
  /** Текст в конце строки: «12 событ.». */
  meta?: string | null;
  /** Локации: отметка «была здесь» — кнопка рисуется справа. */
  visited?: boolean;
  /** Исполнители: в избранном ли. */
  favorited?: boolean;
};

function firstLetterOf(name: string): string {
  const ch = name.trim().charAt(0) || "#";
  if (/[0-9]/.test(ch)) return "0-9";
  return ch.toUpperCase();
}


/**
 * Алфавитный список, который получает ДАННЫЕ, а не готовую разметку.
 *
 * Раньше строки рендерил сервер, и в браузер уезжала разметка всех
 * записей целиком: /locations весила 1.27 МБ на 567 строк, потому что
 * LazyList откладывал только монтирование, а RSC-поток нёс всё равно
 * всё. Здесь сервер отдаёт компактный массив (имя, ссылка, фото), а
 * строки строятся на клиенте — это десятки килобайт вместо мегабайта,
 * и при этом весь список остаётся на странице, так что переход по букве
 * работает обычным скроллом, без перезагрузки.
 *
 * Отрисовка порционная: первые `batch` строк сразу, дальше по мере
 * приближения к концу списка.
 */
export default function AlphabetDataList({
  rows,
  emptyMessage,
  batch = 40,
  showVisitedButton = false,
  showFavoriteButton = false,
  addToList,
  variant = "rows",
  cardAspect = "3 / 4",
  pinned,
  letterHrefBase,
}: {
  rows: AlphabetRow[];
  emptyMessage: string;
  batch?: number;
  showVisitedButton?: boolean;
  /** Исполнители: сердечко «в избранное» в конце строки. */
  showFavoriteButton?: boolean;
  /** Кнопка «+ в список»: списки пользователя и server action, который
   *  кладёт в выбранный. Без неё кнопка не рисуется (гости, пустые
   *  списки). */
  addToList?: {
    lists: { id: string; title: string }[];
    add: (listId: string, itemId: string) => Promise<void | { ok: boolean; error?: string }>;
  };
  /** «cards» — фото-сетка .poster-grid (Э2.4) вместо строк-плашек. */
  variant?: "rows" | "cards";
  /** Пропорции фото карточки: портрет для людей, альбом для мест. */
  cardAspect?: "3 / 4" | "4 / 3";
  /** Закреплённая секция ПЕРЕД алфавитом внутри того же списка
   *  («Избранное»): без букв, с якорем над буквами в общей рейке. */
  pinned?: {
    id?: string;
    heading: React.ReactNode;
    rows: AlphabetRow[];
    indexLabel: React.ReactNode;
    indexAriaLabel: string;
  };
  /** С-5: делает буквы рейки настоящими ссылками `${base}X` на
   *  серверные страницы буквы (клик зрителя остаётся скроллом). */
  letterHrefBase?: string;
}) {
  const t = useT();
  const [visible, setVisible] = useState(batch);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= rows.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + batch, rows.length));
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rows.length, batch]);

  const pinnedRows = pinned?.rows ?? [];
  if (rows.length === 0 && pinnedRows.length === 0) {
    return <p className="text-secondary">{emptyMessage}</p>;
  }

  const actionButtons = (row: AlphabetRow) => (
    <>
      {showVisitedButton && <VisitedButton locationId={row.id} isVisited={!!row.visited} />}
      {showFavoriteButton && (
        <FavoriteButton kind="performer" id={row.id} isFavorited={!!row.favorited} variant="icon" />
      )}
      {addToList && addToList.lists.length > 0 && (
        <AddToListButton
          lists={addToList.lists.map((l) => ({ ...l, hasPerformer: false }))}
          onAdd={(listId) => addToList.add(listId, row.id)}
        />
      )}
    </>
  );

  const renderCardCell = (row: AlphabetRow) => (
    <div key={row.id} className="position-relative">
      <AppLink href={row.href} className="text-decoration-none d-block">
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: cardAspect,
            borderRadius: "0.9rem",
            background: "var(--bs-secondary-bg)",
            overflow: "hidden",
          }}
        >
          {row.photoUrl ? (
            <UploadImage
              src={row.photoUrl}
              alt=""
              sizes="(max-width: 575.98px) 45vw, 12rem"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span
              className="d-flex align-items-center justify-content-center h-100 font-display fw-bold"
              style={{ fontSize: "2rem", color: "rgba(255,154,114,0.45)" }}
              aria-hidden
            >
              {row.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          {row.meta && (
            <span
              className="date-chip position-absolute"
              style={{ left: "0.5rem", bottom: "0.5rem" }}
            >
              {row.meta}
            </span>
          )}
        </div>
        <p className="small text-white mb-0 mt-2 text-truncate" style={{ lineHeight: 1.3 }}>
          {row.name}
        </p>
        {(row.nameSuffix || row.subtitle) && (
          <p className="small text-secondary mb-0 text-truncate">
            {row.nameSuffix ?? row.subtitle}
          </p>
        )}
      </AppLink>
      <div
        className="position-absolute d-flex align-items-center gap-1"
        style={{ top: "0.375rem", right: "0.375rem" }}
      >
        {actionButtons(row)}
      </div>
    </div>
  );

  const renderRowCell = (row: AlphabetRow) => (
    <div
      key={row.id}
      className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
    >
      <AppLink
        href={row.href}
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
          {row.photoUrl && (
            <UploadImage
              src={row.photoUrl}
              alt=""
              sizes="(max-width: 575.98px) 45vw, 12rem"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>
        <span style={{ minWidth: 0 }}>
          <span className="font-display fw-medium text-white d-block text-truncate">
            {row.name}
            {row.nameSuffix && (
              <span className="text-secondary fw-normal"> ({row.nameSuffix})</span>
            )}
          </span>
          {row.subtitle && <span className="small text-secondary">{row.subtitle}</span>}
        </span>
      </AppLink>
      <div className="d-flex align-items-center gap-2 flex-shrink-0">
        {row.meta && <span className="small text-secondary me-1">{row.meta}</span>}
        {actionButtons(row)}
      </div>
    </div>
  );

  // Буквы считаем по всем строкам, а показываем — по отрисованным:
  // навигация должна знать про весь список, иначе ссылки на ещё не
  // отрисованные буквы вели бы в пустоту.
  const groups = new Map<string, AlphabetRow[]>();
  for (const row of rows) {
    const letter = firstLetterOf(row.name);
    const bucket = groups.get(letter);
    if (bucket) bucket.push(row);
    else groups.set(letter, [row]);
  }
  const letters = Array.from(groups.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let rendered = 0;
  const sections: React.ReactNode[] = [];
  for (const letter of letters) {
    if (rendered >= visible) break;
    const bucket = groups.get(letter)!;
    const slice = bucket.slice(0, Math.max(0, visible - rendered));
    rendered += slice.length;
    sections.push(
      <section key={letter} id={`letter-${letter}`} className="performers-letter-section">
        <h2 className="performers-letter-heading">{letter}</h2>
        {variant === "cards" ? (
          <div className="poster-grid">{slice.map(renderCardCell)}</div>
        ) : (
          <div className="d-flex flex-column gap-2">{slice.map(renderRowCell)}</div>
        )}
      </section>,
    );
  }

  return (
    <div className="performers-layout">
      <div className="performers-list">
        {pinnedRows.length > 0 && (
          <section
            id={pinned!.id ?? "pinned"}
            className="performers-letter-section"
          >
            <h2 className="performers-letter-heading d-flex align-items-center gap-2">
              {pinned!.heading}
            </h2>
            {/* Закреплённое — короткое, рендерим целиком без порций. */}
            {variant === "cards" ? (
              <div className="poster-grid">{pinnedRows.map(renderCardCell)}</div>
            ) : (
              <div className="d-flex flex-column gap-2">{pinnedRows.map(renderRowCell)}</div>
            )}
          </section>
        )}
        {sections}
        {visible < rows.length && (
          <div ref={sentinelRef} className="small text-secondary py-3 text-center">
            {t.catalog.loadingMore}
          </div>
        )}
      </div>

      <AlphabetRail
        letters={letters}
        ariaLabel={t.catalog.letterIndex}
        letterHrefBase={letterHrefBase}
        pinned={
          pinnedRows.length > 0
            ? {
                href: `#${pinned!.id ?? "pinned"}`,
                label: pinned!.indexLabel,
                ariaLabel: pinned!.indexAriaLabel,
              }
            : undefined
        }
        onLetter={(letter, i) => {
          // Буква может быть ещё не отрисована — раскрываем список
          // до неё, иначе якорь никуда не ведёт.
          const upTo = letters.slice(0, i + 1).reduce((n, l) => n + groups.get(l)!.length, 0);
          if (upTo > visible) setVisible(upTo);
        }}
      />
    </div>
  );
}
