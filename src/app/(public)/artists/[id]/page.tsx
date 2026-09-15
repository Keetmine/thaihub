import { JsonLd, pageMetadata, personJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { pairingNames } from "@/lib/pairingLabel";
import { getContentDict } from "@/lib/contentDictionary.server";
import { translatedList, translatedText } from "@/lib/entityTranslations";
import AppLink from "@/components/AppLink";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { getCurrentUser } from "@/lib/userAuth";
import SynopsisFold from "@/components/SynopsisFold";
import FavoriteButton from "@/components/FavoriteButton";
import AddToListButton from "@/components/AddToListButton";
import { addPerformerToList } from "@/app/(public)/artist-lists/actions";
import DramaStatusButton from "@/components/DramaStatusButton";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import EntityMiniCard from "@/components/EntityMiniCard";
import SocialLinkIcons from "@/components/SocialLinkIcons";
import SubTabs from "@/components/SubTabs";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence, groupByEvent } from "@/lib/eventOccurrences";
import { getDramaWatchStatuses } from "@/lib/favorites";
import { detectSocialPlatform, type SocialPlatform } from "@/lib/socialLinks";
import BirthdayConfetti from "@/components/BirthdayConfetti";
import { DRAMA_STATUS_BADGE_CLASS } from "@/lib/dramaStatus";
import { getT } from "@/lib/i18n";
import { formatDayLongMonth, formatLongDate } from "@/lib/dates";
import { performerHref } from "@/lib/performerSlug";
import { agencyHref, eventHref, slugOrIdWhere } from "@/lib/slugHelpers";
import { dramaHref } from "@/lib/dramaSlug";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import {
  CakeIcon,
  BuildingIcon,
  PinIcon,
  MusicNoteIcon,
  UserIcon,
} from "@/components/icons";
import { isPremiumActive } from "@/lib/premium";
import SeenLiveButton from "@/components/SeenLiveButton";
import { toggleEventSeen, toggleOutsideSeen } from "@/app/(public)/artists/seenActions";
import { performerSeenEvents } from "@/lib/seenLive";
import ListFold from "./ListFold";
import CareerTimeline, { type CareerItem } from "./CareerTimeline";
import { performerPhoto } from "@/lib/performerPhoto";
import { cache } from "react";

export const dynamic = "force-dynamic";

