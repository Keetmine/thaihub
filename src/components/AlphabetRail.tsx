"use client";

import { Fragment } from "react";

/**
 * Буквенная рейка у правого края каталога — ОДНА на все списки.
 *
 * До неё каждый список рисовал свою: у сериалов буквы были прямыми
 * флекс-элементами, а у артистов и локаций — завёрнуты в лишний span,
 * который наследовал полный кегль страницы. Строка выходила 24px против
 * 16.8px, и рейки на соседних страницах выглядели по-разному (замечено
 * владельцем). Теперь разметка одна: буква — сама флекс-элемент,
 * разделитель «•» между алфавитами (цифры/латиница/кириллица) — свой
 * элемент, а не сосед буквы в строке.
 *
 * `pinned` — якорь ПЕРЕД буквами (сердечко избранного на /artists),
 * `trailing` — якорь ПОСЛЕ («без сериала» на /locations),
 * `onLetter` — клиентским спискам с порционной отрисовкой: раскрыть
 * строки до буквы, иначе якорь ведёт в пустоту.
 *
 * `letterHrefBase` (С-5) — краулабельные буквы: href становится
 * настоящей ссылкой `${base}X` на серверную страницу буквы (полный
 * список записей обычными ссылками — см. src/lib/catalogLetters.ts),
 * но клик для живого зрителя перехватывается и ведёт себя как раньше —
 * скролл к якорю `#letter-X` без перехода. Роботы без JS идут по href.
 */
export default function AlphabetRail({
  letters,
  ariaLabel,
  pinned,
  trailing,
  onLetter,
  letterHrefBase,
}: {
  letters: string[];
  ariaLabel: string;
  pinned?: { href: string; label: React.ReactNode; ariaLabel: string };
  trailing?: { href: string; label: React.ReactNode; ariaLabel: string };
  onLetter?: (letter: string, index: number) => void;
  letterHrefBase?: string;
}) {
  return (
    <nav className="performers-index" aria-label={ariaLabel}>
      {pinned && (
        <>
          <a
            href={pinned.href}
            className="performers-index-link"
            aria-label={pinned.ariaLabel}
            title={pinned.ariaLabel}
          >
            {pinned.label}
          </a>
          {letters.length > 0 && <Separator />}
        </>
      )}
      {letters.map((letter, i) => {
        const prevCategory = i > 0 ? categoryOf(letters[i - 1]) : null;
        const showSeparator = prevCategory !== null && prevCategory !== categoryOf(letter);
        return (
          <Fragment key={letter}>
            {showSeparator && <Separator />}
            <a
              href={
                letterHrefBase
                  ? `${letterHrefBase}${encodeURIComponent(letter)}`
                  : `#letter-${letter}`
              }
              className="performers-index-link"
              onClick={
                letterHrefBase
                  ? (e) => {
                      // Живому зрителю — прежнее поведение якоря: скролл
                      // по странице, без перехода на страницу буквы.
                      e.preventDefault();
                      onLetter?.(letter, i);
                      document.getElementById(`letter-${letter}`)?.scrollIntoView();
                    }
                  : onLetter
                    ? () => onLetter(letter, i)
                    : undefined
              }
            >
              {letter}
            </a>
          </Fragment>
        );
      })}
      {trailing && (
        <>
          {letters.length > 0 && <Separator />}
          <a
            href={trailing.href}
            className="performers-index-link"
            aria-label={trailing.ariaLabel}
            title={trailing.ariaLabel}
          >
            {trailing.label}
          </a>
        </>
      )}
    </nav>
  );
}

function Separator() {
  return (
    <span className="performers-index-sep" aria-hidden="true">
      •
    </span>
  );
}

function categoryOf(key: string): "digit" | "en" | "ru" {
  if (key === "0-9") return "digit";
  return /[A-Z]/.test(key) ? "en" : "ru";
}
