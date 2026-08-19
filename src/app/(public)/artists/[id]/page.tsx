import { JsonLd, pageMetadata, personJsonLd } from "@/lib/seo";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import AddToListButton from "@/components/AddToListButton";
import { addPerformerToList } from "@/app/(public)/artist-lists/actions";
import DramaStatusButton from "@/components/DramaStatusButton";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import EntityMiniCard from "@/components/EntityMiniCard";
import SocialLinkIcons from "@/components/SocialLinkIcons";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence, groupByEvent } from "@/lib/eventOccurrences";
import { getDramaWatchStatuses } from "@/lib/favorites";
import { detectSocialPlatform, type SocialPlatform } from "@/lib/socialLinks";
import {
  DRAMA_STATUS_LABELS,
  DRAMA_STATUS_BADGE_CLASS,
} from "@/lib/dramaStatus";
import { performerHref } from "@/lib/performerSlug";
import { agencyHref, slugOrIdWhere } from "@/lib/slugHelpers";
import { dramaHref } from "@/lib/dramaSlug";
import {
  CakeIcon,
  BuildingIcon,
  PinIcon,
  MusicNoteIcon,
  UserIcon,
} from "@/components/icons";
import { isPremiumActive } from "@/lib/premium";
import SeenLiveButton from "@/components/SeenLiveButton";
import { toggleSeenLive } from "@/app/(public)/artists/seenActions";

export const dynamic = "force-dynamic";

const ALBUM_TYPE_LABELS = {
  ALBUM: "Альбом",
  EP: "EP",
  SINGLE: "Сингл",
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const performer = await prisma.performer.findFirst({
    where: slugOrIdWhere(rawId),
    select: { name: true, realName: true, bio: true, photoUrl: true },
  });
  if (!performer)
    return pageMetadata({
      title: "Исполнитель",
      description: "Профиль не найден.",
    });
  return pageMetadata({
    title: `${performer.name}${performer.realName ? ` (${performer.realName})` : ""}`,
    description:
      performer.bio?.slice(0, 160) ??
      `${performer.name}: профиль, сериалы, события и дискография на MyBLHub.`,
    path: `/artists/${rawId}`,
    image: performer.photoUrl,
    type: "article",
  });
}

