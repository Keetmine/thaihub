import UploadImage from "@/components/UploadImage";
import { pageMetadata, JsonLd, tvSeriesJsonLd } from "@/lib/seo";
import ReviewsAndComments from "@/components/ReviewsAndComments";
import SourcesBlock from "@/components/SourcesBlock";
import AppLink from "@/components/AppLink";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import DramaStatusButton from "@/components/DramaStatusButton";
import EpisodeProgress from "@/components/EpisodeProgress";
import { episodeProgress } from "@/lib/watchStatus";
import { dramaSynopsisForLocale, dramaTitleForLocale } from "@/lib/dramaLocale";
import { findSimilarDramas } from "@/lib/similarDramas";
import EpisodeBellButton from "./EpisodeBellButton";
import EpisodeSchedule from "@/components/EpisodeSchedule";
import EntityMiniCard from "@/components/EntityMiniCard";
import CastGrid from "@/components/CastGrid";
import SynopsisFold from "@/components/SynopsisFold";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import VisitedButton from "@/components/VisitedButton";
import { PinIcon,
  BuildingIcon,
  BookIcon,
  CalendarIcon,
  TagIcon,
  TvIcon,
  UserIcon,
  InfoIcon,
} from "@/components/icons";
import {
  getDramaWatchStatuses,
  getFavoritedEventIds,
  getGoingOccurrenceIds,
} from "@/lib/favorites";
import { flattenOccurrence, groupByEvent } from "@/lib/eventOccurrences";
import { DRAMA_STATUS_BADGE_CLASS } from "@/lib/dramaStatus";
import { performerHref } from "@/lib/performerSlug";
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
  startOfDay,
} from "@/lib/dates";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const { t, locale } = await getT();
  const drama = await prisma.drama.findFirst({
    where: slugOrIdWhere(rawId),
    select: { title: true, titleRu: true, year: true, synopsis: true, synopsisRu: true, posterUrl: true },
  });
  if (!drama)
    return pageMetadata({
      title: t.catalog.drama.metaTitle,
      description: t.catalog.drama.metaNotFound,
    });
  return pageMetadata({
    title: `${dramaTitleForLocale(drama, locale)}${drama.year ? ` (${drama.year})` : ""}`,
    description:
      dramaSynopsisForLocale(drama, locale)?.slice(0, 160) ??
      t.catalog.drama.metaDescription(dramaTitleForLocale(drama, locale)),
    path: `/dramas/${rawId}`,
    image: drama.posterUrl,
    type: "article",
  });
}

