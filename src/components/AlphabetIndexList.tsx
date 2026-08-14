import { Fragment } from "react";

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
 *  groups (e.g. "no drama") with its own short index-nav symbol. */
export default function AlphabetIndexList<T extends NamedItem>({
  items,
  renderItem,
  emptyMessage,
  trailingSection,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  trailingSection?: { indexLabel: React.ReactNode; indexAriaLabel: string; content: React.ReactNode };
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

  return (
    <div className="performers-layout">
      <div className="performers-list">
        {sortedLetters.map((letter) => (
          <section
            key={letter}
            id={`letter-${letter}`}
            className="performers-letter-section"
          >
            <h2 className="performers-letter-heading">{letter}</h2>
            <div className="d-flex flex-column gap-2">
              {groups.get(letter)!.map((item) => (
                <Fragment key={item.id}>{renderItem(item)}</Fragment>
              ))}
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
        {sortedLetters.map((letter, i) => {
          const prevCategory = i > 0 ? categoryOf(sortedLetters[i - 1]) : null;
          const showSeparator = prevCategory !== null && prevCategory !== categoryOf(letter);
          return (
            <Fragment key={letter}>
              {showSeparator && (
                <span className="performers-index-sep" aria-hidden="true">
                  •
                </span>
              )}
              <a href={`#letter-${letter}`} className="performers-index-link">
                {letter}
              </a>
            </Fragment>
          );
        })}
        {trailingSection && (
          <>
            {sortedLetters.length > 0 && (
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
