import { Fragment } from "react";
import LazyList from "./LazyList";

type NamedItem = { id: string; name: string };

function firstLetterOf(name: string): string {
  const trimmed = name.trim();
  const ch = trimmed.charAt(0) || "#";
  if (/[0-9]/.test(ch)) return "0-9";
  return ch.toUpperCase();
}

function categoryOf(key: string): "digit" | "en" | "ru" {
  if (key === "0-9") return "digit";
  return /[A-Z]/.test(key) ? "en" : "ru";
}

/** Groups items by first letter (digits collapse into "0-9") and renders a
 *  scrollable A-Z index on the right, matching the /performers list.
 *  `trailingSection` renders an extra, ungrouped section after the letter
 *  groups (e.g. "no drama") with its own short index-nav symbol.
 *
 *  `letterLinkHref` превращает индекс из якорей в ссылки: страница тогда
 *  грузит из базы только выбранную букву. Без него список приходится
 *  отдавать целиком — на /locations это был мегабайт разметки на 567
 *  записей, потому что LazyList откладывает лишь отрисовку, а данные
 *  всё равно едут все. Список доступных букв (`allLetters`) считается
 *  отдельным дешёвым запросом, чтобы навигация не зависела от того,
 *  что загружено сейчас. */
export default function AlphabetIndexList<T extends NamedItem>({
  items,
  renderItem,
  emptyMessage,
  trailingSection,
  letterLinkHref,
  allLetters,
  activeLetter,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  trailingSection?: { indexLabel: React.ReactNode; indexAriaLabel: string; content: React.ReactNode };
  letterLinkHref?: (letter: string) => string;
  allLetters?: string[];
  activeLetter?: string | null;
}) {
  if (items.length === 0 && !trailingSection) {
    return <p className="text-secondary">{emptyMessage}</p>;
  }

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const letter = firstLetterOf(item.name);
    const bucket = groups.get(letter);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(letter, [item]);
    }
  }

  const sortedLetters = Array.from(groups.keys()).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  // В навигации показываем все буквы каталога, а не только загруженные.
  const indexLetters = allLetters?.length ? allLetters : sortedLetters;

  return (
    <div className="performers-layout scroll-list-lg thin-scroll">
      <div className="performers-list">
        {sortedLetters.map((letter) => (
          <section
            key={letter}
            id={`letter-${letter}`}
            className="performers-letter-section"
          >
            <h2 className="performers-letter-heading">{letter}</h2>
            <div className="d-flex flex-column gap-2">
              <LazyList batch={30}>
                {groups.get(letter)!.map((item) => (
                  <Fragment key={item.id}>{renderItem(item)}</Fragment>
                ))}
              </LazyList>
            </div>
          </section>
        ))}

        {trailingSection && (
          <section id="trailing-section" className="performers-letter-section">
            {trailingSection.content}
          </section>
        )}
      </div>

      <nav className="performers-index" aria-label="Быстрый переход по буквам">
        {indexLetters.map((letter, i) => {
          const prevCategory = i > 0 ? categoryOf(indexLetters[i - 1]) : null;
          const showSeparator = prevCategory !== null && prevCategory !== categoryOf(letter);
          return (
            <Fragment key={letter}>
              {showSeparator && (
                <span className="performers-index-sep" aria-hidden="true">
                  •
                </span>
              )}
              <a
                href={letterLinkHref ? letterLinkHref(letter) : `#letter-${letter}`}
                className={`performers-index-link ${activeLetter === letter ? "is-active" : ""}`}
              >
                {letter}
              </a>
            </Fragment>
          );
        })}
        {trailingSection && (
          <>
            {indexLetters.length > 0 && (
              <span className="performers-index-sep" aria-hidden="true">
                •
              </span>
            )}
            <a
              href="#trailing-section"
              className="performers-index-link"
              aria-label={trailingSection.indexAriaLabel}
            >
              {trailingSection.indexLabel}
            </a>
          </>
        )}
      </nav>
    </div>
  );
}
