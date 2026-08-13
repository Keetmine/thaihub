import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const RU_ALPHABET = [
  "А", "Б", "В", "Г", "Д", "Е", "Ё", "Ж", "З", "И", "Й", "К", "Л", "М", "Н",
  "О", "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ", "Ъ", "Ы", "Ь",
  "Э", "Ю", "Я",
];

const EN_ALPHABET = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + i)
);

function firstLetterOf(name: string) {
  const trimmed = name.trim();
  return (trimmed.charAt(0) || "#").toUpperCase();
}

export default async function PerformersPage() {
  const performers = await prisma.performer.findMany({
    include: { _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });

  // Group by first letter. Cyrillic and Latin names naturally land in
  // different groups since they start with different characters — no
  // cross-script merging needed.
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

  // Plain code-unit sort keeps each script contiguous rather than
  // interleaving them under a locale-specific collation.
  const sortedLetters = Array.from(groups.keys()).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const availableLetters = new Set(groups.keys());
  const ruIndexLetters = RU_ALPHABET.filter((l) => availableLetters.has(l));
  const enIndexLetters = EN_ALPHABET.filter((l) => availableLetters.has(l));

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

          <aside className="performers-index surface p-3">
            {ruIndexLetters.length > 0 && (
              <div className="mb-3">
                <p className="performers-index-label">РУС</p>
                <div className="performers-index-letters">
                  {ruIndexLetters.map((letter) => (
                    <a
                      key={letter}
                      href={`#letter-${letter}`}
                      className="performers-index-letter"
                    >
                      {letter}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {enIndexLetters.length > 0 && (
              <div>
                <p className="performers-index-label">ENG</p>
                <div className="performers-index-letters">
                  {enIndexLetters.map((letter) => (
                    <a
                      key={letter}
                      href={`#letter-${letter}`}
                      className="performers-index-letter"
                    >
                      {letter}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
