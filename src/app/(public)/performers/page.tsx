import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Performer } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type PerformerWithCount = Performer & { _count: { events: number } };

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

type View = "performers" | "bands" | "pairings";

function Tabs({ active }: { active: View }) {
  return (
    <div className="mode-toggle mb-4">
      <Link
        href="/performers"
        prefetch={false}
        className={`mode-toggle-option ${active === "performers" ? "active" : ""}`}
      >
        Актёры
      </Link>
      <Link
        href="/performers?view=bands"
        prefetch={false}
        className={`mode-toggle-option ${active === "bands" ? "active" : ""}`}
      >
        Группы
      </Link>
      <Link
        href="/performers?view=pairings"
        prefetch={false}
        className={`mode-toggle-option ${active === "pairings" ? "active" : ""}`}
      >
        Пейринги
      </Link>
    </div>
  );
}

async function PairingsTab() {
  const pairings = await prisma.pairing.findMany({
    include: { performerA: true, performerB: true },
    orderBy: { createdAt: "desc" },
  });

  if (pairings.length === 0) {
    return <p className="text-secondary">Пока нет пейрингов.</p>;
  }

  return (
    <div className="row g-3">
      {pairings.map((pair) => (
        <div key={pair.id} className="col-12 col-sm-6 col-lg-4">
          <div className="surface p-3 h-100">
            {pair.name && (
              <p className="font-display fw-medium text-white mb-2">{pair.name}</p>
            )}
            <div className="d-flex flex-wrap align-items-center gap-2">
              <Link
                href={`/performers/${pair.performerA.id}`}
                className="event-chip text-decoration-none"
              >
                {pair.performerA.name}
              </Link>
              <span className="text-secondary">×</span>
              <Link
                href={`/performers/${pair.performerB.id}`}
                className="event-chip text-decoration-none"
              >
                {pair.performerB.name}
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformerAlphabetList({
  performers,
  emptyMessage,
}: {
  performers: PerformerWithCount[];
  emptyMessage: string;
}) {
  if (performers.length === 0) {
    return <p className="text-secondary">{emptyMessage}</p>;
  }

  // Group by first letter. Cyrillic and Latin names naturally land in
  // different groups since they start with different characters; digits
  // all collapse into one "0-9" group/heading, matching common app index
  // conventions (e.g. contacts/brand lists).
  const groups = new Map<string, PerformerWithCount[]>();
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
                  <span className="font-display fw-medium text-white">{p.name}</span>
                  <span className="small text-secondary flex-shrink-0">
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
      </nav>
    </div>
  );
}

export default async function PerformersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view: View = rawView === "bands" ? "bands" : rawView === "pairings" ? "pairings" : "performers";

  const performers =
    view === "pairings"
      ? []
      : await prisma.performer.findMany({
          where: { type: view === "bands" ? "BAND" : "SOLO" },
          include: { _count: { select: { events: true } } },
          orderBy: { name: "asc" },
        });

  const titles: Record<View, string> = {
    performers: "Актёры",
    bands: "Группы",
    pairings: "Пейринги",
  };

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.5rem" }}>
        {titles[view]}
      </h1>

      <Tabs active={view} />

      {view === "pairings" ? (
        <PairingsTab />
      ) : (
        <PerformerAlphabetList
          performers={performers}
          emptyMessage={view === "bands" ? "Пока нет групп." : "Пока нет актёров."}
        />
      )}
    </div>
  );
}
