import { Fragment } from "react";
import { getT } from "@/lib/i18n";
import AlphabetRail from "./AlphabetRail";
import LazyList from "./LazyList";

type NamedItem = { id: string; name: string };

function firstLetterOf(name: string): string {
  const trimmed = name.trim();
  const ch = trimmed.charAt(0) || "#";
  if (/[0-9]/.test(ch)) return "0-9";
  return ch.toUpperCase();
}


/** Groups items by first letter (digits collapse into "0-9") and renders a
 *  scrollable A-Z index on the right, matching the /performers list.
 *  `trailingSection` renders an extra, ungrouped section after the letter
 *  groups (e.g. "no drama") with its own short index-nav symbol.
 */
export default async function AlphabetIndexList<T extends NamedItem>({
  items,
  renderItem,
  emptyMessage,
  trailingSection,
  // Контейнер элементов внутри буквы: по умолчанию колонка строк, для
  // постерных каталогов — «poster-grid».
  itemsWrapperClassName = "d-flex flex-column gap-2",
  letterHrefBase,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  trailingSection?: { indexLabel: React.ReactNode; indexAriaLabel: string; content: React.ReactNode };
  itemsWrapperClassName?: string;
  /** С-5: делает буквы рейки настоящими ссылками `${base}X` на
   *  серверные страницы буквы (клик зрителя остаётся скроллом). */
  letterHrefBase?: string;
}) {
  const { t } = await getT();
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
  const indexLetters = sortedLetters;

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
            <div className={itemsWrapperClassName}>
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

      <AlphabetRail
        letters={indexLetters}
        ariaLabel={t.catalog.letterIndex}
        letterHrefBase={letterHrefBase}
        trailing={
          trailingSection && {
            href: "#trailing-section",
            label: trailingSection.indexLabel,
            ariaLabel: trailingSection.indexAriaLabel,
          }
        }
      />
    </div>
  );
}
