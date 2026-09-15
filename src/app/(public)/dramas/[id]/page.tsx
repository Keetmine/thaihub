import UploadImage from "@/components/UploadImage";
import { getContentDict } from "@/lib/contentDictionary.server";
import {
  pageMetadata,
  JsonLd,
  tvSeriesJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo";
import ReviewsAndComments from "@/components/ReviewsAndComments";
import SourcesBlock from "@/components/SourcesBlock";
import AppLink from "@/components/AppLink";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { getCurrentUser } from "@/lib/userAuth";
import DramaStatusButton from "@/components/DramaStatusButton";
import EpisodeProgress from "@/components/EpisodeProgress";
import RewatchCounter from "@/components/RewatchCounter";
import DramaRating from "@/components/DramaRating";
import { fetchDramaScore } from "@/lib/dramaRating";
import { ratingColor } from "@/lib/ratingColor";
import { episodeProgress } from "@/lib/watchStatus";
import { dramaSynopsisForLocale, dramaTitleForLocale } from "@/lib/dramaLocale";
import { findSimilarDramas } from "@/lib/similarDramas";
import EpisodeBellButton from "./EpisodeBellButton";
import EpisodeSchedule from "@/components/EpisodeSchedule";
import EntityMiniCard from "@/components/EntityMiniCard";
import CastGrid from "@/components/CastGrid";
import type { ReactNode } from "react";
import TagRowFold from "@/components/TagRowFold";
import SynopsisFold from "@/components/SynopsisFold";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import VisitedButton from "@/components/VisitedButton";
import {
  PinIcon,
  BuildingIcon,
  BookIcon,
  CalendarIcon,
  TagIcon,
  TvIcon,
  InfoIcon,
  GridIcon,
  StarIcon,
} from "@/components/icons";
import {
  getDramaWatchStatuses,
  getFavoritedEventIds,
  getGoingOccurrenceIds,
  getMaybeOccurrenceIds,
} from "@/lib/favorites";
import { flattenOccurrence, groupByEvent } from "@/lib/eventOccurrences";
import { DRAMA_STATUS_BADGE_CLASS } from "@/lib/dramaStatus";
import { performerHref } from "@/lib/performerSlug";
import { userDisplayName, userHref } from "@/lib/userProfile";
import {
  fetchPairingsAmong,
  hideMembersOfListedBands,
  keepPairingsTogether,
} from "@/lib/castLineup";
import {
  agencyHref,
  locationHref,
  novelHref,
  slugOrIdWhere,
} from "@/lib/slugHelpers";
import { isPremiumActive } from "@/lib/premium";
import { dramaHref } from "@/lib/dramaSlug";
import {
  dateKey,
  formatCombinedDateList,
  formatDateWithYear,
  formatShortDate,
  parseDateKey,
  startOfDay,
} from "@/lib/dates";
import { getT } from "@/lib/i18n";
import { cache } from "react";

export const dynamic = "force-dynamic";

// Сколько тегов видно до «ещё N» — примерно одна строка на десктопе.
const TAGS_VISIBLE = 6;

// React.cache: generateMetadata и страница делят ОДИН запрос на
// HTTP-запрос (как getCurrentUser в lib/userAuth.ts) — раньше метадата
// ходила в базу отдельным узким select.
const getDrama = cache(async (rawId: string) =>
  prisma.drama.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      // _count.events — маркер популярности актёра для сортировки каста
      // (EventPerformer.performerId проиндексирован, счётчик дёшев).
      // bandMembers — состав группы: если в касте стоит и группа, и её
      // участники, участники из списка убираются (АА14).
      performers: {
        include: {
          performer: {
            include: {
              _count: { select: { events: true } },
              bandMembers: { select: { performerId: true } },
            },
          },
        },
      },
      agency: true,
      agencies: { include: { agency: true } },
      locations: {
        include: { location: true },
        orderBy: { location: { name: "asc" } },
      },
      novel: true,
      relatedFrom: { include: { related: true } },
      relatedTo: { include: { drama: true } },
      episodeList: { orderBy: { number: "asc" } },
    },
  }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const { t, locale } = await getT();
  const drama = await getDrama(rawId);
  // notFound() именно здесь: метадата считается до флаша ответа, и
  // несуществующий slug получает настоящий HTTP 404 — иначе loading.tsx
  // успевал отдать 200-shell до notFound() в самой странице (soft-404).
  if (!drama) notFound();
  return pageMetadata({
    title: `${dramaTitleForLocale(drama, locale)}${drama.year ? ` (${drama.year})` : ""}`,
    description:
      dramaSynopsisForLocale(drama, locale)?.slice(0, 160) ??
      t.catalog.drama.metaDescription(dramaTitleForLocale(drama, locale)),
    // Canonical всегда по слагу, а не по запрошенному адресу: страница
    // открывается и по легаси-id, и такой адрес объявлял сам себя
    // каноническим — поисковик видел два «канонических» дубля (образец —
    // locations/novels).
    path: `/dramas/${drama.slug ?? drama.id}`,
    image: drama.posterUrl,
    type: "article",
  });
}

/**
 * Строка блока фактов: иконка, подпись и значение — одной строкой
 * (правки владельца 2026-09-07).
 *
 * Сначала была сетка с колонкой подписей фиксированной ширины, чтобы
 * значения стояли друг под другом, — владелец её отменила: «убираем
 * фиксированную ширину, выводим всё в строку, как и раньше». Так что
 * выравнивание тут держится не колонкой, а тем, ради чего всё
 * затевалось: одинаковым отступом между строками (`.drama-facts`) и
 * чипами, которые не растят свою строку.
 *
 * Компонент всё равно нужен: раньше каждая строка носила свой набор
 * классов и свой mb-2, и отступы разъезжались от строки к строке.
 *
 * Иконка необязательна: у строки со своей оценкой её роль играют сами
 * звёзды.
 */
function Fact({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="drama-fact text-secondary">
      <span className="drama-fact-label">
        {icon}
        {icon ? " " : null}
        {label}
      </span>{" "}
      <span className="drama-fact-value">{children}</span>
    </div>
  );
}

