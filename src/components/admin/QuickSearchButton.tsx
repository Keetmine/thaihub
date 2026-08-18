"use client";

import { SearchIcon } from "@/components/icons";

/** Видимая кнопка поиска: не все знают про Cmd/Ctrl+K, поэтому та же
 *  палитра открывается кликом. Сигналим через window-событие — кнопка
 *  живёт в сайдбаре, а сама палитра рендерится в конце layout. */
export const QUICK_SEARCH_EVENT = "admin-quick-search-open";

export default function QuickSearchButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(QUICK_SEARCH_EVENT))}
      className={`quick-search-trigger ${compact ? "is-compact" : ""}`}
      aria-label="Поиск по каталогу"
      title="Поиск по каталогу (Ctrl/⌘ + K)"
    >
      <SearchIcon />
      {!compact && (
        <>
          <span className="quick-search-trigger-label">Поиск…</span>
          <kbd className="quick-search-kbd">⌘K</kbd>
        </>
      )}
    </button>
  );
}
