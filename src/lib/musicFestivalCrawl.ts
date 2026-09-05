import { prisma } from "@/lib/prisma";
import {
  MUSIC_FESTIVAL_PAGE_SIZE,
  MUSIC_FESTIVAL_PAST_URL,
  MUSIC_FESTIVAL_UPCOMING_URL,
  canonicalMusicFestivalUrl,
  musicFestivalListingPageUrl,
  scrapeMusicFestivalListing,
  scrapeMusicFestivalPage,
  type MusicFestival,
  type MusicFestivalCard,
} from "@/lib/musicFestival";
import { matchFestivalArtists, type MatchedFestivalArtist } from "@/lib/performerMatching";
import { findCatalogDuplicate } from "@/lib/eventDedupe";
import { checkImportCancelled } from "@/lib/importRun";
import { downloadRemoteImage } from "@/lib/localImage";
import { combineDateTime } from "@/lib/dates";
import { logAudit } from "@/lib/audit";
import { notifyAdmins } from "@/lib/adminNotify";

// Краулер фестивалей musicfestival.in.th (суточная задача
// "musicfestival-crawl" в расписании + разовый scripts/import-musicfestival-past.ts,
// см. docs/features/musicfestival-import.md). В отличие от обхода афиши TTM
// здесь НЕТ очереди черновиков: владелец просила «создаём и сохраняем на
// сайте» — новый фестиваль сразу становится Event в каталоге со всем
// лайнапом. Артисты, которых в каталоге нет, заводятся заготовками
// (Performer.stub) — их список владелец дополняет руками.
//
// Главное правило владельца: уже известные адреса НЕ перечитываются —
// обходятся только новые. Память — Event.sourceUrl (плюс EventDraft
// APPROVED для фестивалей, оказавшихся дублями уже существующих событий,
// см. ниже).

/** Потолок страниц фестивалей за прогон суточной задачи: свежих
 *  фестивалей за день единицы, а первый прогон пусть добирает хвост
 *  назавтра, чем висит час. Скрипт прошедших задаёт лимит сам. */
const MAX_FESTIVALS_PER_RUN = 20;

/** Потолок страниц списка (по 12 карточек) — страховка от бесконечного
 *  offset'а при смене вёрстки. */
const MAX_LISTING_PAGES = 30;

/** Паузы между запросами — вежливость к чужому сайту (как у ttmCrawl). */
const PAGE_PAUSE_MS = 1700;
const LISTING_PAUSE_MS = 1200;

export type MusicFestivalListingKind = "upcoming" | "past";

/** Что сделали бы с фестивалем (сухой прогон) / что сделали. */
export type MusicFestivalPlan = {
  title: string;
  url: string;
  dates: string[];
  venue: string | null;
  lineup: number;
  /** Сверка с «N artists» на странице: не совпало — состав снят не весь. */
  lineupCount: number | null;
  matched: string[];
  toCreate: string[];
  ambiguous: string[];
  possibleDuplicateOf: string | null;
  eventId: string | null;
};

