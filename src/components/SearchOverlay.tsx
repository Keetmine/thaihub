"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import AppLink from "@/components/AppLink";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localeHref } from "@/lib/i18n/config";
import { SearchIcon } from "@/components/icons";
import {
  searchLive,
  type LiveHit,
  type LiveSection,
} from "@/app/(public)/searchLiveActions";

const SECTIONS: LiveSection[] = [
  "all",
  "dramas",
  "performers",
  "events",
  "locations",
  "novels",
];

/**
 * Поиск в шапке: клик поднимает отдельную палитру поверх страницы — как
 * админский Cmd+K, и на его же стилях (.quick-search-*). В палитре своё
 * большое поле, чипы разделов, живые подсказки и выход «Все фильтры» на
 * /search с тем же запросом и разделом.
 *
 * Поле в шапке — не поле, а кнопка-триггер, нарисованная как поле. До
 * гидратации это обычная ссылка на /search: клик без JS уводит на
 * страницу поиска, где есть всё то же самое.
 */
export default function SearchOverlay({
  variant = "header",
}: {
  variant?: "header" | "drawer";
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<LiveSection>("all");
  const [hits, setHits] = useState<LiveHit[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Открытие — с чистого листа и с фокусом в поле: палитра каждый раз
  // новый разговор, а не продолжение прошлого.
  function openPalette() {
    setQuery("");
    setHits([]);
    setActive(-1);
    setSection("all");
    setOpen(true);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Живая выдача: пауза 250 мс и сторож последовательности — поздний
  // ответ на ранний ввод не должен затирать свежий.
  function requestHits(nextQuery: string, nextSection: LiveSection) {
    if (timerRef.current) clearTimeout(timerRef.current);
    const seq = ++seqRef.current;
    if (nextQuery.trim().length < 2) {
      setHits([]);
      setActive(-1);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const result = await searchLive(nextQuery, nextSection);
        if (seq === seqRef.current) {
          setHits(result);
          setActive(-1);
        }
      } catch {
        // сеть моргнула — подсказок просто нет, Enter и «Все фильтры» работают
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 250);
  }

  const searchHref = (() => {
    const qs = new URLSearchParams();
    if (query.trim()) qs.set("q", query.trim());
    if (section !== "all") qs.set("section", section);
    return `/search${qs.size ? `?${qs}` : ""}`;
  })();

  function go(href: string) {
    setOpen(false);
    router.push(localeHref(href, locale));
  }

  return (
    <>
      {/* Триггер. Ссылка, а не кнопка: без JS клик честно уводит на
          /search. Внешность — как у прежнего поля поиска. */}
      <AppLink
        href="/search"
        className={
          variant === "drawer"
            ? "search-palette-trigger w-100"
            : "search-palette-trigger"
        }
        onClick={(e) => {
          e.preventDefault();
          openPalette();
        }}
        aria-label={t.nav.searchAria}
      >
        <SearchIcon />
        <span>{t.nav.searchPlaceholder}</span>
      </AppLink>

      {/* Палитра — порталом в body: у .pill-nav стоит backdrop-filter,
          и он делает position:fixed потомков относительным ШАПКИ —
          затемнение накрывало бы только её, а не страницу. Ровно та же
          причина, по которой мобильная шторка живёт вне навбара. */}
      {open &&
        createPortal(
          <div
            className="quick-search-backdrop"
            onMouseDown={() => setOpen(false)}
          >
            <div
              className="quick-search"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <form
                action={localeHref("/search", locale)}
                method="GET"
                onSubmit={(e) => {
                  // И17: закрывать палитру на submit нельзя — портал
                  // размонтирует форму раньше, чем браузер уйдёт по
                  // адресу, и переход отменяется (Enter «не работал»).
                  // Уходим сами роутером, как это делает выбор подсказки
                  // стрелками; action остаётся запасом на «до гидратации».
                  e.preventDefault();
                  go(searchHref);
                }}
              >
                <input
                  ref={inputRef}
                  type="search"
                  name="q"
                  autoComplete="off"
                  value={query}
                  placeholder={t.filters.live.hint}
                  aria-label={t.nav.searchAria}
                  className="form-control form-control-lg"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    requestHits(e.target.value, section);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      if (hits.length === 0) return;
                      const delta = e.key === "ArrowDown" ? 1 : -1;
                      // Кольцо с «ничего не выбрано» (-1): Enter без
                      // выбора отправляет форму на /search.
                      setActive((prev) => {
                        const next = prev + delta;
                        if (next < -1) return hits.length - 1;
                        if (next >= hits.length) return -1;
                        return next;
                      });
                    } else if (
                      e.key === "Enter" &&
                      active >= 0 &&
                      hits[active]
                    ) {
                      e.preventDefault();
                      go(hits[active].href);
                    }
                  }}
                />
                {section !== "all" && (
                  <input type="hidden" name="section" value={section} />
                )}
              </form>

              <div className="search-palette-sections">
                {SECTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`search-palette-chip ${s === section ? "active" : ""}`}
                    aria-pressed={s === section}
                    onClick={() => {
                      setSection(s);
                      requestHits(query, s);
                      inputRef.current?.focus();
                    }}
                  >
                    {t.filters.sections[s]}
                  </button>
                ))}
              </div>

              {/* Пока не набрали двух букв, блока результатов нет вовсе
                (правка владельца 2026-09-09). Раньше на его месте
                висело «Начните вводить название или имя», и подсказку
                принимали за второе поле ввода — та же фраза стоит
                плейсхолдером в самой строке поиска, и повторять её
                отдельной строкой незачем. */}
              {query.trim().length >= 2 && (
                <div className="quick-search-hits">
                  {loading && hits.length === 0 ? (
                    <p className="small text-secondary m-0 p-3">
                      {t.common.loading}
                    </p>
                  ) : hits.length === 0 ? (
                    <p className="small text-secondary m-0 p-3">
                      {t.common.nothingFound}
                    </p>
                  ) : (
                    hits.map((hit, i) => (
                      <button
                        key={`${hit.kind}:${hit.href}`}
                        type="button"
                        className={`quick-search-hit search-palette-hit ${i === active ? "is-active" : ""}`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(hit.href)}
                      >
                        {hit.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hit.photoUrl}
                            alt=""
                            className="live-search-thumb"
                            style={
                              hit.round ? { borderRadius: "50%" } : undefined
                            }
                          />
                        ) : (
                          <span className="live-search-thumb d-inline-flex align-items-center justify-content-center small">
                            {hit.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="text-truncate">
                          <span className="text-white">{hit.name}</span>
                          {/* Настоящее имя артиста серым в скобках (АА21):
                          ник и паспортное имя помнят вразнобой, и без
                          подсказки не понять, тот ли это человек. */}
                          {hit.nameSuffix && (
                            <span className="small text-secondary">
                              {" "}
                              ({hit.nameSuffix})
                            </span>
                          )}
                          {hit.subtitle && (
                            <span className="small text-secondary">
                              {" "}
                              · {hit.subtitle}
                            </span>
                          )}
                        </span>
                        <span className="live-search-kind">
                          {t.filters.sections[hit.kind]}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="quick-search-foot d-flex align-items-center gap-2">
                <AppLink
                  href={searchHref}
                  className="btn btn-ghost btn-sm"
                  onClick={() => setOpen(false)}
                >
                  {t.filters.live.allFilters} →
                </AppLink>
                <span className="small text-secondary ms-auto d-none d-sm-inline">
                  ↑↓ · Enter · Esc
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