export default async function DramaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const { locale, t } = await getT();
  // Словарь повторяющихся значений (жанры и т.п.): правки владельца
  // из админки поверх значений по умолчанию — см. contentDictionary.ts.
  const contentDict = await getContentDict();

  // Тот же React.cache-запрос, что и в generateMetadata, — Prisma
  // дёргается один раз на HTTP-запрос.
  const drama = await getDrama(rawId);

  if (!drama) notFound();
  const id = drama.id;

  // Related Content с MDL: связь направленная, показываем обе стороны.
  // Подпись у relatedTo-строки сформулирована с ТОЙ страницы («Bad Buddy
  // — Thai sequel → Our Skyy 2» значит «Our Skyy 2 — сиквел Bad Buddy»),
  // поэтому у односторонних связей (~275 из 1 077) тип разворачиваем.
  // Разворачиваем только точные пары сиквел↔приквел и основная↔побочная
  // история: у остальных типов (adaptation, original story, remake…)
  // обратная формулировка неоднозначна, и честнее оставить как есть.
  const invertRelation = (raw: string | null): string | null =>
    raw?.replace(
      /sequel|prequel|parent story|side story/,
      (m) =>
        (
          ({
            sequel: "prequel",
            prequel: "sequel",
            "parent story": "side story",
            "side story": "parent story",
          }) as Record<string, string>
        )[m] ?? m,
    ) ?? null;
  const relatedItems = [
    ...drama.relatedFrom.map((r) => ({
      drama: r.related,
      relation: r.relation,
    })),
    ...drama.relatedTo
      .filter((r) => !drama.relatedFrom.some((f) => f.relatedId === r.dramaId))
      .map((r) => ({ drama: r.drama, relation: invertRelation(r.relation) })),
  ];
  // «Смотреть по порядку» (аудит, п. 6.1): связанные сериалы плюс сам
  // текущий — одним рядом по годам, чтобы читался порядок просмотра
  // франшизы. Сериалы без года — в конец: их место в хронологии
  // неизвестно, и выдуманный «1900-й» ставил бы их первыми.
  const watchOrder =
    relatedItems.length > 0
      ? [
          ...relatedItems.map((r) => ({ ...r, current: false })),
          { drama, relation: null as string | null, current: true },
        ].sort(
          (a, b) =>
            (a.drama.year ?? Infinity) - (b.drama.year ?? Infinity) ||
            a.drama.title.localeCompare(b.drama.title),
        )
      : [];

  // Первая волна: всё, что зависит только от самого сериала, — одним
  // Promise.all вместо четырёх последовательных await.
  const [score, dramaEvents, currentUser, similarDramas, castPairings] =
    await Promise.all([
      // Оценка сайта: свои звёздочки + публичные отзывы, один человек
      // — один голос (см. src/lib/dramaRating.ts).
      fetchDramaScore(id, drama.mdlScore),
      prisma.event.findMany({
        // Только афишные события: встречу сообщества можно привязать к
        // сериалу, но на его публичной странице ей не место — там она
        // раздала бы адрес чужим (см. src/lib/catalogEvents.ts).
        where: { ...catalogEventsWhere(), dramaId: id },
        include: {
          performers: { include: { performer: true } },
          occurrences: { orderBy: { startsAt: "asc" } },
        },
      }),
      getCurrentUser(),
      // «Понравился этот — посмотрите ещё» (З4): по общему касту и жанрам;
      // сиквелы и прочий Related сюда не попадают — они выше своим блоком.
      findSimilarDramas({
        id,
        genres: drama.genres,
        tags: drama.tags,
        performerIds: drama.performers.map((pd) => pd.performerId),
        excludeIds: relatedItems.map((r) => r.drama.id),
      }),
      // АА4: пары внутри каста — чтобы поставить их рядом в сетке.
      fetchPairingsAmong(drama.performers.map((pd) => pd.performerId)),
    ]);
  const eventsRows = groupByEvent(
    dramaEvents
      .flatMap((ev) =>
        ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  );
  const events = eventsRows.map((e) => e.row);
  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);

  // Вторая волна: пользовательские отметки — ждут только currentUser и
  // результаты первой волны, между собой не связаны.
  const [
    watchStatus,
    favoritedEventIds,
    goingEventIds,
    maybeOccurrenceIds,
    similarStatuses,
    visits,
    friendStatuses,
  ] = await Promise.all([
    currentUser
      ? prisma.dramaWatchStatus.findUnique({
          where: { userId_dramaId: { userId: currentUser.id, dramaId: id } },
        })
      : null,
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
    getMaybeOccurrenceIds(occIds, currentUser?.id),
    // Кнопка статуса на карточках рекомендаций — как у сериалов на
    // странице артиста.
    getDramaWatchStatuses(
      similarDramas.map((s) => s.id),
      currentUser?.id,
    ),
    currentUser && drama.locations.length > 0
      ? prisma.locationVisit.findMany({
          where: {
            userId: currentUser.id,
            locationId: { in: drama.locations.map((dl) => dl.locationId) },
          },
          select: { locationId: true },
        })
      : [],
    // «Из ваших друзей смотрели» (аудит, п. 5.4): пересечение принятых
    // дружб зрителя со статусами этого сериала — ОДНИМ запросом, через
    // обратные связи Friendship на пользователе (дружба живёт в любую
    // сторону, поэтому OR по обеим). Свою строку не показываем — она и
    // так в шапке кнопкой статуса.
    //
    // hideProfileActivity тут фильтром не нужен НАМЕРЕННО: в блоке
    // только друзья зрителя, а мастер-выключатель прячет активность от
    // посторонних, не от друзей — то же правило, что на профиле
    // (users/[id]/page.tsx: showActivity = isSelf || isFriend || !hide).
    currentUser
      ? prisma.dramaWatchStatus.findMany({
          where: {
            dramaId: id,
            userId: { not: currentUser.id },
            user: {
              deletedAt: null,
              OR: [
                {
                  friendRequestsSent: {
                    some: { addresseeId: currentUser.id, status: "ACCEPTED" },
                  },
                },
                {
                  friendRequestsReceived: {
                    some: { requesterId: currentUser.id, status: "ACCEPTED" },
                  },
                },
              ],
            },
          },
          select: {
            status: true,
            rating: true,
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                photoUrl: true,
                deletedAt: true,
              },
            },
          },
          // Свежие отметки первыми: у кого сериал «живее», тот и ближе.
          orderBy: { updatedAt: "desc" },
        })
      : [],
  ]);
  const visitedLocationIds = new Set(visits.map((v) => v.locationId));

  // Дневник серий СКРЫТ (решение владельца 2026-09-10) — вместе с ним
  // спит и его выборка: лишний запрос на каждой странице сериала ради
  // невидимого блока не нужен. Код сохранён целиком, чтобы вернуть его
  // одним раскомментированием (см. блок в разметке ниже и roadmap).
  // Дневник серий (аудит 2026-09 §7): отметки владельца по этому
  // сериалу. Только СВОИ строки — дневник личный, и заметки не
  // показываются нигде, кроме этой страницы под своей сессией. Даты
  // форматируются здесь же, как у графика серий: клиенту уходят готовые
  // строки, чтобы дату негде было прочитать в часовом поясе браузера.
  // Запрос отдельным await, а не в общих волнах Promise.all, —
  // точечная вставка (страницу параллельно правят), а выборка по
  // первичному ключу дешёвая.
  // const episodeWatches =
  //   currentUser && watchStatus
  //     ? await prisma.episodeWatch.findMany({
  //         where: { userId: currentUser.id, dramaId: id },
  //         orderBy: { episode: "asc" },
  //       })
  //     : [];
  // const diaryYear = new Date().getUTCFullYear();
  // const diaryEntries = episodeWatches.map((w) => ({
  //   episode: w.episode,
  //   // Год — только у отметок не этого года, как в графике серий: у
  //   // свежих он повторялся бы в каждой строке впустую.
  //   dateLabel:
  //     w.watchedAt.getUTCFullYear() === diaryYear
  //       ? formatShortDate(w.watchedAt, locale)
  //       : formatDateWithYear(w.watchedAt, locale),
  //   note: w.note ?? "",
  // }));
  // Строки дневника: 1..N при известном числе серий; если оно
  // неизвестно — по факту отмеченного плюс одна следующая строка, чтобы
  // дневник было с чего начать и чем продолжить.
  // const diaryCount =
  //   drama.episodes ?? (episodeWatches.at(-1)?.episode ?? 0) + 1;
  // const diaryEpisodes = Array.from({ length: diaryCount }, (_, i) => i + 1);

  // У сериала может быть несколько студий (DramaAgency); легаси-поле
  // agency подставляется, если связей ещё нет.
  const studios =
    drama.agencies.length > 0
      ? drama.agencies.map((a) => a.agency)
      : drama.agency
        ? [drama.agency]
        : [];
  // Все строки блока фактов условные — пустую панель не рисуем.
  const hasFacts =
    studios.length > 0 ||
    !!drama.novel ||
    drama.genres.length > 0 ||
    !!drama.episodes ||
    !!drama.duration ||
    !!drama.airedFrom ||
    !!drama.contentRating ||
    score.site != null ||
    drama.mdlScore != null ||
    // Вошедшему колонка нужна всегда: наверху неё стоят его звёзды.
    !!currentUser ||
    !!drama.synopsis ||
    // График живёт внутри этой же колонки (свёрнут под строкой «Эфир»),
    // поэтому одного расписания достаточно, чтобы колонку нарисовать.
    drama.episodeList.length > 0;

  // Э2ф: каст сортируем по популярности — числу событий у актёра
  // (чем больше фан-митингов/концертов, тем он заметнее), при равенстве
  // по имени. Первые ~14 видимых в сетке — самые популярные.
  // Поверх этого — два общих правила списка исполнителей (см.
  // src/lib/castLineup.ts): участники группы, которая и сама в касте, из
  // списка уходят (АА14), а пары встают рядом и в порядке пейринга (АА4).
  //
  // `pairsFirst` — только на странице сериала (правка владельца
  // 2026-09-10): каст должен открываться парами, ради которых сериал и
  // смотрят, а не самым «событийным» актёром второго плана.
  const castSorted = keepPairingsTogether(
    hideMembersOfListedBands(
      [...drama.performers].sort(
        (a, b) =>
          b.performer._count.events - a.performer._count.events ||
          a.performer.name.localeCompare(b.performer.name),
      ),
      (pd) => pd.performer.id,
      (pd) => pd.performer.bandMembers.map((bm) => bm.performerId),
    ),
    (pd) => pd.performer.id,
    castPairings,
    { pairsFirst: true },
  );

  // График выхода серий. «Сегодня» и «уже вышла» сравниваем ключами дат
  // (YYYY-MM-DD), а не моментами: даты эфира лежат тайским настенным
  // временем, и сравнение с `new Date()` врало бы ровно на границе суток.
  const today = startOfDay(new Date());
  const todayKey = dateKey(today);
  // Год в строке — только когда расписание не про текущий год: у
  // выходящего сериала он повторялся бы в каждой строке впустую, а у
  // прошлогоднего (или у переходящего через Новый год) без него «3 янв»
  // не отличить от начала сезона. Дату с годом собирает
  // formatCombinedDateList, а не formatDateWithYear: второй по-русски
  // оставляет висящее «г» без точки, и в столбце дат это видно сразу.
  const scheduleYears = new Set(
    drama.episodeList.flatMap((e) =>
      e.airDate ? [e.airDate.getUTCFullYear()] : [],
    ),
  );
  const showYear =
    scheduleYears.size > 1 || !scheduleYears.has(today.getUTCFullYear());
  const episodeRows = drama.episodeList.map((e) => ({
    number: e.number,
    title: e.title,
    dateLabel: e.airDate
      ? showYear
        ? formatCombinedDateList([e.airDate], locale)
        : formatShortDate(e.airDate, locale)
      : null,
    aired: !!e.airDate && dateKey(e.airDate) <= todayKey,
    isToday: !!e.airDate && dateKey(e.airDate) === todayKey,
  }));
  const airedCount = episodeRows.filter((r) => r.aired).length;

  // Таймер до следующей серии под постером (просьба владельца
  // 2026-09-07: «сколько дней осталось для тех сериалов, что выходят
  // сейчас»). Показываем только там, где он что-то значит: сериал
  // выходит И у ближайшей будущей серии уже объявлена дата. У
  // завершённого считать нечего, а у выходящего хвост расписания часто
  // пустой (даты подвозит суточная mdl-auto-update) — в этом случае
  // блока нет вовсе, «—» и «дата неизвестна» здесь были бы шумом.
  //
  // Дни считаются НА СЕРВЕРЕ, и это безопасно: страница объявлена
  // force-dynamic (см. верх файла), CDN перед приложением нет и
  // Cache-Control страницам не выставляется (next.config.ts) — разметка
  // собирается на каждый запрос, застрять на сутки числу негде. Клиент
  // тут был бы хуже: до гидратации блок либо пустой, либо мигает.
  //
  // Разница — календарная, а не «сколько прошло часов»: обе даты
  // приводятся к UTC-полуночи (dateKey/parseDateKey), как и признак
  // «уже вышло» выше. Даты эфира лежат тайским настенным временем, и
  // вычитание моментов давало бы 0 или 2 дня там, где на календаре 1.
  const nextEpisode = (() => {
    if (drama.status !== "RETURNING_SERIES") return null;
    const next = drama.episodeList.find(
      (e) => e.airDate && dateKey(e.airDate) >= todayKey,
    );
    if (!next?.airDate) return null;
    // В один день выходит СРАЗУ НЕСКОЛЬКО серий — у тайских сериалов это
    // норма (двойные премьеры по выходным). Берём все с той же датой, а
    // не первую попавшуюся: плашка писала «5 серия сегодня», хотя
    // сегодня выходят пятая и шестая (замечено владельцем 2026-09-11).
    const nextKey = dateKey(next.airDate);
    const numbers = drama.episodeList
      .filter((e) => e.airDate && dateKey(e.airDate) === nextKey)
      .map((e) => e.number);
    const days = Math.round(
      (parseDateKey(nextKey).getTime() - today.getTime()) / 86_400_000,
    );
    return { numbers, days };
  })();

  // Строка «Эфир: 29 июл. 2026 (по четвергам)». Собрана отдельным
  // фрагментом, потому что она же служит переключателем графика: внутри
  // <summary> абзац недопустим, там разрешено только фразовое содержимое.
  // Только даты, без иконки и подписи: их даёт колонка подписей в
  // сетке фактов (см. .drama-facts).
  const airedLine = drama.airedFrom ? (
    <>
      {formatDateWithYear(drama.airedFrom, locale)}
      {drama.airedTo && drama.airedTo.getTime() !== drama.airedFrom.getTime()
        ? ` — ${formatDateWithYear(drama.airedTo, locale)}`
        : ""}
      {drama.airedOn
        ? ` (${t.catalog.airedOn[drama.airedOn as keyof typeof t.catalog.airedOn] ?? drama.airedOn})`
        : ""}
    </>
  ) : null;

  return (
    <div>
      <BackLink fallbackHref="/dramas" fallbackLabel={t.catalog.drama.back} />
      {/* Классическая шапка (по просьбе владельца): постер слева,
          заголовок и статус сверху — без размытого hero. */}
      {/* Без flex-wrap: с ним длинная строка альтернативных названий
          уносила кнопку статуса под текст. Колонка текста сжимается
          (minWidth: 0) и переносит строки внутри себя, кнопка-кружок
          остаётся справа сверху на любой ширине — на мобильном ей тоже
          хватает места рядом с заголовком. */}
      <div className="d-flex align-items-start justify-content-between gap-3 mt-2 mb-4">
        <div style={{ minWidth: 0 }}>
          {/* Год в скобках и цветной статус — в строке с названием
              (просьба владельца); чип «серий» убран, число эпизодов и
              так есть в фактах. */}
          {/* Бейдж статуса стоит РЯДОМ с заголовком, а не внутри него.
              Внутри он попадал в текст h1, и поиск склеивал его с
              названием: в выдаче Google было «Till the World Ends
              (2022)Завершён — MyBLHub», ещё и без пробела. Год внутри
              оставлен намеренно — он часть имени тайтла и в заголовке
              выдачи уместен. */}
          <div className="d-flex flex-wrap align-items-baseline gap-2 mb-1">
            <h1
              className="display-1-tight mb-0"
              style={{ fontSize: "2.25rem" }}
            >
              {dramaTitleForLocale(drama, locale)}
              {drama.year && (
                <span className="fs-5 fw-normal text-secondary">
                  {" "}
                  ({drama.year})
                </span>
              )}
            </h1>
            {drama.status && (
              <span
                className={`badge rounded-pill fw-semibold ${DRAMA_STATUS_BADGE_CLASS[drama.status]}`}
                style={{ fontSize: "0.8rem" }}
              >
                {t.catalog.dramaStatus[drama.status]}
              </span>
            )}
          </div>
          {/* Когда заголовок русский, английское название уходит в
              строку альтернативных — искать сериал продолжают по нему. */}
          {(drama.nativeTitle ||
            drama.alsoKnownAs ||
            dramaTitleForLocale(drama, locale) !== drama.title) && (
            <p className="small text-secondary mb-0">
              {[
                dramaTitleForLocale(drama, locale) !== drama.title
                  ? drama.title
                  : null,
                drama.nativeTitle,
                drama.alsoKnownAs,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {currentUser && (
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {/* Обычно тут только колокольчик серий: кнопка статуса
                уехала под постер широкой подписанной кнопкой —
                маленький «+» тут не находили. Но у записи без постера
                колонки под ним нет вовсе, и тогда иконка возвращается
                сюда: остаться совсем без кнопки статуса страница не
                может. */}
            <EpisodeBellButton
              dramaId={drama.id}
              enabled={watchStatus?.notifyEpisodes ?? false}
            />
            {!drama.posterUrl && (
              <DramaStatusButton
                dramaId={drama.id}
                status={watchStatus?.status ?? null}
              />
            )}
          </div>
        )}
      </div>

      {/* Э2ф: страница длинная — якорные чипы к ключевым секциям, чтобы
          важное не требовало слепого скролла. Один чип «Отзывы» без
          компании смысла не имеет — ряд рисуем от двух. */}

      {/* Постер слева + факты и синопсис справа — самым верхом
          (требование владельца): то, что смотрят первым. */}
      <div className="d-flex flex-column flex-sm-row gap-4 mb-4">
        {drama.posterUrl && (
          <div className="flex-shrink-0 d-flex flex-column gap-2">
            <UploadImage
              loading="eager"
              blur
              src={drama.posterUrl}
              alt={dramaTitleForLocale(drama, locale)}
              sizes="15rem"
              className="rounded-4"
              style={{
                width: "15rem",
                aspectRatio: "2 / 3",
                objectFit: "cover",
              }}
            />
            {/* Отсчёт до следующей серии — сразу под постером (просьба
                владельца 2026-09-07). Крупно и акцентом: сначала сам
                остаток («3 дня»), под ним тихая подпись, чего ждём.
                Первая версия была неброским чипом в строку — владелец
                попросила «сильно больше и визуальнее»: это единственное
                на странице, что меняется само по себе, ради него и
                возвращаются. */}
            {nextEpisode && (
              <div className="next-episode">
                {/* Постер размытым фоном — тем же приёмом, что hero
                    новеллы (.detail-hero-backdrop): плоская заливка
                    выглядела скучно (правка владельца 2026-09-07).
                    Зерно поверх даёт общий слой body::after, свой тут не
                    нужен. */}
                {drama.posterUrl && (
                  <span className="next-episode-backdrop" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={drama.posterUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                )}
                <span className="next-episode-scrim" aria-hidden />
                <span className="next-episode-body">
                  {/* Пульсирующая точка: говорит «идёт прямо сейчас»
                      быстрее любой подписи. */}
                  {/* Номер серии сразу в надзаголовке — «10 серия
                      через» (правка владельца 2026-09-07): отдельная
                      строка под сроком повторяла то же самое двумя
                      кусками. */}
                  <span className="next-episode-eyebrow">
                    {t.catalog.drama.schedule.nextEpisodeTitle(
                      nextEpisode.numbers,
                      nextEpisode.days,
                    )}
                  </span>
                  {/* Пульсирующая точка стоит у самого срока (правка
                      владельца 2026-09-07): она про то, что до серии
                      осталось всего ничего, а не про подпись сверху. */}
                  <span className="next-episode-value">
                    <span className="next-episode-dot" aria-hidden />
                    {t.catalog.drama.schedule.nextEpisodeLeft(nextEpisode.days)}
                  </span>
                </span>
              </div>
            )}
            {/* Статус просмотра — ШИРОКОЙ подписанной кнопкой под
                постером (фидбек пользователя 2026-09-10: «я сломала
                себе глаза, чтобы найти кнопку, через которую можно
                поставить статус, этот маленький плюсик лучше
                превратить в кнопки»). Иконка «+» в шапке страницы
                убрана — двух кнопок для одного и того же на экране
                быть не должно; в списках и фильмографиях иконка
                остаётся, там подписи негде взяться. */}
            {currentUser && (
              <DramaStatusButton
                dramaId={drama.id}
                status={watchStatus?.status ?? null}
                variant="wide"
              />
            )}
            {/* Кнопки «MyDramaList ↗» тут больше нет (правка владельца
                2026-09-07): ссылка на источник и так стоит внизу
                страницы, в блоке «Источники», а под постером она
                отправляла человека с нашей страницы на чужую. */}
          </div>
        )}
        {/* Без фона-карточки (фидбек владельца): факты и описание —
            просто текст в правой колонке, как у артиста. */}
        {hasFacts && (
          <div
            className="flex-fill d-flex flex-column gap-1"
            style={{ minWidth: 0 }}
          >
            {/* ВСЕ факты — одним списком с одинаковым отступом (правка
              владельца 2026-09-07: «поля с описаниями выглядят криво…
              надо всё выровнять»). Раньше каждая строка была
              самостоятельным абзацем со своим mb-2, часть строк жила во
              вложенном блоке со своим gap, а строка жанров с чипами
              оказывалась выше соседних — промежуток вокруг неё выглядел
              вдвое больше. Теперь отступ один на все строки, а чипы
              прижаты отрицательным полем, чтобы не растить строку.
              Компонент Fact — ниже в этом файле. */}
            <div className="drama-facts small mb-3">
              {currentUser && (
                <Fact label={t.catalog.drama.myScore}>
                  <DramaRating
                    dramaId={drama.id}
                    rating={watchStatus?.rating ?? null}
                    hideLabel
                  />
                </Fact>
              )}
              {/* Своя оценка сайта и оценка MyDramaList — РАЗНЫЕ строки
                (правка владельца 2026-09-07). Сводить их в одно число
                оказалось затеей неудачной: чей это рейтинг, из подписи
                не понять, а вес чужих тысяч голосов приходилось
                выдумывать. Теперь наш рейтинг считается только по нашим
                оценкам, рядом — сколько человек проголосовало. */}
              {score.site != null && (
                <Fact label={t.catalog.drama.ourScore}>
                  <StarIcon className="rating-star" filled />{" "}
                  <span style={{ color: ratingColor(score.site) }}>
                    {score.site.toFixed(1)}
                  </span>{" "}
                  <span className="drama-fact-votes">({score.siteCount})</span>
                </Fact>
              )}
              {/* У MyDramaList цифра обычным цветом строки (правка
                владельца 2026-09-07): цветная шкала — про НАШУ оценку,
                чужая стоит рядом просто как справка. */}
              {score.mdl != null && (
                <Fact label={t.catalog.drama.mdlScore}>
                  <StarIcon filled /> {score.mdl.toFixed(1)}
                </Fact>
              )}

              {studios.length > 0 && (
                <Fact
                  icon={<BuildingIcon />}
                  label={
                    studios.length > 1
                      ? t.catalog.drama.studios
                      : t.catalog.drama.studio
                  }
                >
                  {studios.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ", "}
                      <AppLink href={agencyHref(a)}>{a.name}</AppLink>
                    </span>
                  ))}
                </Fact>
              )}

              {drama.novel && (
                <Fact
                  icon={<BookIcon className="icon-inline" />}
                  label={t.catalog.drama.basedOn}
                >
                  <AppLink href={novelHref(drama.novel)}>
                    {drama.novel.title}
                  </AppLink>
                  {drama.novel.author ? ` (${drama.novel.author})` : ""}
                </Fact>
              )}

              {/* Жанр — вход в поиск с этим жанром в фильтре (И1): раньше
                чипы были глухие, и «ещё такое же» приходилось собирать
                руками. */}
              {drama.genres.length > 0 && (
                <Fact icon={<TagIcon />} label={t.catalog.drama.genres}>
                  <span className="drama-facts-chips">
                    {drama.genres.map((g) => (
                      <AppLink
                        key={g}
                        href={`/search?section=dramas&genres=${encodeURIComponent(g)}`}
                        className="tag-chip text-decoration-none"
                      >
                        {/* Значение в ссылке — сырое (по нему ищет
                            каталог), на экране — словарное (см.
                            fromDict в i18n/ru/catalog.ts). */}
                        {contentDict.genre(g)}
                      </AppLink>
                    ))}
                  </span>
                </Fact>
              )}

              {/* Теги — обычным текстом в цвет .tag-chip, короткой строкой
                со свёрткой «ещё N» (просьба владельца): у MDL тегов
                десятки, и чипы раздували карточку на пол-экрана. Первые
                TAGS_VISIBLE рендерит сервер — без замеров и мигания. */}
              {drama.tags.length > 0 && (
                <Fact icon={<TagIcon />} label={t.catalog.drama.tags}>
                  <TagRowFold
                    moreLabel={t.catalog.tagsShowAll(
                      drama.tags.length - TAGS_VISIBLE,
                    )}
                    visible={drama.tags.slice(0, TAGS_VISIBLE).map((tag) => (
                      <AppLink
                        key={tag}
                        href={`/search?section=dramas&tags=${encodeURIComponent(tag)}`}
                        className="tag-link"
                      >
                        {tag}
                      </AppLink>
                    ))}
                    rest={
                      drama.tags.length > TAGS_VISIBLE
                        ? drama.tags.slice(TAGS_VISIBLE).map((tag) => (
                            <AppLink
                              key={tag}
                              href={`/search?section=dramas&tags=${encodeURIComponent(tag)}`}
                              className="tag-link"
                            >
                              {tag}
                            </AppLink>
                          ))
                        : null
                    }
                  />
                </Fact>
              )}

              {/* Страна и тип (И4) — значения из данных, не переводятся;
                каждое ведёт в поиск с этим фильтром: фильтры появились в
                И1, и «ещё такое же» в одном клике. Раньше они делили
                одну строку через «·» — в сетке у каждого своя строка,
                иначе значения не встают в колонку. */}
              {drama.country && (
                <Fact icon={<PinIcon />} label={t.catalog.drama.country}>
                  <AppLink
                    href={`/search?section=dramas&country=${encodeURIComponent(drama.country)}`}
                  >
                    {drama.country}
                  </AppLink>
                </Fact>
              )}
              {drama.type && (
                <Fact icon={<GridIcon />} label={t.catalog.drama.type}>
                  <AppLink
                    href={`/search?section=dramas&type=${encodeURIComponent(drama.type)}`}
                  >
                    {drama.type}
                  </AppLink>
                </Fact>
              )}

              {(drama.episodes || drama.duration) && (
                <Fact
                  icon={<TvIcon className="icon-inline" />}
                  label={t.catalog.drama.episodes}
                >
                  {drama.episodes ? `${drama.episodes}` : "?"}
                  {drama.duration ? ` × ${drama.duration}` : ""}
                </Fact>
              )}

              {/* График выхода серий свёрнут под строку «Эфир» (просьба
                владельца): в конце строки — «Подробнее», по нему
                раскрывается поимённый список серий. Свёртка нативная,
                на details/summary: график — не текст, мерить нечего,
                клиентский код тут не нужен вовсе, а состояние
                (свёрнуто/раскрыто) и работа с клавиатуры достаются от
                самого summary. Расписания нет — нет и переключателя,
                остаётся обычная строка. */}
              {/* График — НЕ внутри Fact: там значение стоит справа от
                подписи, и раскрытый список серий уезжал вправо вместе с
                ним (жалоба владельца 2026-09-07: «сместился, нужно
                выравнивать по левому краю как раньше»). Поэтому подпись
                уходит внутрь summary, а сама свёртка занимает всю
                ширину строки. */}
              {episodeRows.length > 0 ? (
                <details className="schedule-fold drama-fact-block text-secondary">
                  <summary>
                    <CalendarIcon />{" "}
                    <span className="drama-fact-label">
                      {t.catalog.drama.aired}
                    </span>{" "}
                    {airedLine ?? t.catalog.drama.schedule.title}{" "}
                    <span className="schedule-fold-toggle">
                      <span className="schedule-fold-more">
                        {t.catalog.drama.schedule.more}
                      </span>
                      <span className="schedule-fold-less">
                        {t.catalog.drama.schedule.hide}
                      </span>
                      <span className="schedule-fold-caret" aria-hidden>
                        ▾
                      </span>
                    </span>
                  </summary>
                  {/* Ширина ограничена: на широком экране номер серии и
                      дата иначе разъезжаются по краям колонки. */}
                  <div className="schedule-fold-body">
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
                      <span className="text-white">
                        {t.catalog.drama.schedule.title}
                      </span>
                      <span>
                        {t.catalog.drama.schedule.aired(
                          airedCount,
                          episodeRows.length,
                        )}
                      </span>
                    </div>
                    <EpisodeSchedule rows={episodeRows} />
                  </div>
                </details>
              ) : (
                airedLine && (
                  <Fact icon={<CalendarIcon />} label={t.catalog.drama.aired}>
                    {airedLine}
                  </Fact>
                )
              )}

              {drama.contentRating && (
                <Fact icon={<InfoIcon />} label={t.catalog.drama.contentRating}>
                  {drama.contentRating}
                </Fact>
              )}
            </div>

            {/* Ж6: счётчик серий — прямо над описанием, где человек и
              так задерживается. Появляется, только когда сериал уже
              отмечен: у того, что человек не смотрит, прогресс ничего
              не значит. */}
            {currentUser && watchStatus && (
              <div className="mb-3">
                <EpisodeProgress
                  dramaId={drama.id}
                  total={drama.episodes}
                  // Через episodeProgress, а не сырое поле: у «Просмотрено»
                  // счётчик бывает пустым (статус ставили до подсчёта
                  // серий), и сырой NULL показывал 0 из 10 у досмотренного.
                  watched={
                    episodeProgress(watchStatus, drama.episodes)?.watched ??
                    null
                  }
                />
                {/* Пересмотры — только у досмотренного (или у того, где
                  их уже отмечали): тому, кто смотрит сериал впервые,
                  кнопка «ещё раз» ничего не даёт и только шумит рядом
                  со счётчиком серий. */}
                {(watchStatus.status === "COMPLETED" ||
                  watchStatus.rewatchCount > 0) && (
                  <div className="mt-2">
                    <RewatchCounter
                      dramaId={drama.id}
                      count={watchStatus.rewatchCount}
                      status={watchStatus.status}
                    />
                  </div>
                )}
                {/* Дневник серий СКРЫТ (решение владельца 2026-09-10:
                    «пока прячем, пометь в туду»). Код цел и рабочий —
                    компонент, экшены (episodeActions.ts), таблица
                    EpisodeWatch и строки словарей на месте; чтобы
                    вернуть, достаточно раскомментировать этот блок.
                    Данных он не теряет: у кого отметки уже стоят, те
                    так и лежат в базе. См. docs/roadmap.md.
                <div className="mt-2">
                  <EpisodeDiary
                    dramaId={drama.id}
                    episodes={diaryEpisodes}
                    entries={diaryEntries}
                    todayLabel={formatShortDate(new Date(), locale)}
                  />
                </div>
                */}
              </div>
            )}

            {/* Длинный синопсис свёрнут до ~4 строк (Э2ф); SynopsisFold
              меряет реальное переполнение и не показывает «Читать
              дальше», когда текст влез целиком. Короткий рендерим
              обычным абзацем без клиентского кода. */}
            {(() => {
              const synopsis = dramaSynopsisForLocale(drama, locale);
              if (!synopsis) return null;
              // pre-line: русские описания с dorama.land многоабзацные,
              // без него переносы схлопывались в сплошной текст.
              return synopsis.length > 300 ? (
                <SynopsisFold text={synopsis} preLine />
              ) : (
                <p
                  className="text-secondary mb-0"
                  style={{ whiteSpace: "pre-line" }}
                >
                  {synopsis}
                </p>
              );
            })()}
          </div>
        )}
      </div>

      {/* Каст — СРАЗУ ПОД описанием (правка владельца 2026-09-10:
          «состав должен быть после описания», и опускать его ниже
          нельзя — это почти самое важное на странице). Раньше он стоял
          после «смотреть по порядку» и списка друзей.
          Адаптивной фото-сеткой (Э2ф) вместо ряда одинаковых плашек;
          первые ~14, остальные за «Показать всех». Пустой раздел не
          рисуем — ни заголовка, ни «состав не указан». */}
      {castSorted.length > 0 && (
        <div id="cast" className="anchor-target mb-4">
          <h2 className="section-heading mb-3">{t.catalog.drama.cast}</h2>
          {/* Капсулы вместо фото-сетки: сетка выходила гигантской
              (фидбек владельца). Роль — подписью в капсуле. */}
          <CastGrid chips limit={18}>
            {castSorted.map(({ performer, role }) => (
              <EntityMiniCard
                key={performer.id}
                href={performerHref(performer)}
                photoUrl={performer.photoUrl}
                name={performer.name}
                subtitle={role}
              />
            ))}
          </CastGrid>
        </div>
      )}

      {watchOrder.length > 0 && (
        <div className="mb-4">
          <h2 className="section-heading mb-2">{t.catalog.drama.watchOrder}</h2>
          <div className="d-flex flex-wrap gap-2">
            {watchOrder.map(({ drama: rel, relation, current }) => (
              <EntityMiniCard
                key={rel.id}
                href={dramaHref(rel)}
                photoUrl={rel.posterUrl}
                name={dramaTitleForLocale(rel, locale)}
                subtitle={
                  [
                    rel.year,
                    current
                      ? t.catalog.drama.watchOrderCurrent
                      : relation
                        ? t.catalog.drama.relationLabel(relation)
                        : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null
                }
                round={false}
                style={
                  current
                    ? {
                        width: "11rem",
                        borderColor: "rgba(var(--accent-rgb), 0.55)",
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Стоит ПОД «смотреть по порядку» (правка владельца
          2026-09-10): сначала сериал и его вселенная, потом люди. */}
      {/* «Друзья отметили» (аудит, п. 5.4): аватарка, имя, статус и
          оценка каждого друга, у кого этот сериал отмечен. Только для
          залогиненного, пустой блок не рисуем; гость и человек без
          друзей разницы не заметят. Карточка — та же EntityMiniCard,
          что и у каста ниже: подпись строкой «статус · ★ оценка»,
          ссылка ведёт на профиль друга. */}
      {friendStatuses.length > 0 && (
        <div className="mb-4">
          <h2 className="section-heading mb-2">
            {t.catalog.drama.friendsWatched}
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {friendStatuses.map((fs) => (
              <EntityMiniCard
                key={fs.user.id}
                href={userHref(fs.user)}
                photoUrl={fs.user.photoUrl}
                name={userDisplayName(fs.user, locale)}
                subtitle={
                  t.catalog.watchStatus[fs.status] +
                  (fs.rating != null ? ` · ★ ${fs.rating}` : "")
                }
                // Ширина не фиксированная, а минимальная: в 13rem
                // подпись «Смотрю сейчас · ★ 9» не влезала и оценка
                // обрезалась многоточием (правка владельца 2026-09-10).
                // Потолок — чтобы длинное имя не растянуло карточку
                // через полстраницы.
                style={{ minWidth: "13rem", maxWidth: "18rem" }}
              />
            ))}
          </div>
        </div>
      )}

      {/* События сериала — ниже каста и связанных (просьба
          владельца): фан-митинги/премьеры. */}
      {events.length > 0 && (
        <div id="events" className="anchor-target mb-4">
          <h2 className="section-heading mb-2">{t.catalog.drama.events}</h2>
          <div className="d-flex flex-column gap-3">
            {eventsRows.map(({ row, extraDates }) =>
              isPremiumActive(currentUser) ? (
                <EventAgendaRow
                  key={row.id}
                  event={row}
                  isFavorited={favoritedEventIds.has(row.id)}
                  isGoing={goingEventIds.has(row.occurrenceId)}
                  isMaybe={maybeOccurrenceIds.has(row.occurrenceId)}
                  showDate
                  extraDates={extraDates}
                />
              ) : (
                <EventCardLocked key={row.id} startsAt={row.startsAt} />
              ),
            )}
          </div>
        </div>
      )}

      {drama.locations.length > 0 && (
        <div id="locations" className="anchor-target mb-4">
          <h2 className="section-heading mb-2">{t.catalog.drama.locations}</h2>
          <div className="d-flex flex-column gap-2">
            {drama.locations.map(({ location }) => (
              <div
                key={location.id}
                className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <AppLink
                  href={locationHref(location)}
                  className="text-decoration-none d-flex align-items-center gap-3"
                  style={{ minWidth: 0 }}
                >
                  <div
                    style={{
                      width: "2.5rem",
                      height: "2.5rem",
                      borderRadius: "0.5rem",
                      background: "var(--bs-secondary-bg)",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    {location.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={location.photoUrl}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    )}
                  </div>
                  <span className="font-display fw-medium text-white text-truncate">
                    {location.name}
                  </span>
                </AppLink>
                <VisitedButton
                  locationId={location.id}
                  isVisited={visitedLocationIds.has(location.id)}
                  className="flex-shrink-0"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div id="reviews" className="anchor-target mt-4">
        <ReviewsAndComments kind="drama" id={drama.id} />
      </div>

      {/* «Вам может понравиться» (З4) — в самом низу, после отзывов
          (просьба владельца): дочитал страницу — вот куда идти дальше.
          Карточки как у сериалов на странице артиста (постер 2:3,
          название, год, кнопка статуса), но сеткой на всю ширину, без
          горизонтального скролла: шесть штук и так помещаются. Причину
          рекомендации не показываем — тоже просьба владельца. */}
      {similarDramas.length > 0 && (
        <div className="mt-5">
          <h2 className="section-heading mb-3">{t.catalog.drama.similar}</h2>
          <div className="row g-3">
            {similarDramas.map((sim) => (
              <div key={sim.id} className="col-4 col-md-2">
                <div style={{ position: "relative" }}>
                  <AppLink
                    href={dramaHref(sim)}
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
                      {sim.posterUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          loading="lazy"
                          decoding="async"
                          src={sim.posterUrl}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      )}
                    </div>
                    <p
                      className="small text-white mb-0 mt-2"
                      style={{ lineHeight: 1.3 }}
                    >
                      {dramaTitleForLocale(sim, locale)}
                    </p>
                    {sim.year && (
                      <p className="small text-secondary mb-0">{sim.year}</p>
                    )}
                  </AppLink>
                  <div
                    className="position-absolute"
                    style={{ top: "0.375rem", right: "0.375rem" }}
                  >
                    <DramaStatusButton
                      dramaId={sim.id}
                      status={similarStatuses.get(sim.id)?.status ?? null}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Атрибуция — ВСЕГДА самым нижним блоком страницы (просьба
          владельца), после отзывов и рекомендаций.
          Постер/синопсис пришли с MDL и blscene, русские
          название и описание — с dorama.land (см. /terms: источники
          обещаны на страницах записей). Подписи строк — hostname из
          ссылки, doramalandUrl есть только у сериалов с переводом. */}
      <SourcesBlock
        links={[
          { url: drama.mydramalistUrl },
          { url: drama.blsceneUrl },
          { url: drama.doramalandUrl },
        ]}
      />
      <JsonLd
        data={tvSeriesJsonLd({
          ...drama,
          // Разметка повторяет видимую страницу: на /ru — русские
          // название и описание, если они есть.
          title: dramaTitleForLocale(drama, locale),
          synopsis: dramaSynopsisForLocale(drama, locale),
        })}
      />
      {/* Крошки: ступень раздела повторяет ссылку-возврат вверху
          страницы (адрес и подпись), последняя ступень — сама запись. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: t.catalog.breadcrumb.home, path: "/" },
            { name: t.catalog.breadcrumb.dramas, path: "/dramas" },
            {
              name: dramaTitleForLocale(drama, locale),
              // По слагу, как canonical выше: крошка с легаси-id
              // расходилась бы с каноническим адресом страницы.
              path: `/dramas/${drama.slug ?? drama.id}`,
            },
          ],
          locale,
        )}
      />
    </div>
  );
}