// React.cache: generateMetadata и страница делят ОДИН запрос на
// HTTP-запрос (как getCurrentUser в lib/userAuth.ts) — раньше метадата
// ходила в базу отдельным узким select.
const getPerformer = cache(async (rawId: string) =>
  prisma.performer.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      links: true,
      agencies: {
        include: { agency: true },
        orderBy: { agency: { name: "asc" } },
      },
      dramas: {
        // Узкий select вместо целой строки Drama (аудит 2026-09, п.4): у
        // топ-актёра полные сериалы давали ~112 КБ ответа ради шести
        // полей. Тут ровно то, что рисует страница: ссылка (id/slug/
        // title), название на языке зрителя (titleRu), постер, год, тип
        // и статус для бейджа «Выходит» плюс airedFrom — по нему идёт
        // сортировка фильмографии и годы «Пути артиста».
        select: {
          dramaId: true,
          role: true,
          drama: {
            select: {
              id: true,
              slug: true,
              ...DRAMA_TITLE_SELECT,
              posterUrl: true,
              year: true,
              type: true,
              status: true,
              airedFrom: true,
            },
          },
        },
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
  }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const { t } = await getT();
  const performer = await getPerformer(rawId);
  // notFound() именно здесь: метадата считается до флаша ответа, и
  // несуществующий slug получает настоящий HTTP 404 — иначе loading.tsx
  // успевал отдать 200-shell до notFound() в самой странице (soft-404).
  if (!performer) notFound();
  return pageMetadata({
    title: `${performer.name}${performer.realName ? ` (${performer.realName})` : ""}`,
    description:
      performer.bio?.slice(0, 160) ?? t.catalog.artist.metaDescription(performer.name),
    // Canonical всегда по слагу, а не по запрошенному адресу: страница
    // открывается и по легаси-id, и такой адрес объявлял сам себя
    // каноническим — поисковик видел два «канонических» дубля (образец —
    // locations/novels).
    path: `/artists/${performer.slug ?? performer.id}`,
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
  const { locale, t } = await getT();
  const contentDict = await getContentDict();
  const { events: eventsTab } = await searchParams;
  const showPastEvents = eventsTab === "past";
  // Тот же React.cache-запрос, что и в generateMetadata, — Prisma
  // дёргается один раз на HTTP-запрос.
  const performer = await getPerformer(rawId);
  if (!performer) notFound();
  const id = performer.id;
  // Русские тексты записи (правка владельца 2026-09-10): перевод, если
  // он есть, иначе оригинал — подстановка, а не перевод, как у сериалов.
  // Считаем один раз здесь: значения нужны и в разметке, и в проверке
  // «есть ли что показывать» (hasFacts).
  const bio = translatedText(performer, "bio", performer.bio, locale);
  const placeOfBirth = translatedText(performer, "placeOfBirth", performer.placeOfBirth, locale);
  const soloDebut = translatedText(performer, "soloDebut", performer.soloDebut, locale);
  const trivia = translatedList(performer, "trivia", performer.trivia, locale);
  const mvAppearances = translatedList(performer, "mvAppearances", performer.mvAppearances, locale);
  // Фото, а если его нет — обложка последнего релиза (см.
  // lib/performerPhoto.ts). Альбомы уже загружены выше, отсортированы по
  // году — доп. запрос не нужен.
  const displayPhoto = performerPhoto(performer);
  // Дискографию спарсили с YouTube Music — значит площадка заслужила
  // строку в источниках наравне с tpop и MyDramaList. Признак — ссылки
  // на релизы: сама по себе ссылка на канал в профиле могла быть
  // проставлена руками, без всякого парсинга.
  const ytmSource =
    performer.albums.some((a) => a.url?.includes("music.youtube.com")) ||
    performer.songs.some((sg) => sg.url?.includes("music.youtube.com"))
      ? (performer.links.find((l) => /youtube\.com\/channel\//i.test(l.url))?.url ??
        "https://music.youtube.com/")
      : null;
  const isBand = performer.type === "BAND";
  const isMascot = performer.type === "MASCOT";

  // Кого искать в составах событий: самого артиста и его группы —
  // выступление группы это и его выступление тоже.
  const eventPerformerIds = [id, ...performer.memberOfBands.map((m) => m.bandId)];

  // Первая волна: все запросы зависят только от id артиста — гоним их
  // одним Promise.all вместо четырёх последовательных await.
  const [pairingMascotOwners, performerEventRows, pairings, currentUser] =
    await Promise.all([
      // Маскоты актёра: привязанные напрямую + маскоты его пейрингов.
      isMascot
        ? []
        : prisma.mascotOwner.findMany({
            where: {
              pairing: { OR: [{ performerAId: id }, { performerBId: id }] },
            },
            include: { mascot: true },
          }),
      // События артиста — ТРИ источника, а не один (правка владельца
      // 2026-09-15: «если добавлена группа, у её участников этот эвент
      // не отображается», и лайнап дня не показывался вовсе):
      //   - общий состав события (EventPerformer);
      //   - лайнап конкретного дня (OccurrenceLineup) — у фестиваля
      //     артист часто есть только там;
      //   - события ГРУПП, в которых артист состоит: на сцене был он.
      // Афиша артиста — только каталожные события (см. catalogEvents.ts).
      prisma.event.findMany({
        where: {
          AND: [
            catalogEventsWhere(),
            {
              OR: [
                { performers: { some: { performerId: { in: eventPerformerIds } } } },
                {
                  occurrences: {
                    some: { lineup: { some: { performerId: { in: eventPerformerIds } } } },
                  },
                },
              ],
            },
          ],
        },
        include: {
          performers: { include: { performer: true } },
          occurrences: { orderBy: { startsAt: "asc" } },
        },
      }),
      // Pairings this performer is part of — solo-only, nice-to-have, additive.
      isBand
        ? []
        : prisma.pairing.findMany({
            where: { OR: [{ performerAId: id }, { performerBId: id }] },
            include: { performerA: true, performerB: true },
            orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          }),
      getCurrentUser(),
    ]);
  const mascotCards = new Map<
    string,
    { id: string; slug: string | null; name: string; photoUrl: string | null }
  >();
  for (const m of [...performer.mascots, ...pairingMascotOwners]) {
    mascotCards.set(m.mascot.id, m.mascot);
  }
  const performerEvents = performerEventRows.flatMap((ev) =>
    ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })),
  );
  // АА3. Пара со СВОИМ именем («GhostSheep») получает отдельный блок, и
  // заголовок ему — само имя: у названной пары имя и есть то, как её
  // зовут фанаты, а «В паре с» про неё ничего не сказало бы. Безымянные
  // раскладываются по статусу, как раньше.
  const namedPairings = pairings.filter((p) => p.name);
  const currentPairings = pairings.filter((p) => !p.name && p.status === "CURRENT");
  const pastPairings = pairings.filter((p) => !p.name && p.status === "PAST");
  // Два пейринга с одинаковым именем — один блок на двоих: заголовок
  // повторялся бы, а список под ним читается как единое целое.
  const pairingsByName = new Map<string, typeof namedPairings>();
  for (const pair of namedPairings) {
    const group = pairingsByName.get(pair.name!);
    if (group) group.push(pair);
    else pairingsByName.set(pair.name!, [pair]);
  }

  // Вторая волна: пользовательские отметки — все ждут только
  // currentUser и уже загруженные события/сериалы, между собой не
  // связаны.
  const eventIds = performerEvents.map((ev) => ev.id);
  const occIds = performerEvents.map((ev) => ev.occurrenceId);
  const [
    seenLive,
    myListsRaw,
    favorite,
    favoritedEventIds,
    goingEventIds,
    statusByDramaId,
  ] = await Promise.all([
    // «Видела вживую» — СПИСОК событий, где артист был в составе, и
    // отметка у каждого: снять с фестиваля больше не значит снять со
    // всех концертов (правка владельца 2026-09-15, см. lib/seenLive.ts).
    currentUser ? performerSeenEvents(currentUser.id, performer.id) : null,
    // Списки пользователя для кнопки «+ в список» рядом с сердечком.
    currentUser
      ? prisma.performerList.findMany({
          where: { userId: currentUser.id },
          select: {
            id: true,
            title: true,
            items: { where: { performerId: performer.id }, select: { performerId: true }, take: 1 },
          },
          orderBy: { title: "asc" },
        })
      : [],
    currentUser
      ? prisma.favoritePerformer.findUnique({
          where: {
            userId_performerId: { userId: currentUser.id, performerId: id },
          },
        })
      : null,
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
    getDramaWatchStatuses(
      performer.dramas.map((pd) => pd.dramaId),
      currentUser?.id,
    ),
  ]);
  const myLists = myListsRaw.map((l) => ({
    id: l.id,
    title: l.title,
    hasPerformer: l.items.length > 0,
  }));
  const isFavorited = !!favorite;

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

  // Дискография: у музыкантов она доходит до полусотни строк, и
  // страница уезжала в бесконечность (жалоба владельца на
  // /artists/1mill). Показываем начало, остальное — по кнопке. Хвост в
  // одну-две строки прятать незачем, как и в графике серий: кнопка
  // заняла бы столько же места, сколько экономит.
  const SONGS_PREVIEW = 12;
  const songsCollapsed = performer.songs.length - SONGS_PREVIEW > 2;
  const songRow = (song: (typeof performer.songs)[number]) => (
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
        {song.note && <span className="small text-secondary"> · {song.note}</span>}
      </span>
      {song.year && (
        <span className="small text-secondary flex-shrink-0">{song.year}</span>
      )}
    </div>
  );

  // Порядок сериалов (просьба владельца): сначала TBA — те, у кого нет
  // ни даты старта, ни года (правка владельца 2026-09-10). Раньше они
  // лежали в самом низу, а это как раз то, чего ждут: проекты, которые
  // сняли или снимают, и премьеры у которых ещё нет. Дальше анонсы с
  // датой — ближайшая премьера сверху, — и вышедшие, свежие сверху.
  // Сортируем по полной дате старта (airedFrom), а не по голому году:
  // два сериала одного года раньше вставали по алфавиту.
  const dramaAirTime = (d: (typeof performer.dramas)[number]["drama"]) =>
    d.airedFrom?.getTime() ?? (d.year != null ? Date.UTC(d.year, 0, 1) : null);
  const nowMs = now.getTime();
  // Анонс — это и PLANNED, и IN_PRODUCTION/PILOT (снимается, даты пока
  // нет), и любой сериал с датой старта в будущем.
  const isAnnounced = (d: (typeof performer.dramas)[number]["drama"]) =>
    d.status === "PLANNED" ||
    d.status === "IN_PRODUCTION" ||
    d.status === "PILOT" ||
    (dramaAirTime(d) ?? -Infinity) > nowMs;
  // Отменённые — в самый конец всего списка (правка владельца
  // 2026-09-10). Формально они TBA (даты нет и не будет), но вести ими
  // фильмографию нельзя: проект закрыт. На карточке они помечены
  // бейджем «Отменён» — иначе внизу списка они читались бы просто как
  // «что-то недозаполненное».
  const isCanceled = (d: (typeof performer.dramas)[number]["drama"]) =>
    d.status === "CANCELED";
  const sortedDramas = [...performer.dramas].sort((a, b) => {
    const canA = isCanceled(a.drama);
    const canB = isCanceled(b.drama);
    if (canA !== canB) return canA ? 1 : -1;
    const tA = dramaAirTime(a.drama);
    const tB = dramaAirTime(b.drama);
    // TBA впереди всего — и статус тут не при чём: важно, что даты нет.
    if ((tA == null) !== (tB == null)) return tA == null ? -1 : 1;
    // Внутри TBA сравнивать нечем — по названию, чтобы порядок был
    // устойчивым, а не «как легло из базы».
    if (tA == null || tB == null) {
      return dramaTitleForLocale(a.drama, locale).localeCompare(
        dramaTitleForLocale(b.drama, locale),
      );
    }
    const annA = isAnnounced(a.drama);
    const annB = isAnnounced(b.drama);
    if (annA !== annB) return annA ? -1 : 1;
    return annA ? tA - tB : tB - tA;
  });

  // Три раздела вместо одного (просьба владельца): под сериалами —
  // фильмы, под ними шоу. Делим по Drama.type (свободная строка с MDL);
  // запись без типа считается сериалом — их большинство, и это почти
  // всегда правда.
  const movieDramas = sortedDramas.filter((pd) => pd.drama.type === "Movie");
  const showDramas = sortedDramas.filter(
    (pd) => pd.drama.type === "TV Show" || pd.drama.type === "TV Program",
  );
  const seriesDramas = sortedDramas.filter(
    (pd) => !movieDramas.includes(pd) && !showDramas.includes(pd),
  );

  // «Путь артиста» (аудит 2026-09, п.7): хроника по годам из того, что
  // страница УЖЕ загрузила — фильмография, прошедшие события, альбомы,
  // awards. Своих запросов у блока нет.
  const isPremium = isPremiumActive(currentUser);
  const careerItems: CareerItem[] = [];
  for (const pd of performer.dramas) {
    // Анонсы и записи без года — не «путь»: хроника только о том, что
    // уже случилось (события ниже отфильтрованы так же — только прошедшие).
    if (pd.drama.year == null || isAnnounced(pd.drama)) continue;
    careerItems.push({
      key: `drama-${pd.dramaId}`,
      year: pd.drama.year,
      time: dramaAirTime(pd.drama) ?? Date.UTC(pd.drama.year, 0, 1),
      kind:
        pd.drama.type === "Movie"
          ? "movie"
          : pd.drama.type === "TV Show" || pd.drama.type === "TV Program"
            ? "show"
            : "series",
      title: dramaTitleForLocale(pd.drama, locale),
      subtitle: pd.role,
      href: dramaHref(pd.drama),
    });
  }
  for (const { row } of past) {
    // Тот же гейт, что у списка событий выше: без подписки настоящие
    // данные события (название, ссылка) в разметку не попадают вовсе —
    // только дата, как в EventCardLocked.
    careerItems.push({
      key: `event-${row.id}`,
      year: row.startsAt.getFullYear(),
      time: row.startsAt.getTime(),
      kind: "event",
      subtitle: formatDayLongMonth(row.startsAt, locale),
      ...(isPremium
        ? { title: row.title, href: eventHref(row) }
        : { title: t.events.card.lockedBadge, locked: true }),
    });
  }
  for (const album of performer.albums) {
    if (album.year == null || album.year > now.getFullYear()) continue;
    careerItems.push({
      key: `album-${album.id}`,
      year: album.year,
      time: Date.UTC(album.year, 0, 1),
      kind: album.type === "SINGLE" ? "single" : album.type === "EP" ? "ep" : "album",
      title: album.title,
      // У релиза своей страницы нет — ведём на площадку, если импорт
      // сохранил ссылку.
      url: album.url ?? undefined,
    });
  }
  if (Array.isArray(performer.awards)) {
    (
      performer.awards as {
        year: string;
        award: string;
        category: string;
        result: string;
      }[]
    ).forEach((a, i) => {
      // Год в awards — строка с MDL; без внятного года пункту не встать
      // в хронику.
      const awardYear = Number.parseInt(a.year, 10);
      if (!Number.isFinite(awardYear)) return;
      careerItems.push({
        key: `award-${i}`,
        year: awardYear,
        time: Date.UTC(awardYear, 0, 1),
        kind: "award",
        title: a.award || a.category,
        subtitle: a.award
          ? [a.category, a.result].filter(Boolean).join(" · ")
          : a.result,
      });
    });
  }

  /**
   * Сегодня ли у него день рождения — от этого зависит праздничное
   * оформление страницы (просьба владельца 2026-09-10).
   *
   * Дата рождения — НАСТЕННАЯ: в базе она лежит полуночью UTC, поэтому
   * месяц и число из неё читаются UTC-геттерами (см. lib/dates.ts).
   * Сегодняшний день, наоборот, берём по местному времени процесса
   * (TZ=Europe/Moscow) — праздник должен начинаться в полночь у
   * зрителя, а не в три часа ночи, когда наступит полночь по UTC.
   */
  const isBirthdayToday =
    !isBand &&
    !!performer.birthDate &&
    now.getMonth() === performer.birthDate.getUTCMonth() &&
    now.getDate() === performer.birthDate.getUTCDate();

  const currentAge = (d: Date) => {
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    if (
      today.getMonth() < d.getMonth() ||
      (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())
    ) {
      age -= 1;
    }
    return t.catalog.artist.age(age);
  };

  /* Плашка «Сегодня день рождения» — под фото и соцсетями (правка
     владельца 2026-09-10): в шапке она разрывала имя и кнопки, а под
     колонкой фото читается как подпись к портрету. Узел один на два
     возможных места: без фото колонки нет, и плашка встаёт под именем. */
  const birthdayBadge = isBirthdayToday ? (
    // Возраста в плашке нет намеренно: он стоит строкой правее, в
    // «Дата рождения: … (34 года)», а с ним подпись переносилась на две
    // строки и «34 года» висело отдельной строчкой.
    <p className="birthday-badge mb-0 align-self-center">
      🎂 {t.catalog.artist.birthdayToday}
    </p>
  ) : null;

  // Бренды вынуты из общей кучи первыми: бренд может вести на инстаграм,
  // и без этого он превратился бы в безымянную иконку соцсети — то есть
  // потерял бы ровно то, ради чего заведён, своё название.
  const brandLinks = performer.links.filter((l) => l.kind === "BRAND");
  const nonBrandLinks = performer.links.filter((l) => l.kind !== "BRAND");

  const recognizedLinks = nonBrandLinks
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
  const otherLinks = nonBrandLinks.filter((l) => !detectSocialPlatform(l.url));

  // Все строки блока фактов условные — пустую панель не рисуем (как на
  // странице сериала): у записи без анкетных данных шапка сразу
  // переходит к событиям/сериалам.
  const hasFacts =
    (!isBand &&
      !!(
        performer.birthDate ||
        performer.nationality ||
        performer.alsoKnownAs ||
        performer.musicAlias ||
        placeOfBirth
      )) ||
    performer.occupation.length > 0 ||
    performer.instruments.length > 0 ||
    !!soloDebut ||
    !!performer.height ||
    !!performer.weight ||
    performer.agencies.length > 0 ||
    !!bio ||
    otherLinks.length > 0 ||
    brandLinks.length > 0 ||
    (isBand && performer.bandMembers.length > 0) ||
    (isMascot && performer.mascotOwners.length > 0) ||
    (!displayPhoto && socialItems.length > 0);

  return (
    <div>
      {/* Конфетти — клиентское и одноразовое, само снимается через
          четыре секунды; при prefers-reduced-motion не рисуется вовсе. */}
      {isBirthdayToday && <BirthdayConfetti />}
      <BackLink
        fallbackHref={isMascot ? "/artists?view=mascots" : "/artists"}
        fallbackLabel={
          isMascot ? t.catalog.artist.backMascots : t.catalog.artist.back
        }
      />
      {/* Классическая шапка (фидбек владельца, как у сериалов): имя +
          realName, кнопки справа — без размытого hero. Ряд чипов не
          выводим: агентство и так в фактах («Студия»), а счётчики
          только путают (в них попадают и прошедшие события). */}
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mt-2 mb-4">
        <div style={{ minWidth: 0 }}>
          <h1 className="display-1-tight mb-1" style={{ fontSize: "2.25rem" }}>
            {performer.name}
            {performer.realName && (
              <>
                {" "}
                <span className="fs-5 fw-normal text-secondary">
                  ({performer.realName})
                </span>
              </>
            )}
          </h1>
          {/* Без фото плашке некуда встать в колонке — тогда она живёт
              под именем. */}
          {!displayPhoto && birthdayBadge}
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <FavoriteButton
            kind="performer"
            id={performer.id}
            isFavorited={isFavorited}
            variant="icon"
          />
          {/* «Видела вживую»: глазик со счётчиком, по клику — список
              посещённых событий с этим артистом и отметка у каждого.
              Снять на одном фестивале, оставив пять концертов, можно
              только так (правка владельца 2026-09-15). */}
          {currentUser && seenLive && (
            <SeenLiveButton
              performerId={performer.id}
              events={seenLive.events}
              outside={seenLive.outside}
              personalEvents={seenLive.personalEvents}
              toggleEvent={toggleEventSeen}
              toggleOutside={toggleOutsideSeen}
            />
          )}
          {/* Добавить в свой список прямо отсюда. */}
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

      {/* Фото слева + факты справа — как на странице сериала. Блок фото
          рисуем только при displayPhoto: без него факты занимают всю
          ширину, а соцссылки живут внутри блока фактов. */}
      {(displayPhoto || hasFacts) && (
      <div className="d-flex flex-column flex-sm-row gap-4 mb-4">
        {displayPhoto && (
          <div className="flex-shrink-0 d-flex flex-column gap-2">
            {/* В день рождения фото в праздничной рамке. Рамку рисует
                псевдоэлемент обёртки ПОВЕРХ фото: отступ раздвигал бы
                колонку, а размер портрета меняться не должен. Само фото
                при этом ничем не отличается от обычного дня. */}
            <div className={isBirthdayToday ? "birthday-frame" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                loading="eager"
                decoding="async"
                src={displayPhoto}
                alt={performer.name}
                className="rounded-4"
                style={{
                  width: "15rem",
                  aspectRatio: "3 / 4",
                  objectFit: "cover",
                }}
              />
            </div>
            <SocialLinkIcons
              items={socialItems}
              className="justify-content-center"
            />
            {birthdayBadge}
          </div>
        )}
        {/* Факты и био — просто текстом, без фона-карточки (фидбек
            владельца). Значения НЕ выделяются белым: у «Занятий»,
            «Инструментов», «Сольного дебюта», роста и веса стоял
            text-body, и половина блока была ярче другой половины
            (правка владельца 2026-09-10). Теперь цвет один на весь
            блок — он наследуется от text-secondary у самой строки. */}
        {hasFacts && (
        <div
          className="d-flex flex-column gap-2 flex-fill"
          style={{ minWidth: 0 }}
        >
          {!displayPhoto && <SocialLinkIcons items={socialItems} />}
          {!isBand && performer.birthDate && (
            <p className="small text-secondary mb-0">
              <CakeIcon />{" "}
              <span className="text-secondary">{t.catalog.artist.birthDate}</span>{" "}
              {formatLongDate(performer.birthDate, locale)} (
              {currentAge(performer.birthDate)})
            </p>
          )}
          {!isBand && performer.nationality && (
            <p className="small text-secondary mb-0">
              <PinIcon className="icon-inline" />{" "}
              <span className="text-secondary">{t.catalog.artist.nationality}</span>{" "}
              {contentDict.performerCountry(performer.nationality)}
            </p>
          )}
          {!isBand && performer.alsoKnownAs && (
            <p className="small text-secondary mb-0">
              <UserIcon className="icon-inline" />{" "}
              <span className="text-secondary">{t.catalog.artist.alsoKnownAs}</span>{" "}
              {performer.alsoKnownAs}
            </p>
          )}
          {!isBand && performer.musicAlias && (
            <p className="small text-secondary mb-0">
              <MusicNoteIcon />{" "}
              <span className="text-secondary">{t.catalog.artist.performsAs}</span>{" "}
              {performer.musicAlias}
            </p>
          )}
          {!isBand && placeOfBirth && (
            <p className="small text-secondary mb-0">
              <PinIcon className="icon-inline" />{" "}
              <span className="text-secondary">{t.catalog.artist.placeOfBirth}</span>{" "}
              {placeOfBirth}
            </p>
          )}
          {performer.occupation.length > 0 && (
            <p className="small text-secondary mb-0">
              <span className="text-secondary">{t.catalog.artist.occupation}</span>{" "}
              {performer.occupation.map((o) => contentDict.occupation(o)).join(", ")}
            </p>
          )}
          {performer.instruments.length > 0 && (
            <p className="small text-secondary mb-0">
              <span className="text-secondary">{t.catalog.artist.instruments}</span>{" "}
              {performer.instruments.map((i) => contentDict.instrument(i)).join(", ")}
            </p>
          )}
          {soloDebut && (
            <p className="small text-secondary mb-0">
              <span className="text-secondary">{t.catalog.artist.soloDebut}</span>{" "}
              {soloDebut}
            </p>
          )}
          {(performer.height || performer.weight) && (
            <p className="small text-secondary mb-0">
              {performer.height && (
                <>
                  <span className="text-secondary">{t.catalog.artist.height}</span>{" "}
                  {performer.height.replace(/\s*\(.*?\)/g, "").trim()}
                </>
              )}
              {performer.height && performer.weight && " · "}
              {performer.weight && (
                <>
                  <span className="text-secondary">{t.catalog.artist.weight}</span>{" "}
                  {performer.weight.replace(/\s*\(.*?\)/g, "").trim()}
                </>
              )}
            </p>
          )}
          {performer.agencies.length > 0 && (
            <p className="small text-secondary mb-0">
              <BuildingIcon />{" "}
              <span className="text-secondary">
                {performer.agencies.length > 1
                  ? t.catalog.artist.agencies
                  : t.catalog.artist.agency}
              </span>{" "}
              {performer.agencies.map((pa, i) => (
                <span key={pa.agencyId}>
                  <AppLink
                    href={agencyHref(pa.agency)}
                    className="link-body-emphasis"
                  >
                    {pa.agency.name}
                  </AppLink>
                  {i < performer.agencies.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          )}
          {/* Длинная биография свёрнута до ~4 строк, как синопсис у
              сериала: текст в summary, details[open] снимает line-clamp,
              подпись «Читать дальше/Свернуть» рисует сам SynopsisFold.
              Короткая — как раньше, обычным абзацем. */}
          {bio &&
            (bio.length > 300 ? (
              <SynopsisFold
                text={bio}
                textClassName="small text-secondary"
                preLine
              />
            ) : (
              <p
                className="small text-secondary mb-0"
                style={{ whiteSpace: "pre-line" }}
              >
                {bio}
              </p>
            ))}

          {/* Личные бренды — под описанием и своим заголовком: это не
              «ещё одна ссылка», а своё дело артиста, и у него есть имя,
              которое нужно показать. Соседние otherLinks остаются просто
              кнопками. */}
          {brandLinks.length > 0 && (
            <div className="mt-3">
              <h2 className="section-heading mb-2">{t.catalog.artist.brands}</h2>
              <div className="d-flex flex-wrap gap-2">
                {brandLinks.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip-link"
                  >
                    {l.label}
                  </a>
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
              <h2 className="section-heading mb-2">{t.catalog.artist.members}</h2>
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
              <h2 className="section-heading mb-2">{t.catalog.artist.mascotOf}</h2>
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
                      {pairingNames(o.pairing)}
                      {o.pairing.name && (
                        <span className="small text-secondary"> · {o.pairing.name}</span>
                      )}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
      )}

      {(currentPairings.length > 0 ||
        pastPairings.length > 0 ||
        namedPairings.length > 0 ||
        mascotCards.size > 0 ||
        (!isBand && performer.memberOfBands.length > 0)) && (
        <div className="d-flex flex-wrap gap-5 mb-4">
          {currentPairings.length > 0 && (
            <div>
              <h2 className="section-heading mb-2">{t.catalog.artist.pairedWith}</h2>
              <div className="d-flex flex-wrap gap-2">
                {/* В карточке — ОДНО имя, партнёра (правка владельца
                    2026-09-11). Пробовали «Zee × NuNew» составом пары —
                    вживую не подошло: карточка и так стоит на странице
                    человека, и его имя в ней лишнее. Порядок самой пары
                    от этого не зависит: он задаётся пейрингом и работает
                    там, где выводится список людей (см. castLineup). */}
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
                      name={other.name}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {pastPairings.length > 0 && (
            <div>
              <h2 className="section-heading mb-2">{t.catalog.artist.pastPairings}</h2>
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
                      name={other.name}
                    />
                  );
                })}
              </div>
            </div>
          )}
          {/* Названные пары — каждая своим блоком под своим именем
              (АА3, правка владельца 2026-09-06). Бывшая названная пара
              приглушена так же, как «Бывшие пары»: статус читается
              видом, раз в заголовке теперь имя. */}
          {[...pairingsByName].map(([pairName, group]) => (
            <div key={pairName}>
              <h2 className="section-heading mb-2">{pairName}</h2>
              <div
                className={`d-flex flex-wrap gap-2${
                  group.every((pair) => pair.status === "PAST") ? " opacity-50" : ""
                }`}
              >
                {group.map((pair) => {
                  const other = pair.performerAId === id ? pair.performerB : pair.performerA;
                  return (
                    <EntityMiniCard
                      key={pair.id}
                      href={performerHref(other)}
                      photoUrl={other.photoUrl}
                      name={other.name}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {mascotCards.size > 0 && (
            <div>
              <h2 className="section-heading mb-2">{t.catalog.artist.mascots}</h2>
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
              <h2 className="section-heading mb-2">{t.catalog.artist.band}</h2>
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
          <h2 className="section-heading mb-2">{t.catalog.artist.events}</h2>
          <div className="tab-bar mb-3">
            <AppLink
              href={performerHref(performer)}
              prefetch={false}
              scroll={false}
              className={`tab-bar-item ${!showPastEvents ? "active" : ""}`}
            >
              {t.catalog.artist.upcoming(upcoming.length)}
            </AppLink>
            <AppLink
              href={`${performerHref(performer)}?events=past`}
              prefetch={false}
              scroll={false}
              className={`tab-bar-item ${showPastEvents ? "active" : ""}`}
            >
              {t.catalog.artist.past(past.length)}
            </AppLink>
          </div>
          {(showPastEvents ? past : upcoming).length === 0 ? (
            <p className="small text-secondary mb-4">
              {showPastEvents
                ? t.catalog.artist.noPast
                : t.catalog.artist.noUpcoming}
            </p>
          ) : (
            <div
              className={`d-flex flex-column gap-3 mb-4 ${showPastEvents ? "opacity-50" : ""}`}
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


      {/* Сериалы / Фильмы / Шоу — под-табами, а не тремя лентами друг
          под другом (правка владельца: компактнее). Пустые типы пилюль
          не получают; запись без Drama.type считается сериалом. */}
      {!isBand && sortedDramas.length > 0 && (
        <div className="mb-4">
          <SubTabs
            ariaLabel={t.catalog.artist.series}
            variant="bar"
            tabs={(
              [
                ["series", t.catalog.artist.series, seriesDramas],
                ["movies", t.catalog.artist.movies, movieDramas],
                ["shows", t.catalog.artist.shows, showDramas],
              ] as const
            ).flatMap(([key, label, rows]) =>
              rows.length === 0
                ? []
                : [
                    {
                      key,
                      label,
                      count: rows.length,
                      content: (
          <div className="poster-row thin-scroll">
            {rows.map((pd) => {
              return (
              <div key={pd.dramaId} style={{ position: "relative" }}>
                <AppLink
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
                    {/* Бейдж на постере — только там, где статус меняет
                        смысл строки: «Выходит» (идёт прямо сейчас) и
                        «Отменён» (правка владельца 2026-09-10: такие
                        уехали в конец списка, и без пометки было бы
                        непонятно, почему они там). Остальные статусы
                        читаются из года под названием. */}
                    {(pd.drama.status === "RETURNING_SERIES" ||
                      pd.drama.status === "CANCELED") && (
                      <span
                        className={`badge rounded-pill poster-status-badge ${DRAMA_STATUS_BADGE_CLASS[pd.drama.status]}`}
                        style={{
                          position: "absolute",
                          top: "0.375rem",
                          left: "0.375rem",
                          fontSize: "0.6rem",
                        }}
                      >
                        {t.catalog.dramaStatus[pd.drama.status]}
                      </span>
                    )}
                  </div>
                  <p
                    className="small text-white mb-0 mt-2"
                    style={{ lineHeight: 1.3 }}
                  >
                    {dramaTitleForLocale(pd.drama, locale)}
                  </p>
                  {pd.drama.year && (
                    <p className="small text-secondary mb-0">{pd.drama.year}</p>
                  )}
                </AppLink>
                <div
                  className="position-absolute"
                  style={{ top: "0.375rem", right: "0.375rem" }}
                >
                  <DramaStatusButton
                    dramaId={pd.dramaId}
                    status={statusByDramaId.get(pd.dramaId)?.status ?? null}
                  />
                </div>
              </div>
              );
            })}
          </div>
                      ),
                    },
                  ],
            )}
          />
        </div>
      )}
      {performer.albums.length > 0 && (
        <div className="mb-4">
          <h2 className="section-heading mb-2">
            <MusicNoteIcon className="icon-inline" /> {t.catalog.artist.albums}
          </h2>
          <div className="poster-row thin-scroll">
            {performer.albums.map((album) => {
              // Обложка и название ведут на релиз, если импорт сохранил
              // ссылку. Без неё карточка остаётся обычным блоком: пустой
              // <a> выглядел бы кликабельным и никуда не вёл.
              const Card = album.url ? "a" : "div";
              const cardProps = album.url
                ? {
                    href: album.url,
                    target: "_blank" as const,
                    rel: "noopener noreferrer",
                    className: "text-decoration-none d-block album-card",
                  }
                : {};
              return (
              <Card key={album.id} {...cardProps}>
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
                  {t.catalog.albumType[album.type]}
                  {album.year ? ` · ${album.year}` : ""}
                  {album.url ? " ↗" : ""}
                </p>
              </Card>
              );
            })}
          </div>
        </div>
      )}

      {performer.songs.length > 0 && (
        <div className="mb-4">
          <h2 className="section-heading mb-2">
            <MusicNoteIcon className="icon-inline" /> {t.catalog.artist.songs}
          </h2>
          {/* Хвост дискографии свёрнут: у музыканта бывает под полсотни
              песен, и страница уходила в бесконечность. */}
          <ListFold
            className="d-flex flex-column gap-2"
            total={performer.songs.length}
            visible={(songsCollapsed
              ? performer.songs.slice(0, SONGS_PREVIEW)
              : performer.songs
            ).map(songRow)}
            rest={songsCollapsed ? performer.songs.slice(SONGS_PREVIEW).map(songRow) : null}
          />
        </div>
      )}

      {/* «Путь артиста» — после фильмографии и дискографии: хроника
          собирает воедино то, что выше разложено по типам. Блок сам
          прячется, когда пунктов меньше двух (нечего листать). */}
      <CareerTimeline items={careerItems} />

      {mvAppearances.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-2">{t.catalog.artist.mvAppearances}</h2>
          <ul className="small mb-0 ps-3 d-flex flex-column gap-1">
            {mvAppearances.map((mv, i) => (
              <li key={i}>{mv}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(performer.awards) && performer.awards.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-3">{t.catalog.artist.awards}</h2>
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

      {trivia.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-2">{t.catalog.artist.trivia}</h2>
          <ul className="small mb-0 ps-3 d-flex flex-column gap-1">
            {trivia.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {(performer.sourceUrl ||
        performer.mydramalistUrl ||
        performer.musicFestivalUrl ||
        ytmSource ||
        (Array.isArray(performer.references) &&
          performer.references.length > 0)) && (
        <div className="mb-3 sources-block">
          <h2 className="section-heading mb-2" style={{ opacity: 0.55 }}>
            {t.catalog.sources}
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
            {performer.musicFestivalUrl && (
              <li>
                <a
                  href={performer.musicFestivalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  musicfestival.in.th
                </a>
              </li>
            )}
            {ytmSource && (
              <li>
                <a href={ytmSource} target="_blank" rel="noopener noreferrer">
                  music.youtube.com
                </a>
              </li>
            )}
          </ol>
        </div>
      )}
      <JsonLd data={personJsonLd(performer)} />
      {/* Крошки: ступень раздела повторяет ссылку-возврат вверху
          страницы — у маскотов она ведёт в свою вкладку каталога. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: t.catalog.breadcrumb.home, path: "/" },
            isMascot
              ? {
                  name: t.catalog.breadcrumb.mascots,
                  path: "/artists?view=mascots",
                }
              : { name: t.catalog.breadcrumb.artists, path: "/artists" },
            // По слагу, как canonical в метадате: крошка с легаси-id
            // расходилась бы с каноническим адресом страницы.
            { name: performer.name, path: `/artists/${performer.slug ?? performer.id}` },
          ],
          locale,
        )}
      />
    </div>
  );
}
