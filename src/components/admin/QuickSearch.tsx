"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { quickSearchAdmin, type QuickHit } from "@/app/admin/(protected)/quickSearchActions";

/** Быстрый переход к любой записи каталога: Cmd/Ctrl+K из любого места
 *  админки. Раньше, чтобы поправить артиста, надо было идти в раздел,
 *  искать, листать страницы. */
export default function QuickSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<QuickHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const closeRef = useRef<() => void>(() => {});

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Ref на close, чтобы глобальный keydown-слушатель всегда звал
  // актуальную версию (обновляем в эффекте — в рендере refs трогать
  // нельзя).
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    // фокус — единственный побочный эффект открытия; сброс состояния
    // делает close(), иначе setState прямо в эффекте каскадит рендеры
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActive(0);
  }

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Дебаунс живёт в обработчике ввода, а не в эффекте: setState прямо
   *  в эффекте каскадит рендеры (правило react-hooks). */
  function handleQueryChange(next: string) {
    setQuery(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = next.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    timerRef.current = setTimeout(async () => {
      try {
        const result = await quickSearchAdmin(q);
        if (seq === seqRef.current) {
          setHits(result);
          setActive(0);
        }
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 250);
  }

  function go(hit: QuickHit) {
    close();
    router.push(hit.href);
  }

  if (!open) return null;

  return (
    <div className="quick-search-backdrop" onMouseDown={close}>
      <div className="quick-search" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              go(hits[active]);
            }
          }}
          placeholder="Поиск по каталогу: артист, сериал, событие, локация…"
          className="form-control form-control-lg"
        />
        <div className="quick-search-hits">
          {query.trim().length < 2 ? (
            <p className="small text-secondary m-0 p-3">Введите минимум 2 символа</p>
          ) : loading && hits.length === 0 ? (
            <p className="small text-secondary m-0 p-3">Поиск…</p>
          ) : hits.length === 0 ? (
            <p className="small text-secondary m-0 p-3">Ничего не найдено</p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={`${hit.kind}-${hit.id}`}
                type="button"
                className={`quick-search-hit ${i === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(hit)}
              >
                <span className="text-white">{hit.title}</span>
                {hit.subtitle && <span className="small text-secondary">{hit.subtitle}</span>}
              </button>
            ))
          )}
        </div>
        <div className="quick-search-foot small text-secondary">
          ↑↓ — выбор · Enter — открыть · Esc — закрыть
        </div>
      </div>
    </div>
  );
}
