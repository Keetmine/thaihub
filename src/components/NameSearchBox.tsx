"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import { useLocale } from "@/components/LocaleProvider";
import { localeHref } from "@/lib/i18n/config";
import { quickSearchAdmin, type QuickHit } from "@/app/admin/(protected)/quickSearchActions";

const DEBOUNCE_MS = 400;

export default function NameSearchBox({
  action,
  q,
  hiddenFields,
  placeholder,
  className = "mb-4",
  quickKind,
}: {
  action: string;
  q: string;
  hiddenFields?: Record<string, string>;
  placeholder?: string;
  /** Defaults to "mb-4" for standalone use; pass "" when placed inside a
   *  .tab-bar-row alongside tabs, which spaces itself. */
  className?: string;
  /** Живые подсказки под полем (админ-списки): записи этого вида, по
   *  клику — сразу в правку, минуя выдачу. Работает только под правами
   *  редактора каталога — действие само их проверяет. */
  quickKind?: QuickHit["kind"];
}) {
  const t = useT();
  const locale = useLocale();
  const placeholderText = placeholder ?? t.common.searchByName;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  const [hits, setHits] = useState<QuickHit[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const rootRef = useRef<HTMLFormElement>(null);
  const seqRef = useRef(0);
  const hitsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Клик мимо поля прячет подсказки; слушатель живёт, пока они открыты.
  useEffect(() => {
    if (!panelOpen || !quickKind) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setPanelOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [panelOpen, quickKind]);

  // Resync if q changes from outside this input (a tab link that also
  // carries q, browser back/forward) — adjusted during render, not in an
  // effect, per React's guidance for "state that depends on a prop".
  if (q !== prevQ) {
    setPrevQ(q);
    setValue(q);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function navigate(nextValue: string) {
    // База — текущий адрес, а не пустота: раньше набор в поле стирал бы
    // выбранные фильтры (?genres=…), потому что params собирались с нуля.
    const params = new URLSearchParams(searchParams.toString());
    for (const [name, fieldValue] of Object.entries(hiddenFields ?? {})) {
      params.set(name, fieldValue);
    }
    if (nextValue) params.set("q", nextValue);
    else params.delete("q");
    // Другой запрос — другая выдача, старый номер страницы не про неё.
    params.delete("page");
    const qs = params.toString();
    // Без префикса поиск на /ru уводил на английскую версию.
    router.replace(localeHref(`${action}${qs ? `?${qs}` : ""}`, locale), { scroll: false });
  }

  function requestHits(next: string) {
    if (!quickKind) return;
    if (hitsTimerRef.current) clearTimeout(hitsTimerRef.current);
    const seq = ++seqRef.current;
    if (next.trim().length < 2) {
      setHits([]);
      return;
    }
    hitsTimerRef.current = setTimeout(async () => {
      try {
        const result = await quickSearchAdmin(next, quickKind);
        if (seq === seqRef.current) setHits(result);
      } catch {
        // подсказки — украшение; фильтр списка работает и без них
      }
    }, 250);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Clearing (typing back to empty, or the native search input's own "x"
    // button, which fires the same change event) updates right away —
    // only non-empty typing gets debounced.
    if (next === "") {
      navigate(next);
      return;
    }
    timeoutRef.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
    setPanelOpen(true);
    requestHits(next);
  }

  return (
    <form
      ref={rootRef}
      className={`${quickKind ? "live-search " : ""}${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        navigate(value);
      }}
    >
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, fieldValue]) => (
          <input key={name} type="hidden" name={name} value={fieldValue} />
        ))}
      <div className="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          name="q"
          value={value}
          onChange={handleChange}
          placeholder={placeholderText}
          aria-label={placeholder}
          className="pill-search"
        />
      </div>
      {quickKind && panelOpen && hits.length > 0 && (
        <div className="live-search-panel">
          <div className="live-search-hits">
            {hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                className="live-search-hit text-start border-0 bg-transparent"
                onClick={() => {
                  // Отложенный navigate() списка ещё может висеть в
                  // таймере — без отмены он сработал бы ПОСЛЕ перехода
                  // в правку и утащил обратно в список.
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                  if (hitsTimerRef.current) clearTimeout(hitsTimerRef.current);
                  setPanelOpen(false);
                  router.push(hit.href);
                }}
              >
                <span className="text-truncate">
                  {hit.title}
                  {hit.subtitle && <span className="text-secondary small"> · {hit.subtitle}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
