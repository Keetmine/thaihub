import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import DramaStatusButton from "@/components/DramaStatusButton";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import EntityMiniCard from "@/components/EntityMiniCard";
import SocialLinkIcons from "@/components/SocialLinkIcons";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getDramaWatchStatuses } from "@/lib/favorites";
import { detectSocialPlatform, type SocialPlatform } from "@/lib/socialLinks";
import { DRAMA_STATUS_LABELS, DRAMA_STATUS_BADGE_CLASS } from "@/lib/dramaStatus";
import { performerHref } from "@/lib/performerSlug";
import { agencyHref, slugOrIdWhere } from "@/lib/slugHelpers";
import { dramaHref } from "@/lib/dramaSlug";
import { CakeIcon, BuildingIcon, PinIcon, MusicNoteIcon, UserIcon } from "@/components/icons";
import { isPremiumActive } from "@/lib/premium";

export const dynamic = "force-dynamic";

const ALBUM_TYPE_LABELS = {
  ALBUM: "Альбом",
  EP: "EP",
  SINGLE: "Сингл",
} as const;

export default async function PerformerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const performer = await prisma.performer.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      links: true,
      agencies: { include: { agency: true }, orderBy: { agency: { name: "asc" } } },
      dramas: { include: { drama: true }, orderBy: { drama: { title: "asc" } } },
      bandMembers: { include: { performer: true }, orderBy: { performer: { name: "asc" } } },
      memberOfBands: { include: { band: true }, orderBy: { band: { name: "asc" } } },
      albums: { orderBy: [{ year: "desc" }, { title: "asc" }] },
      songs: { orderBy: [{ year: "desc" }, { title: "asc" }] },
    },
  });
  if (!performer) notFound();
  const id = performer.id;
  const isBand = performer.type === "BAND";

  const eventLinks = await prisma.eventPerformer.findMany({
    where: { performerId: id },
    include: {
      event: {
        include: {
          performers: { include: { performer: true } },
          occurrences: { orderBy: { startsAt: "asc" } },
        },
      },
    },
  });
  const performerEvents = eventLinks.flatMap((l) =>
    l.event.occurrences.map((occ) => flattenOccurrence({ ...occ, event: l.event })),
  );

  // Pairings this performer is part of — solo-only, nice-to-have, additive.
  const pairings = isBand
    ? []
    : await prisma.pairing.findMany({
        where: { OR: [{ performerAId: id }, { performerBId: id }] },
        include: { performerA: true, performerB: true },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      });
  const currentPairings = pairings.filter((p) => p.status === "CURRENT");
  const pastPairings = pairings.filter((p) => p.status === "PAST");

  const currentUser = await getCurrentUser();
  let isFavorited = false;
  if (currentUser) {
    const favorite = await prisma.favoritePerformer.findUnique({
      where: { userId_performerId: { userId: currentUser.id, performerId: id } },
    });
    isFavorited = !!favorite;
  }

  const now = new Date();
  const upcoming = performerEvents
    .filter((ev) => ev.startsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = performerEvents
    .filter((ev) => ev.startsAt < now)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  const eventIds = performerEvents.map((ev) => ev.id);
  const occIds = performerEvents.map((ev) => ev.occurrenceId);
  const [favoritedEventIds, goingEventIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
  ]);

  const statusByDramaId = await getDramaWatchStatuses(
    performer.dramas.map((pd) => pd.dramaId),
    currentUser?.id,
  );

  // Newest first by release year — dramas with no known year (yet to be
  // enriched/matched) sort last rather than interleaving arbitrarily.
  const sortedDramas = [...performer.dramas].sort((a, b) => {
    if (a.drama.year == null) return b.drama.year == null ? 0 : 1;
    if (b.drama.year == null) return -1;
    return b.drama.year - a.drama.year;
  });

  const formatBirthDate = (d: Date) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const currentAge = (d: Date) => {
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    if (
      today.getMonth() < d.getMonth() ||
      (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())
    ) {
      age -= 1;
    }
    const mod10 = age % 10;
    const mod100 = age % 100;
    const word =
      mod10 === 1 && mod100 !== 11
        ? "год"
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? "года"
          : "лет";
    return `${age} ${word}`;
  };

  const recognizedLinks = performer.links
    .map((l) => {
      const platform = detectSocialPlatform(l.url);
      return platform ? { platform, url: l.url } : null;
    })
    .filter((item): item is { platform: SocialPlatform; url: string } => !!item);
  const socialItems = [
    ...recognizedLinks,
    ...(performer.mydramalistUrl
      ? [{ platform: "mydramalist" as const, url: performer.mydramalistUrl }]
      : []),
  ];
  const otherLinks = performer.links.filter((l) => !detectSocialPlatform(l.url));

  return (
    <div>
      <Link href="/artists" className="eyebrow text-decoration-none">
        ← Все исполнители
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          {performer.name}{" "}
          {performer.realName && (
            <span className="fs-5 fw-normal text-secondary">({performer.realName})</span>
          )}
        </h1>
        <FavoriteButton kind="performer" id={performer.id} isFavorited={isFavorited} variant="icon" />
      </div>

      <div className="d-flex flex-column flex-sm-row gap-4 mb-4">
        {performer.photoUrl && (
          <div className="flex-shrink-0 d-flex flex-column gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={performer.photoUrl}
              alt={performer.name}
              className="rounded-4"
              style={{ width: "16rem", height: "16rem", objectFit: "cover" }}
            />
            <SocialLinkIcons items={socialItems} />
          </div>
        )}

        <div className="d-flex flex-column gap-2" style={{ minWidth: 0, flex: 1 }}>
          {!performer.photoUrl && <SocialLinkIcons items={socialItems} />}
          {!isBand && performer.birthDate && (
            <p className="small text-secondary mb-0">
              <CakeIcon /> <span className="text-secondary">Дата рождения:</span>{" "}
              {formatBirthDate(performer.birthDate)} ({currentAge(performer.birthDate)})
            </p>
          )}
          {!isBand && performer.nationality && (
            <p className="small text-secondary mb-0">
              <PinIcon className="icon-inline" />{" "}
              <span className="text-secondary">Национальность:</span> {performer.nationality}
            </p>
          )}
          {!isBand && performer.alsoKnownAs && (
            <p className="small text-secondary mb-0">
              <UserIcon className="icon-inline" />{" "}
              <span className="text-secondary">Также известен как:</span> {performer.alsoKnownAs}
            </p>
          )}
          {!isBand && performer.musicAlias && (
            <p className="small text-secondary mb-0">
              <MusicNoteIcon /> <span className="text-secondary">Выступает как:</span>{" "}
              {performer.musicAlias}
            </p>
          )}
          {!isBand && performer.placeOfBirth && (
            <p className="small text-secondary mb-0">
              <PinIcon className="icon-inline" /> <span className="text-secondary">Место рождения:</span>{" "}
              {performer.placeOfBirth}
            </p>
          )}
          {performer.bio && (
            <p className="small text-secondary mb-0" style={{ whiteSpace: "pre-line" }}>
              {performer.bio}
            </p>
          )}
          {performer.agencies.length > 0 && (
            <p className="small text-secondary mb-0">
              <BuildingIcon />{" "}
              <span className="text-secondary">
                {performer.agencies.length > 1 ? "Студии:" : "Студия:"}
              </span>{" "}
              {performer.agencies.map((pa, i) => (
                <span key={pa.agencyId}>
                  <Link href={agencyHref(pa.agency)} className="link-body-emphasis">
                    {pa.agency.name}
                  </Link>
                  {i < performer.agencies.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          )}

          {!isBand && performer.dramas.length > 0 && (
            <div className="mt-1">
              <h2 className="section-heading mb-2">
                Сериалы
              </h2>
              <div className="d-flex gap-3 pb-2 thin-scroll" style={{ overflowX: "auto" }}>
                {sortedDramas.map((pd) => (
                  <div
                    key={pd.dramaId}
                    className="flex-shrink-0"
                    style={{ width: "8.5rem", position: "relative" }}
                  >
                    <Link href={dramaHref(pd.drama)} className="text-decoration-none d-block">
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          aspectRatio: "2 / 3",
                          borderRadius: "0.5rem",
                          background: "var(--bs-secondary-bg)",
                          overflow: "hidden",
                        }}
                      >
                        {pd.drama.posterUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pd.drama.posterUrl}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                        {pd.drama.status === "RETURNING_SERIES" && (
                          <span
                            className={`badge rounded-pill ${DRAMA_STATUS_BADGE_CLASS.RETURNING_SERIES}`}
                            style={{ position: "absolute", top: "0.375rem", left: "0.375rem", fontSize: "0.6rem" }}
                          >
                            {DRAMA_STATUS_LABELS.RETURNING_SERIES}
                          </span>
                        )}
                      </div>
                      <p className="small text-white mb-0 mt-2" style={{ lineHeight: 1.3 }}>
                        {pd.drama.title}
                      </p>
                      {pd.drama.year && <p className="small text-secondary mb-0">{pd.drama.year}</p>}
                    </Link>
                    <div className="position-absolute" style={{ top: "0.375rem", right: "0.375rem" }}>
                      <DramaStatusButton dramaId={pd.dramaId} status={statusByDramaId.get(pd.dramaId) ?? null} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {otherLinks.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mt-1">
              {otherLinks.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-secondary btn-sm"
                >
                  {l.label}
                </a>
              ))}
            </div>
          )}

          {isBand && performer.bandMembers.length > 0 && (
            <div className="mt-2">
              <h2
                className="section-heading mb-2"
              >
                Участники
              </h2>
              <div className="d-flex flex-wrap gap-2">
                {performer.bandMembers.map((m) => (
                  <EntityMiniCard
                    key={m.performerId}
                    href={performerHref(m.performer)}
                    photoUrl={m.performer.photoUrl}
                    name={m.performer.name}
                    subtitle={m.performer.realName}
                  />
                ))}
              </div>
            </div>
          )}

          {performer.albums.length > 0 && (
            <div className="mt-2">
              <h2 className="section-heading mb-2">
                <MusicNoteIcon className="icon-inline" /> Альбомы
              </h2>
              <div className="d-flex gap-3 pb-2 thin-scroll" style={{ overflowX: "auto" }}>
                {performer.albums.map((album) => (
                  <div key={album.id} className="flex-shrink-0" style={{ width: "8.5rem" }}>
                    <div
                      className="d-flex align-items-center justify-content-center"
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: "0.5rem",
                        background: "var(--bs-secondary-bg)",
                        overflow: "hidden",
                      }}
                    >
                      {album.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={album.coverUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span className="text-secondary fs-3">
                          <MusicNoteIcon />
                        </span>
                      )}
                    </div>
                    <p className="small text-white mb-0 mt-2" style={{ lineHeight: 1.3 }}>
                      {album.title}
                    </p>
                    <p className="small text-secondary mb-0">
                      {ALBUM_TYPE_LABELS[album.type]}
                      {album.year ? ` · ${album.year}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {performer.songs.length > 0 && (
            <div className="mt-2">
              <h2 className="section-heading mb-2">
                <MusicNoteIcon className="icon-inline" /> Песни и синглы
              </h2>
              <div className="d-flex flex-column gap-2 scroll-list thin-scroll">
                {performer.songs.map((song) => (
                  <div
                    key={song.id}
                    className="surface d-flex align-items-baseline justify-content-between gap-3 px-3 py-2"
                  >
                    <span style={{ minWidth: 0 }}>
                      <span className="text-white">
                        {song.url ? (
                          <a
                            href={song.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-body-emphasis"
                          >
                            {song.title}
                          </a>
                        ) : (
                          song.title
                        )}
                      </span>
                      {song.note && (
                        <span className="small text-secondary"> · {song.note}</span>
                      )}
                    </span>
                    {song.year && (
                      <span className="small text-secondary flex-shrink-0">{song.year}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isBand && performer.memberOfBands.length > 0 && (
            <div className="mt-2">
              <h2
                className="section-heading mb-2"
              >
                Группа
              </h2>
              <div className="d-flex flex-wrap gap-2">
                {performer.memberOfBands.map((m) => (
                  <Link
                    key={m.bandId}
                    href={performerHref(m.band)}
                    className="event-chip text-decoration-none"
                  >
                    {m.band.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {currentPairings.length > 0 && (
        <div className="mb-4">
          <h2
            className="section-heading mb-2"
          >
            В паре с
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {currentPairings.map((pair) => {
              const other = pair.performerAId === id ? pair.performerB : pair.performerA;
              return (
                <EntityMiniCard
                  key={pair.id}
                  href={performerHref(other)}
                  photoUrl={other.photoUrl}
                  name={pair.name || other.name}
                  subtitle={pair.name ? other.name : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {pastPairings.length > 0 && (
        <div className="mb-4">
          <h2
            className="section-heading mb-2"
          >
            Бывшие пары
          </h2>
          <div className="d-flex flex-wrap gap-2 opacity-50">
            {pastPairings.map((pair) => {
              const other = pair.performerAId === id ? pair.performerB : pair.performerA;
              return (
                <EntityMiniCard
                  key={pair.id}
                  href={performerHref(other)}
                  photoUrl={other.photoUrl}
                  name={pair.name || other.name}
                  subtitle={pair.name ? other.name : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      <h2 className="section-heading mb-2">
        Предстоящие события
      </h2>
      {upcoming.length === 0 ? (
        <p className="small text-secondary mb-4">Нет предстоящих событий.</p>
      ) : (
        <div className="d-flex flex-column gap-3 mb-4 scroll-list thin-scroll">
          {upcoming.map((ev) => (
            isPremiumActive(currentUser) ? (

              <EventAgendaRow
              key={ev.occurrenceId}
              event={ev}
              isFavorited={favoritedEventIds.has(ev.id)}
              isGoing={goingEventIds.has(ev.occurrenceId)}
              showDate
            />

            ) : (

              <EventCardLocked key={ev.occurrenceId} startsAt={ev.startsAt} />

            )
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="section-heading mb-2">
            Прошедшие
          </h2>
          <div className="d-flex flex-column gap-3 opacity-50 mb-4 scroll-list thin-scroll">
            {past.map((ev) => (
              isPremiumActive(currentUser) ? (

                <EventAgendaRow
                key={ev.occurrenceId}
                event={ev}
                isFavorited={favoritedEventIds.has(ev.id)}
                isGoing={goingEventIds.has(ev.occurrenceId)}
                showDate
              />

              ) : (

                <EventCardLocked key={ev.occurrenceId} startsAt={ev.startsAt} />

              )
            ))}
          </div>
        </>
      )}
    </div>
  );
}
