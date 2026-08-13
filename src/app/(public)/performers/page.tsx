import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

export default async function PerformersPage() {
  const performers = await prisma.performer.findMany({
    include: { _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });

  // Group by first letter. Cyrillic and Latin names naturally land in
  // different groups since they start with different characters; digits
  // all collapse into one "0-9" group/heading, matching common app index
  // conventions (e.g. contacts/brand lists).
  const groups = new Map<string, typeof performers>();
  for (const p of performers) {
    const letter = firstLetterOf(p.name);
    const bucket = groups.get(letter);
    if (bucket) {
      bucket.push(p);
    } else {
      groups.set(letter, [p]);
    }
  }

  // Plain code-unit sort keeps "0-9" first, then Latin, then Cyrillic,
  // without interleaving under a locale-specific collation.
  const sortedLetters = Array.from(groups.keys()).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.5rem" }}>
        Исполнители
      </h1>
      {performers.length === 0 ? (
        <p className="text-secondary">Пока нет исполнителей.</p>
      ) : (
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
                  {groups.get(letter)!.map((p) => (
                    <Link
                      key={p.id}
                      href={`/performers/${p.id}`}
                      className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
                    >
                      <span className="font-display fw-medium text-white">
                        {p.name}
                      </span>
                      <span className="small text-secondary flex-shrink-0">
                        {p.type === "BAND" ? "Группа" : "Соло"} ·{" "}
                        {p._count.events} событ.
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <nav className="performers-index" aria-label="Быстрый переход по буквам">
            {sortedLetters.map((letter, i) => {
              const prevCategory =
                i > 0 ? categoryOf(sortedLetters[i - 1]) : null;
              const showSeparator =
                prevCategory !== null && prevCategory !== categoryOf(letter);
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
          </nav>
        </div>
      )}
    </div>
  );
}
