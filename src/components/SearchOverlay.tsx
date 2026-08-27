"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppLink from "@/components/AppLink";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localeHref } from "@/lib/i18n/config";
import { searchLive, type LiveHit, type LiveSection } from "@/app/(public)/searchLiveActions";

const SECTIONS: LiveSection[] = ["all", "dramas", "performers", "events", "locations", "novels"];

/**
 * Поиск в шапке с живой выдачей (просьба владельца, по образцу
 * админской палитры Cmd+K).
 *
 * Фокус в поле открывает панель: чипы разделов, подсказки по мере
 * ввода, кнопка «Все фильтры» — на /search с тем же запросом и
 * разделом. Выбранный раздел сужает и подсказки, и адрес, куда уводит
 * Enter.
 *
 * Это прогрессивное улучшение поверх обычной GET-формы: без JS (и до
 * гидратации) Enter всё так же уводит на /search?q=… обычной отправкой.
 */
export default function SearchOverlay({ variant = "header" }: { variant?: "header" | "drawer" }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<LiveSection>("all");
  const [hits, setHits] = useState<LiveHit[]>([]);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLFormElement>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Клик мимо панели закрывает её. Слушатель живёт, только пока панель
  // открыта: постоянный document-слушатель от каждого поля поиска на
  // странице был бы лишним.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Живая выдача: пауза 250 мс и сторож последовательности — поздний
  // ответ на ранний ввод не должен затирать свежий (как в админской
  // палитре).
  function requestHits(nextQuery: string, nextSection: LiveSection) {
    if (timerRef.current) clearTimeout(timerRef.current);
    const seq = ++seqRef.current;
    if (nextQuery.trim().length < 2) {
      setHits([]);
      setActive(-1);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const result = await searchLive(nextQuery, nextSection);
        if (seq === seqRef.current) {
          setHits(result);
          setActive(-1);
        }
      } catch {
        // сеть моргнула — подсказок просто нет, поиск по Enter работает
      }
    }, 250);
  }

  const searchHref = (() => {
    const qs = new URLSearchParams();
    if (query.trim()) qs.set("q", query.trim());
    if (section !== "all") qs.set("section", section);
    return `/search${qs.size ? `?${qs}` : ""}`;
  })();

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLElement).blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (hits.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      // Кольцо с «ничего не выбрано» (-1) между концом и началом: Enter
      // без выбора отправляет обычную форму на /search.
      setActive((prev) => {
        const next = prev + delta;
        if (next < -1) return hits.length - 1;
        if (next >= hits.length) return -1;
        return next;
      });
      return;
    }
    if (e.key === "Enter" && active >= 0 && hits[active]) {
      e.preventDefault();
      setOpen(false);
      router.push(localeHref(hits[active].href, locale));
    }
  }

  return (
    <form
      ref={rootRef}
      action={localeHref("/search", locale)}
      method="GET"
      className={`live-search ${variant === "drawer" ? "live-search-drawer" : "live-search-header"}`}
      onSubmit={() => setOpen(false)}
    >
      <div className="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          name="q"
          autoComplete="off"
          placeholder={t.nav.searchPlaceholder}
          aria-label={t.nav.searchAria}
          className="pill-search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            requestHits(e.target.value, section);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {section !== "all" && <input type="hidden" name="section" value={section} />}

      {open && (
        <div className="live-search-panel">
          <div className="live-search-sections" role="tablist">
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`nav-chip-link ${s === section ? "active" : ""}`}
                aria-pressed={s === section}
                onClick={() => {
                  setSection(s);
                  requestHits(query, s);
                }}
              >
                {t.filters.sections[s]}
              </button>
            ))}
          </div>

          {hits.length > 0 ? (
            <div className="live-search-hits">
              {hits.map((hit, i) => (
                <AppLink
                  key={`${hit.kind}:${hit.href}`}
                  href={hit.href}
                  className={`live-search-hit ${i === active ? "active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  {hit.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hit.photoUrl}
                      alt=""
                      className="live-search-thumb"
                      style={hit.round ? { borderRadius: "50%" } : undefined}
                    />
                  ) : (
                    <span className="live-search-thumb d-inline-flex align-items-center justify-content-center small">
                      {hit.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-truncate">
                    {hit.name}
                    {hit.subtitle && (
                      <span className="text-secondary small"> · {hit.subtitle}</span>
                    )}
                  </span>
                  <span className="live-search-kind">{t.filters.sections[hit.kind]}</span>
                </AppLink>
              ))}
            </div>
          ) : (
            <p className="small text-secondary mb-0 px-2">
              {query.trim().length >= 2 ? t.filters.live.empty : t.filters.live.hint}
            </p>
          )}

          <AppLink
            href={searchHref}
            className="btn btn-ghost btn-sm align-self-start"
            onClick={() => setOpen(false)}
          >
            {t.filters.live.allFilters} →
          </AppLink>
        </div>
      )}
    </form>
  );
}
