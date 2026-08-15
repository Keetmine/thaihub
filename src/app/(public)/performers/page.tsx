import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Performer } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import { HeartIcon } from "@/components/icons";
import NameSearchBox from "@/components/NameSearchBox";
import { SEARCH_RESULT_LIMIT } from "@/lib/pagination";
import { performerHref } from "@/lib/performerSlug";

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

type View = "performers" | "bands" | "pairings" | "agencies";

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
        Музыкальные группы
      </Link>
      <Link
        href="/performers?view=pairings"
        prefetch={false}
        className={`tab-bar-item ${active === "pairings" ? "active" : ""}`}
      >
        Пейринги
      </Link>
      <Link
        href="/performers?view=agencies"
        prefetch={false}
        className={`tab-bar-item ${active === "agencies" ? "active" : ""}`}
      >
        Агентства
      </Link>
    </div>
  );
}

async function AgenciesTab({ q }: { q: string }) {
  const agencies = await prisma.agency.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: { _count: { select: { performers: true } } },
    orderBy: { name: "asc" },
  });

  const currentUser = await getCurrentUser();
  const favoritedIds = new Set<string>();
  if (currentUser && agencies.length > 0) {
    const favorites = await prisma.favoriteAgency.findMany({
      where: { userId: currentUser.id, agencyId: { in: agencies.map((a) => a.id) } },
      select: { agencyId: true },
    });
    for (const f of favorites) favoritedIds.add(f.agencyId);
  }

  if (agencies.length === 0) {
    return <p className="text-secondary">Пока нет агентств.</p>;
  }

  return (
    <div className="d-flex flex-column gap-2">
      {agencies.map((a) => (
        <div
          key={a.id}
          className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
        >
          <Link
            href={`/agencies/${a.id}`}
            className="text-decoration-none d-flex align-items-center gap-3"
            style={{ minWidth: 0 }}
          >
            {a.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.logoUrl}
                alt=""
                style={{
                  width: "2.75rem",
                  height: "2.75rem",
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: "2.75rem",
                  height: "2.75rem",
                  borderRadius: "50%",
                  background: "var(--bs-secondary-bg)",
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <p className="font-display fw-medium text-white mb-0 text-truncate">{a.name}</p>
              <p className="small text-secondary mb-0">{a._count.performers} исполнит.</p>
            </div>
          </Link>
          <FavoriteButton
            kind="agency"
            id={a.id}
            isFavorited={favoritedIds.has(a.id)}
            variant="icon"
            className="flex-shrink-0"
          />
        </div>
      ))}
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
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  if (pairings.length === 0) {
    return <p className="text-secondary">Пока нет пейрингов.</p>;
  }

  return (
    <div className="row g-3">
      {pairings.map((pair) => (
        <div key={pair.id} className="col-12 col-sm-6 col-lg-4">
          <div className={`surface p-3 h-100 ${pair.status === "PAST" ? "opacity-50" : ""}`}>
            <div className="d-flex align-items-center gap-2 mb-2">
              {pair.name && (
                <p className="font-display fw-medium text-white mb-0">{pair.name}</p>
              )}
              {pair.status === "PAST" && (
                <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.65rem" }}>
                  Бывший
                </span>
              )}
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <Link
                href={performerHref(pair.performerA)}
                className="event-chip text-decoration-none"
              >
                {pair.performerA.name}
              </Link>
              <span className="text-secondary">×</span>
              <Link
                href={performerHref(pair.performerB)}
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
        href={performerHref(performer)}
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
  pinFavorites = true,
}: {
  performers: PerformerWithCount[];
  favoritedIds: Set<string>;
  emptyMessage: string;
  // False when `performers` is already just the favorites list (the
  // no-search default view) — pinning a "favorites" section on top of a
  // list that's entirely favorites would just repeat every row twice.
  pinFavorites?: boolean;
}) {
  if (performers.length === 0) {
    return <p className="text-secondary">{emptyMessage}</p>;
  }

  // Already alphabetically sorted (query orderBy name:asc) — filtering
  // preserves that order, so the favorites section stays alphabetical too.
  const favorited = pinFavorites ? performers.filter((p) => favoritedIds.has(p.id)) : [];

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
  const view: View =
    rawView === "bands"
      ? "bands"
      : rawView === "pairings"
        ? "pairings"
        : rawView === "agencies"
          ? "agencies"
          : "performers";
  const q = (rawQ ?? "").trim();
  const currentUser = view === "pairings" || view === "agencies" ? null : await getCurrentUser();

  // The catalog has grown into the thousands of performers — loading and
  // rendering all of them by default made the page painfully slow. Without
  // a search term, show only what's already favorited; the full catalog
  // is reachable through search instead of one giant always-rendered list.
  const searchResults =
    view === "pairings" || view === "agencies" || !q
      ? null
      : await prisma.performer.findMany({
          where: { type: view === "bands" ? "BAND" : "SOLO", name: { contains: q, mode: "insensitive" } },
          include: { _count: { select: { events: true } } },
          orderBy: { name: "asc" },
          take: SEARCH_RESULT_LIMIT + 1,
        });
  const searchTruncated = !!searchResults && searchResults.length > SEARCH_RESULT_LIMIT;

  const performers =
    view === "pairings" || view === "agencies"
      ? []
      : searchResults
        ? searchResults.slice(0, SEARCH_RESULT_LIMIT)
        : currentUser
          ? await prisma.performer.findMany({
              where: {
                type: view === "bands" ? "BAND" : "SOLO",
                favoritedBy: { some: { userId: currentUser.id } },
              },
              include: { _count: { select: { events: true } } },
              orderBy: { name: "asc" },
            })
          : [];
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
    bands: "Музыкальные группы",
    pairings: "Пейринги",
    agencies: "Агентства",
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
          placeholder={view === "agencies" ? "Поиск по названию…" : "Поиск по имени…"}
          className=""
        />
      </div>

      {view === "pairings" ? (
        <PairingsTab q={q} />
      ) : view === "agencies" ? (
        <AgenciesTab q={q} />
      ) : (
        <>
          {searchTruncated && (
            <p className="small text-secondary mb-3">
              Показаны первые {SEARCH_RESULT_LIMIT} результатов — уточните запрос, чтобы увидеть более точные совпадения.
            </p>
          )}
          <PerformerAlphabetList
            performers={performers}
            favoritedIds={favoritedIds}
            pinFavorites={!!q}
            emptyMessage={
              q
                ? "Ничего не найдено."
                : view === "bands"
                  ? "Пока никого нет в избранном. Используйте поиск, чтобы найти группу."
                  : "Пока никого нет в избранном. Используйте поиск, чтобы найти актёра."
            }
          />
        </>
      )}
    </div>
  );
}