export type MusicFestivalCrawlResult = {
  listing: MusicFestivalListingKind;
  apply: boolean;
  listingPages: number;
  cardsFound: number;
  skippedKnown: number;
  fetched: number;
  /** Событий создано (при сухом прогоне — сколько было бы создано). */
  eventsCreated: number;
  /** Исполнителей из каталога привязано (совпали по адресу/имени). */
  performersLinked: number;
  /** Заготовок исполнителей заведено. */
  performersCreated: number;
  /** Имён с несколькими тёзками в каталоге — заведены заготовками. */
  ambiguous: number;
  /** Сильных дублей уже существующих событий — не создано, запомнено. */
  duplicates: number;
  /** Создано, но похоже на существующее событие (в сводку). */
  possibleDupes: number;
  /** Страниц без разобранной даты — пропущены, перечитаются завтра. */
  noDate: number;
  failed: number;
  plans: MusicFestivalPlan[];
  listingErrors: string[];
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugFromUrl(url: string): string {
  return url.split("/").filter(Boolean).pop() ?? "festival";
}

/** Описание для Event.description: текст со страницы + жанры и
 *  организатор строками в конце (своих полей у Event нет). */
function buildDescription(f: MusicFestival): string | null {
  const parts: string[] = [];
  if (f.description) parts.push(f.description);
  const meta: string[] = [];
  if (f.genres.length) meta.push(`Genres: ${f.genres.join(", ")}`);
  if (f.organizer) meta.push(`Organizer: ${f.organizer}`);
  if (meta.length) parts.push(meta.join("\n"));
  return parts.join("\n\n") || null;
}

/**
 * Обходит один список (будущие или прошедшие), заводит события по новым
 * адресам. `apply: false` — сухой прогон: страницы читаются, матчинг
 * считается, но ничего не пишется (постеры и фото не качаются) — план
 * возвращается в `plans`.
 */
export async function runMusicFestivalCrawl(
  opts: {
    runId?: string | null;
    listing?: MusicFestivalListingKind;
    maxFestivals?: number;
    apply?: boolean;
    log?: (line: string) => void;
  } = {},
): Promise<MusicFestivalCrawlResult> {
  const runId = opts.runId ?? null;
  const listing = opts.listing ?? "upcoming";
  const maxFestivals = opts.maxFestivals ?? MAX_FESTIVALS_PER_RUN;
  const apply = opts.apply ?? true;
  const log = opts.log ?? (() => {});
  const listingUrl = listing === "past" ? MUSIC_FESTIVAL_PAST_URL : MUSIC_FESTIVAL_UPCOMING_URL;

  const result: MusicFestivalCrawlResult = {
    listing,
    apply,
    listingPages: 0,
    cardsFound: 0,
    skippedKnown: 0,
    fetched: 0,
    eventsCreated: 0,
    performersLinked: 0,
    performersCreated: 0,
    ambiguous: 0,
    duplicates: 0,
    possibleDupes: 0,
    noDate: 0,
    failed: 0,
    plans: [],
    listingErrors: [],
  };

  // 1. Список целиком: страницы по 12 через ?offset=, пока сайт говорит
  // «есть ещё». Упавшая страница списка обход не роняет: что успели
  // собрать — обходим, ошибка уходит в сводку.
  const cards = new Map<string, MusicFestivalCard>();
  for (let offset = 0; result.listingPages < MAX_LISTING_PAGES; offset += MUSIC_FESTIVAL_PAGE_SIZE) {
    await checkImportCancelled(runId);
    if (offset > 0) await pause(LISTING_PAUSE_MS);
    let page;
    try {
      page = await scrapeMusicFestivalListing(musicFestivalListingPageUrl(listingUrl, offset));
    } catch (e) {
      result.listingErrors.push(e instanceof Error ? e.message : String(e));
      break;
    }
    result.listingPages++;
    for (const card of page.cards) if (!cards.has(card.url)) cards.set(card.url, card);
    if (!page.hasMore || page.cards.length === 0) break;
  }
  if (cards.size === 0 && result.listingErrors.length > 0) {
    throw new Error(`список не открылся: ${result.listingErrors.join("; ")}`);
  }
  result.cardsFound = cards.size;

  // 2. Память: адреса, по которым событие уже есть (Event.sourceUrl —
  // и краулером, и руками), плюс EventDraft с этим адресом — так
  // запоминаются фестивали, оказавшиеся дублями уже существующих
  // событий (см. шаг 4). Ни то ни другое не перечитывается.
  const knownEvents = await prisma.event.findMany({
    where: { sourceUrl: { contains: "musicfestival.in.th" } },
    select: { sourceUrl: true },
  });
  const known = new Set(
    knownEvents
      .map((e) => (e.sourceUrl ? canonicalMusicFestivalUrl(e.sourceUrl) : null))
      .filter((u): u is string => u !== null),
  );
  const drafts = await prisma.eventDraft.findMany({
    where: { sourceUrl: { in: [...cards.keys()] } },
    select: { sourceUrl: true },
  });
  for (const d of drafts) known.add(d.sourceUrl);

  const fresh: MusicFestivalCard[] = [];
  for (const card of cards.values()) {
    if (known.has(card.url)) result.skippedKnown++;
    else fresh.push(card);
  }
  const queue = fresh.slice(0, Math.max(0, maxFestivals));
  log(`карточек ${cards.size}, знакомых ${result.skippedKnown}, в очереди ${queue.length}`);

  // 3. Страницы фестивалей — с паузой между ними.
  for (const card of queue) {
    await checkImportCancelled(runId);
    if (result.fetched > 0) await pause(PAGE_PAUSE_MS);

    let festival: MusicFestival;
    try {
      festival = await scrapeMusicFestivalPage(card.url);
      result.fetched++;
    } catch (e) {
      result.fetched++;
      result.failed++;
      console.warn(`musicfestival-crawl: ${card.url} ->`, e instanceof Error ? e.message : e);
      continue;
    }
    if (!festival.title) festival = { ...festival, title: card.title };
    if (festival.dates.length === 0) {
      // Без даты событие не завести (EventOccurrence обязателен); адрес
      // не запоминается — дата появится, страница перечитается.
      result.noDate++;
      log(`без даты: ${festival.title} (${card.url})`);
      continue;
    }

    // 4. Дедуп по содержимому (тот же матчинг, что у обхода афиши):
    // фестиваль уже есть в каталоге под другим адресом (например, из
    // TTM) — второе событие не создаём. Чтобы адрес не перечитывался
    // каждый день, он запоминается черновиком APPROVED с eventId —
    // ровно так обход афиши закрывает свои дубли; в очереди на
    // /admin/imports такие не показываются (там только PENDING).
    const dupe = await findCatalogDuplicate({
      title: festival.title,
      date: festival.dates[0],
      extraDates: festival.dates.slice(1),
    });
    if (dupe && dupe.strength === "strong") {
      result.duplicates++;
      log(`дубль: ${festival.title} = «${dupe.eventTitle}» (${dupe.eventId})`);
      if (apply) {
        if (!dupe.eventSourceUrl) {
          await prisma.event.update({ where: { id: dupe.eventId }, data: { sourceUrl: card.url } });
        }
        const payload = JSON.parse(
          JSON.stringify({
            title: festival.title,
            sourceUrl: card.url,
            date: festival.dates[0],
            extraDates: festival.dates.slice(1),
            venue: festival.venue,
            posterUrl: festival.posterUrl,
            dateRangeText: festival.dateText,
            artists: [],
          }),
        );
        await prisma.eventDraft.upsert({
          where: { sourceUrl: card.url },
          create: {
            sourceUrl: card.url,
            payload,
            matchedPerformers: [],
            status: "APPROVED",
            eventId: dupe.eventId,
            reviewedAt: new Date(),
          },
          update: { status: "APPROVED", eventId: dupe.eventId, reviewedAt: new Date(), checkedAt: new Date() },
        });
      }
      continue;
    }
    if (dupe) result.possibleDupes++;

    // 5. Лайнап целиком: совпавшие — привязать, остальных — завести
    // заготовками (в том числе тёзок, см. matchFestivalArtists).
    const matched = await matchFestivalArtists(
      festival.lineup.map((a) => ({ name: a.name, url: a.url })),
    );
    const linked = matched.filter((m) => m.performerId !== null);
    const toCreate = matched.filter((m) => m.performerId === null);
    const ambiguous = matched.filter((m) => m.via === "ambiguous");
    result.performersLinked += linked.length;
    result.ambiguous += ambiguous.length;

    const plan: MusicFestivalPlan = {
      title: festival.title,
      url: card.url,
      dates: festival.dates,
      venue: festival.venue,
      lineup: festival.lineup.length,
      lineupCount: festival.lineupCount,
      matched: linked.map((m) => m.name),
      toCreate: toCreate.map((m) => m.name),
      ambiguous: ambiguous.map((m) => m.name),
      possibleDuplicateOf: dupe ? dupe.eventTitle : null,
      eventId: null,
    };
    if (festival.lineupCount !== null && festival.lineupCount !== festival.lineup.length) {
      console.warn(
        `musicfestival-crawl: ${card.url}: на странице «${festival.lineupCount} artists», снято ${festival.lineup.length}`,
      );
    }

    if (!apply) {
      result.eventsCreated++;
      result.performersCreated += toCreate.length;
      result.plans.push(plan);
      log(
        `план: ${festival.title} [${festival.dates.join(", ")}] — состав ${festival.lineup.length}, ` +
          `совпало ${linked.length}, завести ${toCreate.length}` +
          (ambiguous.length ? ` (тёзки: ${ambiguous.map((a) => a.name).join(", ")})` : ""),
      );
      continue;
    }

    try {
      const created = await createFestivalEvent(festival, card.url, linked, toCreate, runId);
      plan.eventId = created.eventId;
      result.eventsCreated++;
      result.performersCreated += created.performersCreated;
      result.plans.push(plan);
      log(
        `создано: ${festival.title} (${created.eventId}) — привязано ${linked.length}, ` +
          `заготовок +${created.performersCreated}`,
      );
    } catch (e) {
      result.failed++;
      console.warn(`musicfestival-crawl: ${card.url} не создан ->`, e instanceof Error ? e.message : e);
    }
  }

  // 6. Одно уведомление на прогон.
  if (apply && result.eventsCreated > 0) {
    const appUrl = process.env.APP_URL || "";
    await notifyAdmins(
      "import",
      `Фестивали musicfestival.in.th: событий +${result.eventsCreated}, заготовок исполнителей +${result.performersCreated}` +
        (appUrl && result.performersCreated ? `\n${appUrl}/admin/performers?stub=1` : ""),
      { dedupKey: runId ?? "musicfestival-crawl" },
    );
  }

  return result;
}

/**
 * Создаёт событие и заготовки исполнителей. Картинки качаются к нам ДО
 * транзакции (сетевой поход не должен держать её открытой), запись — в
 * одной транзакции: либо событие со всем составом, либо ничего.
 */
async function createFestivalEvent(
  festival: MusicFestival,
  sourceUrl: string,
  linked: MatchedFestivalArtist[],
  toCreate: MatchedFestivalArtist[],
  runId: string | null,
): Promise<{ eventId: string; performersCreated: number }> {
  const slug = slugFromUrl(sourceUrl);
  // Своё имя файла: у сайта постер каждого фестиваля — thumbnail.jpg /
  // cover.jpg, и по умолчанию все фестивали получили бы один файл.
  const posterUrl = await downloadRemoteImage(festival.posterUrl, "posters", {
    localBase: `musicfestival-${slug}`,
  });

  const photos = new Map<string, string | null>();
  for (const artist of toCreate) {
    const photo = festival.lineup.find((a) => a.url === artist.url)?.photoUrl ?? null;
    photos.set(
      artist.url,
      await downloadRemoteImage(photo, "performers", {
        localBase: `musicfestival-${slugFromUrl(artist.url)}`,
      }),
    );
  }

  // Площадка из каталога — только точное совпадение названия с
  // каталожной локацией; текстовое venue пишется всегда.
  const location = festival.venueName
    ? await prisma.location.findFirst({
        where: { name: { equals: festival.venueName, mode: "insensitive" }, createdByUserId: null },
        select: { id: true },
      })
    : null;

  const ticketLink = festival.ticketLinks.find((l) => l.url)?.url ?? null;

  const { event, createdPerformers } = await prisma.$transaction(async (tx) => {
    const performerIds = new Set(linked.map((m) => m.performerId!));
    const createdPerformers: { id: string; name: string; url: string }[] = [];

    for (const artist of toCreate) {
      // Гонка двух прогонов / тот же артист в двух фестивалях одной
      // пачки: адрес уникален, второй раз просто берём существующего.
      const existing = await tx.performer.findUnique({
        where: { musicFestivalUrl: artist.url },
        select: { id: true },
      });
      if (existing) {
        performerIds.add(existing.id);
        continue;
      }
      // Тип — SOLO по умолчанию: сайт не различает группы и сольных
      // артистов; владелец правит при заполнении заготовки.
      const performer = await tx.performer.create({
        data: {
          name: artist.name,
          type: "SOLO",
          photoUrl: photos.get(artist.url) ?? null,
          musicFestivalUrl: artist.url,
          stub: true,
        },
        select: { id: true, name: true },
      });
      performerIds.add(performer.id);
      createdPerformers.push({ ...performer, url: artist.url });
    }

    // Состав по дням («DAY 2» на карточках у фестивалей с расписанием):
    // артист → его день → OccurrenceLineup; день вне диапазона дат и
    // карточки без дня остаются в общем составе (пустой лайнап дня =
    // день наследует общий состав, см. events.md).
    const performerIdByUrl = new Map<string, string>();
    for (const m of linked) performerIdByUrl.set(m.url, m.performerId!);
    for (const p of createdPerformers) performerIdByUrl.set(p.url, p.id);
    for (const artist of toCreate) {
      if (!performerIdByUrl.has(artist.url)) {
        const existing = await tx.performer.findUnique({
          where: { musicFestivalUrl: artist.url },
          select: { id: true },
        });
        if (existing) performerIdByUrl.set(artist.url, existing.id);
      }
    }
    const dayLineups = festival.dates.map(() => new Set<string>());
    for (const a of festival.lineup) {
      const id = performerIdByUrl.get(a.url);
      if (a.day && id && a.day >= 1 && a.day <= festival.dates.length) dayLineups[a.day - 1].add(id);
    }
    const hasDayLineups = festival.dates.length > 1 && dayLineups.some((s) => s.size > 0);

    const event = await tx.event.create({
      data: {
        title: festival.title,
        venue: festival.venue ?? "TBA",
        description: buildDescription(festival),
        sourceUrl,
        ticketPrice: festival.ticketPrice,
        presaleUrl: ticketLink,
        posterUrl,
        locationId: location?.id ?? null,
        occurrences: {
          // Времени сайт не даёт: 00:00 + hasTime=false, как пустое
          // «Начало» в форме события.
          create: festival.dates.map((date, i) => ({
            startsAt: combineDateTime(date, "00:00"),
            hasTime: false,
            lineup: {
              create: hasDayLineups
                ? [...dayLineups[i]].map((performerId) => ({ performerId }))
                : [],
            },
          })),
        },
        performers: { create: [...performerIds].map((performerId) => ({ performerId })) },
      },
      select: { id: true, title: true },
    });
    return { event, createdPerformers };
  });

  // История правок + журнал прогона.
  await logAudit({
    action: "CREATE",
    entityType: "Event",
    entityId: event.id,
    entityLabel: event.title,
    note: `импорт фестиваля: ${sourceUrl}`,
  });
  for (const p of createdPerformers) {
    await logAudit({
      action: "CREATE",
      entityType: "Performer",
      entityId: p.id,
      entityLabel: p.name,
      note: `заготовка из лайнапа фестиваля: ${p.url}`,
    });
  }
  if (runId) {
    await prisma.importedItem.createMany({
      data: [
        { runId, entityType: "event", entityId: event.id, action: "created", label: event.title },
        ...createdPerformers.map((p) => ({
          runId,
          entityType: "performer",
          entityId: p.id,
          action: "created",
          label: `${p.name} (заготовка)`,
        })),
      ],
    });
  }

  return { eventId: event.id, performersCreated: createdPerformers.length };
}

/** Сводка прогона — для журнала импортов, строки расписания и скрипта. */
export function summarizeMusicFestivalCrawl(r: MusicFestivalCrawlResult): string {
  const titles = r.plans.map((p) => p.title);
  const verb = r.apply ? "событий +" : "создалось бы ";
  return (
    `${r.listing === "past" ? "прошедшие" : "будущие"}: карточек ${r.cardsFound}, ` +
    `скачано страниц ${r.fetched}, ${verb}${r.eventsCreated}` +
    (titles.length ? ` (${titles.slice(0, 5).join(", ")}${titles.length > 5 ? "…" : ""})` : "") +
    `, артистов привязано ${r.performersLinked}, заготовок +${r.performersCreated}` +
    (r.ambiguous ? ` (тёзок ${r.ambiguous})` : "") +
    (r.duplicates ? `, дублей закрыто ${r.duplicates}` : "") +
    (r.possibleDupes ? `, возможных дублей ${r.possibleDupes}` : "") +
    (r.noDate ? `, без даты ${r.noDate}` : "") +
    `, знакомых пропущено ${r.skippedKnown}` +
    (r.failed ? `, не вышло ${r.failed}` : "") +
    (r.listingErrors.length ? ` · список: ${r.listingErrors.join("; ")}` : "")
  );
}