export default async function DramaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const { locale, t } = await getT();

  const drama = await prisma.drama.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      // _count.events — маркер популярности актёра для сортировки каста
      // (EventPerformer.performerId проиндексирован, счётчик дёшев).
      performers: {
        include: {
          performer: {
            include: { _count: { select: { events: true } } },
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
  });

  if (!drama) notFound();

  // Средняя оценка из наших отзывов — в шапку, рядом с MDL.
  const ratingAgg = await prisma.review.aggregate({
    where: { dramaId: drama.id },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const ourRating = ratingAgg._count.rating > 0 ? ratingAgg._avg.rating : null;
  const ourRatingCount = ratingAgg._count.rating;
  const id = drama.id;

  const dramaEvents = await prisma.event.findMany({
    where: { dramaId: id },
    include: {
      performers: { include: { performer: true } },
      occurrences: { orderBy: { startsAt: "asc" } },
    },
  });
  const eventsRows = groupByEvent(
    dramaEvents
      .flatMap((ev) =>
        ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  );
  const events = eventsRows.map((e) => e.row);

  const currentUser = await getCurrentUser();
  let watchStatus = null as Awaited<
    ReturnType<typeof prisma.dramaWatchStatus.findUnique>
  >;
  if (currentUser) {
    watchStatus = await prisma.dramaWatchStatus.findUnique({
      where: { userId_dramaId: { userId: currentUser.id, dramaId: id } },
    });
  }

  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);
  const [favoritedEventIds, goingEventIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
  ]);

  // Related Content с MDL: связь направленная, показываем обе стороны.
  const relatedItems = [
    ...drama.relatedFrom.map((r) => ({
      drama: r.related,
      relation: r.relation,
    })),
    ...drama.relatedTo
      .filter((r) => !drama.relatedFrom.some((f) => f.relatedId === r.dramaId))
      .map((r) => ({ drama: r.drama, relation: r.relation })),
  ];

  // «Понравился этот — посмотрите ещё» (З4): по общему касту и жанрам;
  // сиквелы и прочий Related сюда не попадают — они выше своим блоком.
  const similarDramas = await findSimilarDramas({
    id: drama.id,
    genres: drama.genres,
    tags: drama.tags,
    performerIds: drama.performers.map((pd) => pd.performerId),
    excludeIds: relatedItems.map((r) => r.drama.id),
  });
  // Кнопка статуса на карточках рекомендаций — как у сериалов на
  // странице артиста.
  const similarStatuses = await getDramaWatchStatuses(
    similarDramas.map((s) => s.id),
    currentUser?.id,
  );

  const visitedLocationIds = new Set<string>();
  if (currentUser && drama.locations.length > 0) {
    const visits = await prisma.locationVisit.findMany({
      where: {
        userId: currentUser.id,
        locationId: { in: drama.locations.map((dl) => dl.locationId) },
      },
      select: { locationId: true },
    });
    for (const v of visits) visitedLocationIds.add(v.locationId);
  }

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
    !!drama.director ||
    !!drama.screenwriter ||
    !!drama.contentRating ||
    drama.mdlScore != null ||
    ourRating != null ||
    !!drama.synopsis ||
    // График живёт внутри этой же колонки (свёрнут под строкой «Эфир»),
    // поэтому одного расписания достаточно, чтобы колонку нарисовать.
    drama.episodeList.length > 0;

  // Э2ф: каст сортируем по популярности — числу событий у актёра
  // (чем больше фан-митингов/концертов, тем он заметнее), при равенстве
  // по имени. Первые ~14 видимых в сетке — самые популярные.
  const castSorted = [...drama.performers].sort(
    (a, b) =>
      b.performer._count.events - a.performer._count.events ||
      a.performer.name.localeCompare(b.performer.name),
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
    drama.episodeList.flatMap((e) => (e.airDate ? [e.airDate.getUTCFullYear()] : [])),
  );
  const showYear = scheduleYears.size > 1 || !scheduleYears.has(today.getUTCFullYear());
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

  // Строка «Эфир: 29 июл. 2026 (по четвергам)». Собрана отдельным
  // фрагментом, потому что она же служит переключателем графика: внутри
  // <summary> абзац недопустим, там разрешено только фразовое содержимое.
  const airedLine = drama.airedFrom ? (
    <>
      <CalendarIcon />{" "}
      <span className="text-secondary">{t.catalog.drama.aired}</span>{" "}
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
            <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
              {dramaTitleForLocale(drama, locale)}
              {drama.year && (
                <span className="fs-5 fw-normal text-secondary"> ({drama.year})</span>
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
          {(drama.nativeTitle || drama.alsoKnownAs || dramaTitleForLocale(drama, locale) !== drama.title) && (
            <p className="small text-secondary mb-0">
              {[
                dramaTitleForLocale(drama, locale) !== drama.title ? drama.title : null,
                drama.nativeTitle,
                drama.alsoKnownAs,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {ourRating != null && (
            <div className="d-flex flex-wrap gap-2 mt-2">
              <span className="date-chip">★ {ourRating.toFixed(1)}</span>
            </div>
          )}
        </div>
        {currentUser && (
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {/* Колокольчик серий — вплотную слева от кнопки статуса
                (просьба владельца). */}
            <EpisodeBellButton dramaId={drama.id} enabled={watchStatus?.notifyEpisodes ?? false} />
            <DramaStatusButton dramaId={drama.id} status={watchStatus?.status ?? null} />
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
              alt={drama.title}
              sizes="15rem"
              className="rounded-4"
              style={{ width: "15rem", aspectRatio: "2 / 3", objectFit: "cover" }}
            />
            {drama.mydramalistUrl && (
              <a
                href={drama.mydramalistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                MyDramaList ↗
              </a>
            )}
          </div>
        )}
        {/* Без фона-карточки (фидбек владельца): факты и описание —
            просто текст в правой колонке, как у артиста. */}
        {hasFacts && (
        <div className="flex-fill d-flex flex-column gap-1" style={{ minWidth: 0 }}>
          {studios.length > 0 && (
            <p className="small text-secondary mb-2">
              <BuildingIcon />{" "}
              <span className="text-secondary">
                {studios.length > 1 ? t.catalog.drama.studios : t.catalog.drama.studio}
              </span>{" "}
              {studios.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <AppLink href={agencyHref(a)} className="link-body-emphasis">
                    {a.name}
                  </AppLink>
                </span>
              ))}
            </p>
          )}
          {drama.novel && (
            <p className="small text-secondary mb-2">
              <BookIcon className="icon-inline" />{" "}
              <span className="text-secondary">{t.catalog.drama.basedOn}</span>{" "}
              <AppLink
                href={novelHref(drama.novel)}
                className="link-body-emphasis"
              >
                {drama.novel.title}
              </AppLink>
              {drama.novel.author ? ` (${drama.novel.author})` : ""}
            </p>
          )}

          {drama.genres.length > 0 && (
            <p className="small text-secondary mb-2 d-flex flex-wrap align-items-center gap-2">
              <span className="d-inline-flex align-items-center gap-1">
                <TagIcon /> <span className="text-secondary">{t.catalog.drama.genres}</span>
              </span>
              {/* Жанр — вход в поиск с этим жанром в фильтре (И1):
                  раньше чипы были глухие, и «ещё такое же» приходилось
                  собирать руками. */}
              {drama.genres.map((g) => (
                <AppLink
                  key={g}
                  href={`/search?section=dramas&genres=${encodeURIComponent(g)}`}
                  className="tag-chip text-decoration-none"
                >
                  {g}
                </AppLink>
              ))}
            </p>
          )}

          {drama.tags.length > 0 && (
            <p className="small text-secondary mb-2 d-flex flex-wrap align-items-center gap-2">
              <span className="d-inline-flex align-items-center gap-1">
                <TagIcon /> <span className="text-secondary">{t.catalog.drama.tags}</span>
              </span>
              {drama.tags.map((tag) => (
                <AppLink
                  key={tag}
                  href={`/search?section=dramas&tags=${encodeURIComponent(tag)}`}
                  className="tag-chip text-decoration-none"
                >
                  {tag}
                </AppLink>
              ))}
            </p>
          )}

          <div className="d-flex flex-column gap-1 mb-3">
            {/* Страна, тип и канал (И4) — значения из данных, не
                переводятся; каждая — ссылка в поиск с этим фильтром:
                фильтры появились в И1, и «ещё такое же» в одном клике. */}
            {(drama.country || drama.type) && (
              <p className="small text-secondary mb-0">
                <PinIcon />{" "}
                {drama.country && (
                  <>
                    <span className="text-secondary">{t.catalog.drama.country}</span>{" "}
                    <AppLink
                      href={`/search?section=dramas&country=${encodeURIComponent(drama.country)}`}
                      className="link-body-emphasis"
                    >
                      {drama.country}
                    </AppLink>
                  </>
                )}
                {drama.country && drama.type && " · "}
                {drama.type && (
                  <>
                    <span className="text-secondary">{t.catalog.drama.type}</span>{" "}
                    <AppLink
                      href={`/search?section=dramas&type=${encodeURIComponent(drama.type)}`}
                      className="link-body-emphasis"
                    >
                      {drama.type}
                    </AppLink>
                  </>
                )}
              </p>
            )}
            {drama.network && (
              <p className="small text-secondary mb-0">
                <TvIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.catalog.drama.network}</span>{" "}
                <AppLink
                  href={`/search?section=dramas&network=${encodeURIComponent(drama.network)}`}
                  className="link-body-emphasis"
                >
                  {drama.network}
                </AppLink>
              </p>
            )}
            {(drama.episodes || drama.duration) && (
              <p className="small text-secondary mb-0">
                <TvIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.catalog.drama.episodes}</span>{" "}
                {drama.episodes ? `${drama.episodes}` : "?"}
                {drama.duration ? ` × ${drama.duration}` : ""}
              </p>
            )}
            {/* График выхода серий свёрнут под строку «Эфир» (просьба
                владельца): в конце строки — «Подробнее», по нему
                раскрывается поимённый список серий. Свёртка нативная,
                на details/summary: график — не текст, мерить нечего,
                клиентский код тут не нужен вовсе, а состояние
                (свёрнуто/раскрыто) и работа с клавиатуры достаются от
                самого summary. Расписания нет — нет и переключателя,
                остаётся обычная строка. */}
            {episodeRows.length > 0 ? (
              <details className="schedule-fold small text-secondary">
                <summary>
                  {airedLine ?? (
                    <>
                      <CalendarIcon />{" "}
                      <span className="text-secondary">
                        {t.catalog.drama.schedule.title}
                      </span>
                    </>
                  )}{" "}
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
                    <span className="text-white">{t.catalog.drama.schedule.title}</span>
                    <span>
                      {t.catalog.drama.schedule.aired(airedCount, episodeRows.length)}
                    </span>
                  </div>
                  <EpisodeSchedule rows={episodeRows} />
                </div>
              </details>
            ) : (
              airedLine && <p className="small text-secondary mb-0">{airedLine}</p>
            )}
            {drama.director && (
              <p className="small text-secondary mb-0">
                <UserIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.catalog.drama.director}</span>{" "}
                {drama.director}
              </p>
            )}
            {drama.screenwriter && (
              <p className="small text-secondary mb-0">
                <UserIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.catalog.drama.screenwriter}</span>{" "}
                {drama.screenwriter}
              </p>
            )}
            {drama.contentRating && (
              <p className="small text-secondary mb-0">
                <InfoIcon />{" "}
                <span className="text-secondary">{t.catalog.drama.contentRating}</span>{" "}
                {drama.contentRating}
              </p>
            )}
            {(drama.mdlScore != null || ourRating != null) && (
              <p className="small text-secondary mb-0">
                {ourRating != null && (
                  <>
                    <span className="text-secondary">{t.catalog.drama.ourScore}</span>{" "}
                    <span
                      style={{
                        color:
                          ourRating >= 7
                            ? "#3bb33b"
                            : ourRating >= 5
                              ? "inherit"
                              : "#e5484d",
                      }}
                    >
                      ★ {ourRating.toFixed(1)}
                    </span>{" "}
                    <span className="text-secondary">({ourRatingCount})</span>
                  </>
                )}
                {ourRating != null && drama.mdlScore != null && " · "}
                {drama.mdlScore != null && (
                  <>
                    <span className="text-secondary">MDL:</span> ★{" "}
                    {drama.mdlScore.toFixed(1)}
                  </>
                )}
              </p>
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
                watched={episodeProgress(watchStatus, drama.episodes)?.watched ?? null}
              />
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
              <p className="text-secondary mb-0" style={{ whiteSpace: "pre-line" }}>{synopsis}</p>
            );
          })()}
        </div>
        )}
      </div>

      {/* События сериала — после фактов: фан-митинги/премьеры. */}
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

      {/* Каст — адаптивной фото-сеткой (Э2ф) вместо ряда одинаковых
          плашек; первые ~14, остальные за «Показать всех». Пустой
          раздел не рисуем — ни заголовка, ни «состав не указан». */}
      {drama.performers.length > 0 && (
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

      {relatedItems.length > 0 && (
        <div className="mb-4">
          <h2 className="section-heading mb-2">{t.catalog.drama.related}</h2>
          <div className="d-flex flex-wrap gap-2">
            {relatedItems.map(({ drama: rel, relation }) => (
              <EntityMiniCard
                key={rel.id}
                href={dramaHref(rel)}
                photoUrl={rel.posterUrl}
                name={rel.title}
                subtitle={relation}
                round={false}
              />
            ))}
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

      {/* Атрибуция: постер/синопсис пришли с MDL и blscene, русские
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
                  <AppLink href={dramaHref(sim)} className="text-decoration-none d-block">
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
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )}
                    </div>
                    <p className="small text-white mb-0 mt-2" style={{ lineHeight: 1.3 }}>
                      {dramaTitleForLocale(sim, locale)}
                    </p>
                    {sim.year && <p className="small text-secondary mb-0">{sim.year}</p>}
                  </AppLink>
                  <div className="position-absolute" style={{ top: "0.375rem", right: "0.375rem" }}>
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
      <JsonLd data={tvSeriesJsonLd(drama)} />
    </div>
  );
}