export default async function PerformerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ events?: string }>;
}) {
  const { id: rawId } = await params;
  const { events: eventsTab } = await searchParams;
  const showPastEvents = eventsTab === "past";
  const performer = await prisma.performer.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      links: true,
      agencies: {
        include: { agency: true },
        orderBy: { agency: { name: "asc" } },
      },
      dramas: {
        include: { drama: true },
        orderBy: { drama: { title: "asc" } },
      },
      bandMembers: {
        include: { performer: true },
        orderBy: { performer: { name: "asc" } },
      },
      memberOfBands: {
        include: { band: true },
        orderBy: { band: { name: "asc" } },
      },
      albums: { orderBy: [{ year: "desc" }, { title: "asc" }] },
      songs: { orderBy: [{ year: "desc" }, { title: "asc" }] },
      // MASCOT: чьи это маскоты; SOLO: маскоты самого актёра
      mascotOwners: {
        include: {
          performer: true,
          pairing: { include: { performerA: true, performerB: true } },
        },
      },
      mascots: { include: { mascot: true } },
    },
  });
  if (!performer) notFound();
  const id = performer.id;
  const isBand = performer.type === "BAND";
  const isMascot = performer.type === "MASCOT";

  // Маскоты актёра: привязанные напрямую + маскоты его пейрингов.
  const pairingMascotOwners = isMascot
    ? []
    : await prisma.mascotOwner.findMany({
        where: {
          pairing: { OR: [{ performerAId: id }, { performerBId: id }] },
        },
        include: { mascot: true },
      });
  const mascotCards = new Map<
    string,
    { id: string; slug: string | null; name: string; photoUrl: string | null }
  >();
  for (const m of [...performer.mascots, ...pairingMascotOwners]) {
    mascotCards.set(m.mascot.id, m.mascot);
  }

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
    l.event.occurrences.map((occ) =>
      flattenOccurrence({ ...occ, event: l.event }),
    ),
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
  // Отметка «видела вживую» — ручная, не зависит от событий афиши.
  const seenLive = currentUser
    ? !!(await prisma.performerSeen.findUnique({
        where: { userId_performerId: { userId: currentUser.id, performerId: performer.id } },
        select: { id: true },
      }))
    : false;
  // Списки пользователя для кнопки «+ в список» рядом с сердечком.
  const myLists = currentUser
    ? (
        await prisma.performerList.findMany({
          where: { userId: currentUser.id },
          select: {
            id: true,
            title: true,
            items: { where: { performerId: performer.id }, select: { performerId: true }, take: 1 },
          },
          orderBy: { title: "asc" },
        })
      ).map((l) => ({ id: l.id, title: l.title, hasPerformer: l.items.length > 0 }))
    : [];
  let isFavorited = false;
  if (currentUser) {
    const favorite = await prisma.favoritePerformer.findUnique({
      where: {
        userId_performerId: { userId: currentUser.id, performerId: id },
      },
    });
    isFavorited = !!favorite;
  }

  const now = new Date();
  // Многодневный фестиваль — ОДНА строка с «+N дат»: список событий
  // артиста про сами события, а не про отдельные даты (в афише и
  // календаре, наоборот, строка на дату).
  const upcoming = groupByEvent(
    performerEvents
      .filter((ev) => ev.startsAt >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  );
  const past = groupByEvent(
    performerEvents
      .filter((ev) => ev.startsAt < now)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()),
  );
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
    d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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
    .filter(
      (item): item is { platform: SocialPlatform; url: string } => !!item,
    );
  const socialItems = [
    ...recognizedLinks,
    ...(performer.mydramalistUrl
      ? [{ platform: "mydramalist" as const, url: performer.mydramalistUrl }]
      : []),
  ];
  const otherLinks = performer.links.filter(
    (l) => !detectSocialPlatform(l.url),
  );

  return (
    <div>
      <BackLink
        fallbackHref={isMascot ? "/artists?view=mascots" : "/artists"}
        fallbackLabel={isMascot ? "← Все маскоты" : "← Все исполнители"}
      />
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          {performer.name}{" "}
          {performer.realName && (
            <span className="fs-5 fw-normal text-secondary">
              ({performer.realName})
            </span>
          )}
        </h1>
        {/* Кнопки — одной группой: при justify-content-between три
            прямых потомка разъезжались по всей ширине, и «плюс»
            выглядел оторванным от сердечка. */}
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <FavoriteButton
            kind="performer"
            id={performer.id}
            isFavorited={isFavorited}
            variant="icon"
          />
          {/* Ручная отметка «видела вживую»: автоматически считаются
              только события из нашей афиши. */}
          {currentUser && (
            <SeenLiveButton
              performerId={performer.id}
              initialSeen={seenLive}
              toggle={toggleSeenLive}
            />
          )}
          {/* Добавить в свой список прямо отсюда: раньше это делалось
              только со страницы самого списка. */}
          {currentUser && (
            <AddToListButton
              lists={myLists}
              onAdd={async (listId: string) => {
                "use server";
                await addPerformerToList(listId, performer.id);
              }}
            />
          )}
        </div>
      </div>

      <div className="d-flex flex-column flex-sm-row gap-4 mb-4">
        {performer.photoUrl && (
          <div className="flex-shrink-0 d-flex flex-column gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src={performer.photoUrl}
              alt={performer.name}
              className="rounded-4"
              style={{ width: "16rem", height: "20rem", objectFit: "cover" }}
            />
            <SocialLinkIcons
              items={socialItems}
              className="justify-content-center mt-2"
            />
          </div>
        )}

        <div
          className="d-flex flex-column gap-2"
          style={{ minWidth: 0, flex: 1 }}
        >
          {!performer.photoUrl && <SocialLinkIcons items={socialItems} />}
          {!isBand && performer.birthDate && (
            <p className="small text-secondary mb-0">
              <CakeIcon />{" "}
              <span className="text-secondary">Дата рождения:</span>{" "}
              {formatBirthDate(performer.birthDate)} (
              {currentAge(performer.birthDate)})
            </p>
          )}
          {!isBand && performer.nationality && (
            <p className="small text-secondary mb-0">
              <PinIcon className="icon-inline" />{" "}
              <span className="text-secondary">Национальность:</span>{" "}
              {performer.nationality}
            </p>
          )}
          {!isBand && performer.alsoKnownAs && (
            <p className="small text-secondary mb-0">
              <UserIcon className="icon-inline" />{" "}
              <span className="text-secondary">Также известен как:</span>{" "}
              {performer.alsoKnownAs}
            </p>
          )}
          {!isBand && performer.musicAlias && (
            <p className="small text-secondary mb-0">
              <MusicNoteIcon />{" "}
              <span className="text-secondary">Выступает как:</span>{" "}
              {performer.musicAlias}
            </p>
          )}
          {!isBand && performer.placeOfBirth && (
            <p className="small text-secondary mb-0">
              <PinIcon className="icon-inline" />{" "}
              <span className="text-secondary">Место рождения:</span>{" "}
              {performer.placeOfBirth}
            </p>
          )}
          {performer.occupation.length > 0 && (
            <p className="small text-secondary mb-0">
              <span className="text-secondary">Занятия:</span>{" "}
              <span className="text-body">
                {performer.occupation.join(", ")}
              </span>
            </p>
          )}
          {performer.instruments.length > 0 && (
            <p className="small text-secondary mb-0">
              <span className="text-secondary">Инструменты:</span>{" "}
              <span className="text-body">
                {performer.instruments.join(", ")}
              </span>
            </p>
          )}
          {performer.soloDebut && (
            <p className="small text-secondary mb-0">
              <span className="text-secondary">Сольный дебют:</span>{" "}
              <span className="text-body">{performer.soloDebut}</span>
            </p>
          )}
          {(performer.height || performer.weight) && (
            <p className="small text-secondary mb-0">
              {performer.height && (
                <>
                  <span className="text-secondary">Рост:</span>{" "}
                  <span className="text-body">
                    {performer.height.replace(/\s*\(.*?\)/g, "").trim()}
                  </span>
                </>
              )}
              {performer.height && performer.weight && " · "}
              {performer.weight && (
                <>
                  <span className="text-secondary">Вес:</span>{" "}
                  <span className="text-body">
                    {performer.weight.replace(/\s*\(.*?\)/g, "").trim()}
                  </span>
                </>
              )}
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
                  <Link
                    href={agencyHref(pa.agency)}
                    className="link-body-emphasis"
                  >
                    {pa.agency.name}
                  </Link>
                  {i < performer.agencies.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          )}
          {performer.bio && (
            <p
              className="small text-secondary mb-0"
              style={{ whiteSpace: "pre-line" }}
            >
              {performer.bio}
            </p>
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
              <h2 className="section-heading mb-2">Участники</h2>
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

          {isMascot && performer.mascotOwners.length > 0 && (
            <div className="mt-2">
              <h2 className="section-heading mb-2">Чей маскот</h2>
              <div className="d-flex flex-wrap gap-2">
                {performer.mascotOwners.map((o) =>
                  o.performer ? (
                    <EntityMiniCard
                      key={o.id}
                      href={performerHref(o.performer)}
                      photoUrl={o.performer.photoUrl}
                      name={o.performer.name}
                    />
                  ) : o.pairing ? (
                    <span key={o.id} className="event-chip">
                      {o.pairing.name ||
                        `${o.pairing.performerA.name} × ${o.pairing.performerB.name}`}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {(currentPairings.length > 0 ||
        pastPairings.length > 0 ||
        mascotCards.size > 0 ||
        (!isBand && performer.memberOfBands.length > 0)) && (
        <div className="d-flex flex-wrap gap-5 mb-4">
          {currentPairings.length > 0 && (
            <div>
              <h2 className="section-heading mb-2">В паре с</h2>
              <div className="d-flex flex-wrap gap-2">
                {currentPairings.map((pair) => {
                  const other =
                    pair.performerAId === id
                      ? pair.performerB
                      : pair.performerA;
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
            <div>
              <h2 className="section-heading mb-2">Бывшие пары</h2>
              <div className="d-flex flex-wrap gap-2 opacity-50">
                {pastPairings.map((pair) => {
                  const other =
                    pair.performerAId === id
                      ? pair.performerB
                      : pair.performerA;
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
          {mascotCards.size > 0 && (
            <div>
              <h2 className="section-heading mb-2">Маскоты</h2>
              <div className="d-flex flex-wrap gap-2">
                {Array.from(mascotCards.values()).map((m) => (
                  <EntityMiniCard
                    key={m.id}
                    href={performerHref(m)}
                    photoUrl={m.photoUrl}
                    name={m.name}
                  />
                ))}
              </div>
            </div>
          )}
          {!isBand && performer.memberOfBands.length > 0 && (
            <div>
              <h2 className="section-heading mb-2">Группа</h2>
              <div className="d-flex flex-wrap gap-2">
                {performer.memberOfBands.map((m) => (
                  <EntityMiniCard
                    key={m.bandId}
                    href={performerHref(m.band)}
                    photoUrl={m.band.photoUrl}
                    name={m.band.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Раздел рисуем только когда события есть: у актёра без событий
          оставался пустой каркас с табами «Предстоящие (0) /
          Прошедшие (0)». */}
      {upcoming.length + past.length > 0 && (
        <>
          <h2 className="section-heading mb-2">События</h2>
          <div className="tab-bar mb-3">
            <Link
              href={performerHref(performer)}
              prefetch={false}
              scroll={false}
              className={`tab-bar-item ${!showPastEvents ? "active" : ""}`}
            >
              Предстоящие ({upcoming.length})
            </Link>
            <Link
              href={`${performerHref(performer)}?events=past`}
              prefetch={false}
              scroll={false}
              className={`tab-bar-item ${showPastEvents ? "active" : ""}`}
            >
              Прошедшие ({past.length})
            </Link>
          </div>
          {(showPastEvents ? past : upcoming).length === 0 ? (
            <p className="small text-secondary mb-4">
              {showPastEvents
                ? "Прошедших событий нет."
                : "Нет предстоящих событий."}
            </p>
          ) : (
            <div
              className={`d-flex flex-column gap-3 mb-4 scroll-list thin-scroll ${showPastEvents ? "opacity-50" : ""}`}
            >
              {(showPastEvents ? past : upcoming).map(({ row, extraDates }) =>
                isPremiumActive(currentUser) ? (
                  <EventAgendaRow
                    key={row.id}
                    event={row}
                    isFavorited={favoritedEventIds.has(row.id)}
                    isGoing={goingEventIds.has(row.occurrenceId)}
                    showDate
                    extraDates={extraDates}
                  />
                ) : (
                  <EventCardLocked key={row.id} startsAt={row.startsAt} />
                ),
              )}
            </div>
          )}
        </>
      )}

      {!isBand && performer.dramas.length > 0 && (
        <div className="mb-4">
          <h2 className="section-heading mb-2">Сериалы</h2>
          <div className="poster-row thin-scroll">
            {sortedDramas.map((pd) => (
              <div key={pd.dramaId} style={{ position: "relative" }}>
                <Link
                  href={dramaHref(pd.drama)}
                  className="text-decoration-none d-block"
                >
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
                        loading="lazy"
                        decoding="async"
                        src={pd.drama.posterUrl}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    )}
                    {pd.drama.status === "RETURNING_SERIES" && (
                      <span
                        className={`badge rounded-pill ${DRAMA_STATUS_BADGE_CLASS.RETURNING_SERIES}`}
                        style={{
                          position: "absolute",
                          top: "0.375rem",
                          left: "0.375rem",
                          fontSize: "0.6rem",
                        }}
                      >
                        {DRAMA_STATUS_LABELS.RETURNING_SERIES}
                      </span>
                    )}
                  </div>
                  <p
                    className="small text-white mb-0 mt-2"
                    style={{ lineHeight: 1.3 }}
                  >
                    {pd.drama.title}
                  </p>
                  {pd.drama.year && (
                    <p className="small text-secondary mb-0">{pd.drama.year}</p>
                  )}
                </Link>
                <div
                  className="position-absolute"
                  style={{ top: "0.375rem", right: "0.375rem" }}
                >
                  <DramaStatusButton
                    dramaId={pd.dramaId}
                    status={statusByDramaId.get(pd.dramaId) ?? null}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {performer.albums.length > 0 && (
        <div className="mb-4">
          <h2 className="section-heading mb-2">
            <MusicNoteIcon className="icon-inline" /> Альбомы
          </h2>
          <div className="poster-row thin-scroll">
            {performer.albums.map((album) => (
              <div key={album.id}>
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
                      loading="lazy"
                      decoding="async"
                      src={album.coverUrl}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span className="text-secondary fs-3">
                      <MusicNoteIcon />
                    </span>
                  )}
                </div>
                <p
                  className="small text-white mb-0 mt-2"
                  style={{ lineHeight: 1.3 }}
                >
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
        <div className="mb-4">
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
                  <span className="small text-secondary flex-shrink-0">
                    {song.year}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {performer.mvAppearances.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-2">Появления в клипах</h2>
          <ul className="small mb-0 ps-3 d-flex flex-column gap-1">
            {performer.mvAppearances.map((mv, i) => (
              <li key={i}>{mv}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(performer.awards) && performer.awards.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-3">Награды и номинации</h2>
          {/* Не таблица: строки-карточки в общем стиле сайта — год слева,
              премия/категория в центре, результат чипом справа. */}
          <div className="d-flex flex-column gap-2">
            {(
              performer.awards as {
                year: string;
                award: string;
                category: string;
                nominee: string;
                result: string;
              }[]
            ).map((a, i) => {
              const won = /won|winner/i.test(a.result);
              return (
                <div key={i} className="award-row">
                  <span className="award-year">{a.year}</span>
                  <div style={{ minWidth: 0 }}>
                    {a.award && (
                      <p className="mb-0 text-white fw-medium">{a.award}</p>
                    )}
                    <p className="small text-secondary mb-0">
                      {a.category}
                      {a.nominee && <> · {a.nominee}</>}
                    </p>
                  </div>
                  {a.result && (
                    <span className={`award-result ${won ? "is-won" : ""}`}>
                      {won && "🏆 "}
                      {a.result}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {performer.trivia.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-2">Факты</h2>
          <ul className="small mb-0 ps-3 d-flex flex-column gap-1">
            {performer.trivia.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {(performer.sourceUrl ||
        performer.mydramalistUrl ||
        (Array.isArray(performer.references) &&
          performer.references.length > 0)) && (
        <div className="mb-3 sources-block">
          <h2 className="section-heading mb-2" style={{ opacity: 0.55 }}>
            Источники
          </h2>
          <ol className="ps-3 mb-0 d-flex flex-column gap-1">
            {(Array.isArray(performer.references)
              ? (performer.references as {
                  label: string;
                  url: string | null;
                }[])
              : []
            ).map((r, i) => (
              <li key={i}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.label || r.url}
                  </a>
                ) : (
                  r.label
                )}
              </li>
            ))}
            {/* Страницы-источники — обычными пунктами списка, следующими
                номерами. Приписку «(Source: MyDramaList)» из тела био
                убрали — атрибуция живёт здесь. */}
            {performer.sourceUrl && (
              <li>
                <a
                  href={performer.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  tpop.fandom.com (CC BY-SA)
                </a>
              </li>
            )}
            {performer.mydramalistUrl && (
              <li>
                <a
                  href={performer.mydramalistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MyDramaList
                </a>
              </li>
            )}
          </ol>
        </div>
      )}
      <JsonLd data={personJsonLd(performer)} />
    </div>
  );
}
