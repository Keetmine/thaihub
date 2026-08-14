import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Performer } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import { HeartIcon } from "@/components/icons";
import NameSearchBox from "@/components/NameSearchBox";

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
    <div className="tab-bar">
      <Link
        href="/performers"
        prefetch={false}
        className={`tab-bar-item ${active === "performers" ? "active" : ""}`}
      >
        Актёры
      </Link>
      <Link
        href="/performers?view=bands"
        prefetch={false}
        className={`tab-bar-item ${active === "bands" ? "active" : ""}`}
      >
        Группы
      </Link>
      <Link
        href="/performers?view=pairings"
        prefetch={false}
        className={`tab-bar-item ${active === "pairings" ? "active" : ""}`}
      >
        Пейринги
      </Link>
    </div>
  );
}

async function PairingsTab({ q }: { q: string }) {
  const pairings = await prisma.pairing.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { performerA: { name: { contains: q, mode: "insensitive" } } },
            { performerB: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
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

function PerformerRow({
  performer,
  isFavorited,
}: {
  performer: PerformerWithCount;
  isFavorited: boolean;
}) {
  return (
    <div className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3">
      <Link
        href={`/performers/${performer.id}`}
        className="text-decoration-none d-flex align-items-center gap-2"
        style={{ minWidth: 0 }}
      >
        {performer.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={performer.photoUrl}
            alt=""
            style={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: "2.25rem",
              height: "2.25rem",
              borderRadius: "50%",
              background: "var(--bs-secondary-bg)",
              flexShrink: 0,
            }}
          />
        )}
        <span className="font-display fw-medium text-white text-truncate">{performer.name}</span>
      </Link>
      <div className="d-flex align-items-center gap-3 flex-shrink-0">
        <span className="small text-secondary">{performer._count.events} событ.</span>
        <FavoriteButton kind="performer" id={performer.id} isFavorited={isFavorited} variant="icon" />
      </div>
    </div>
  );
}

function PerformerAlphabetList({
  performers,
  favoritedIds,
  emptyMessage,
}: {
  performers: PerformerWithCount[];
  favoritedIds: Set<string>;
  emptyMessage: string;
}) {
  if (performers.length === 0) {
    return <p className="text-secondary">{emptyMessage}</p>;
  }

  // Already alphabetically sorted (query orderBy name:asc) — filtering
  // preserves that order, so the favorites section stays alphabetical too.
  const favorited = performers.filter((p) => favoritedIds.has(p.id));

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
        {favorited.length > 0 && (
          <section id="favorites" className="performers-letter-section">
            <h2 className="performers-letter-heading d-flex align-items-center gap-2">
              <HeartIcon filled />
              Избранное
            </h2>
            <div className="d-flex flex-column gap-2">
              {favorited.map((p) => (
                <PerformerRow key={p.id} performer={p} isFavorited={true} />
              ))}
            </div>
          </section>
        )}

        {sortedLetters.map((letter) => (
          <section
            key={letter}
            id={`letter-${letter}`}
            className="performers-letter-section"
          >
            <h2 className="performers-letter-heading">{letter}</h2>
            <div className="d-flex flex-column gap-2">
              {groups.get(letter)!.map((p) => (
                <PerformerRow key={p.id} performer={p} isFavorited={favoritedIds.has(p.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <nav className="performers-index" aria-label="Быстрый переход по буквам">
        {favorited.length > 0 && (
          <>
            <a href="#favorites" className="performers-index-link performers-index-heart" aria-label="К избранному">
              <HeartIcon filled />
            </a>
            <span className="performers-index-sep" aria-hidden="true">
              •
            </span>
          </>
        )}
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
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { view: rawView, q: rawQ } = await searchParams;
  const view: View = rawView === "bands" ? "bands" : rawView === "pairings" ? "pairings" : "performers";
  const q = (rawQ ?? "").trim();

  const performers =
    view === "pairings"
      ? []
      : await prisma.performer.findMany({
          where: {
            type: view === "bands" ? "BAND" : "SOLO",
            ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
          },
          include: { _count: { select: { events: true } } },
          orderBy: { name: "asc" },
        });

  const currentUser = view === "pairings" ? null : await getCurrentUser();
  const favoritedIds = new Set<string>();
  if (currentUser && performers.length > 0) {
    const favorites = await prisma.favoritePerformer.findMany({
      where: { userId: currentUser.id, performerId: { in: performers.map((p) => p.id) } },
      select: { performerId: true },
    });
    for (const f of favorites) favoritedIds.add(f.performerId);
  }

  const titles: Record<View, string> = {
    performers: "Актёры",
    bands: "Группы",
    pairings: "Пейринги",
  };

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.5rem" }}>
        {titles[view]}
      </h1>

      <div className="tab-bar-row">
        <Tabs active={view} />
        <NameSearchBox
          action="/performers"
          q={q}
          hiddenFields={view !== "performers" ? { view } : undefined}
          placeholder="Поиск по имени…"
          className=""
        />
      </div>

      {view === "pairings" ? (
        <PairingsTab q={q} />
      ) : (
        <PerformerAlphabetList
          performers={performers}
          favoritedIds={favoritedIds}
          emptyMessage={view === "bands" ? "Пока нет групп." : "Пока нет актёров."}
        />
      )}
    </div>
  );
}
