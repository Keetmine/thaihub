"use server";

import { revalidatePath } from "next/cache";
import { decodeHtmlEntities } from "@/lib/eventDedupe";
import { prisma } from "@/lib/prisma";
import { scrapeEventByUrl } from "@/lib/eventTicketSites";
import { combineDateTime, normalizeTimeValue } from "@/lib/dates";
import { downloadRemoteImage } from "@/lib/localImage";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyFavoritersAboutEventPerformers } from "@/lib/telegramNotifications";
import { matchArtistsByNickname, type MatchedArtist } from "@/lib/performerMatching";
import {
  importMusicFestivalByUrl,
  type MusicFestivalSingleImport,
} from "@/lib/musicFestivalCrawl";
import { TTM_MAX_PHOTOS } from "@/lib/thaiticketmajor";

export type TtmImportArtist = MatchedArtist;

export type TtmImportPreview = {
  title: string;
  venue: string;
  date: string;
  startTime: string;
  /** Extra days detected in the page's date line (e.g. a 2-night run) —
   *  pre-filled here, still editable/removable in the review screen. */
  extraDates: string[];
  dateRangeText: string | null;
  ticketPrice: string;
  posterUrl: string;
  /** Картинки «для покупателей» со страницы (план зала, бонусы,
   *  трансляция) — экран проверки показывает их и даёт снять галочку,
   *  дальше они едут в фотогалерею события. */
  photos: string[];
  presaleDate: string;
  presaleTime: string;
  description: string;
  sourceUrl: string;
  artists: TtmImportArtist[];
  /** Событие с этим же sourceUrl уже в базе — экран предупредит, а не
   *  даст молча завести дубль. */
  existingEventId: string | null;
};

/**
 * Scrapes an event page (сайт распознаётся по домену — TTM, Eventpop,
 * Ticketmelon, AllTicket, Eventpass; см. lib/eventTicketSites.ts) and
 * matches its artist lineup against existing Performers (by exact,
 * case-insensitive nickname match — Performer.name is the nickname
 * field, see docs/features/catalog.md; состав отдаёт только TTM).
 * Writes nothing — this is the preview step; createEventFromTtmImport
 * does the actual writes once an admin has reviewed/edited the result.
 */
export async function scrapeTtmEventPreview(url: string): Promise<TtmImportPreview> {
  await requireAdmin();
  const scraped = await scrapeEventByUrl(url);
  const existing = await prisma.event.findFirst({
    where: { sourceUrl: scraped.sourceUrl },
    select: { id: true },
  });

  // Матчинг по нику — общий с краулером афиши (см. performerMatching.ts).
  const artists: TtmImportArtist[] = await matchArtistsByNickname(scraped.artists);

  return {
    // Старые черновики в очереди могли лечь с мнемониками — раскодируем
    // и на выходе, а не только при обходе (см. ttmCrawl.ts).
    title: decodeHtmlEntities(scraped.title),
    venue: scraped.venue ?? "",
    date: scraped.date ?? "",
    startTime: scraped.startTime ?? "",
    extraDates: scraped.extraDates,
    dateRangeText: scraped.dateRangeText,
    ticketPrice: scraped.ticketPrice ?? "",
    posterUrl: scraped.posterUrl ?? "",
    photos: scraped.photos ?? [],
    presaleDate: scraped.presaleDate ?? "",
    presaleTime: scraped.presaleTime ?? "",
    description: scraped.description ?? "",
    sourceUrl: scraped.sourceUrl,
    artists,
    existingEventId: existing?.id ?? null,
  };
}

export type TtmImportSubmission = {
  title: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  extraDates: string[];
  description: string;
  dramaId: string;
  ticketPrice: string;
  posterUrl: string;
  /** Ticket sale opening — both empty means "no presale block". */
  presaleDate: string;
  presaleTime: string;
  presaleUrl: string;
  /** Страница события на билетном сайте или трекере — в блок «Источники». */
  sourceUrl: string;
  /** IANA-зона площадки (черновики ThaiStarX: событие бывает в Тайбэе
   *  или Маниле). Пусто — зона по умолчанию (Бангкок). */
  timezone?: string | null;
  /** Картинки «для покупателей» со страницы билетного сайта — план
   *  зала, что входит в билет, трансляция (просьба владельца
   *  2026-09-22). Едут в фотогалерею события. */
  photos?: string[];
  /** Artists the admin kept checked in the review screen. `type` — кем
   *  заводить нового: сольным или группой (правка владельца
   *  2026-09-10). Раньше здесь всегда стоял SOLO, и концерт группы
   *  плодил её копию в актёрах. */
  artists: {
    fullName: string;
    nickname: string;
    performerId: string | null;
    type?: "SOLO" | "BAND";
  }[];
  /** Additional existing performers picked manually (not from the scrape). */
  extraPerformerIds: string[];
};

/**
 * Creates the Event from a reviewed/edited import, creating a Performer
 * for any artist row that didn't match an existing one (name = nickname,
 * realName = full name — the scraper's two fields map directly onto
 * these). Runs in one transaction so a partial import can't happen.
 */
export async function createEventFromTtmImport(
  data: TtmImportSubmission,
  // Минимальный шов для ФОНОВОЙ пачки одобрения черновиков
  // (imports/eventDraftsBatch.ts): revalidatePath в отвязанном от
  // запроса промисе Next не разрешает («during render which is
  // unsupported») и БРОСАЕТ — событие создавалось, а черновик оставался
  // PENDING. Пачке ревалидация и не нужна: витрина force-dynamic, а
  // фоновые импорты расписания и так ничего не ревалидируют. Поведение
  // по умолчанию не меняется.
  opts: { revalidate?: boolean } = {},
): Promise<{ id: string }> {
  await requireAdmin();
  const title = data.title.trim();
  const venue = data.venue.trim();
  if (!title || !venue || !data.date) {
    throw new Error("Заполните обязательные поля: название, место, дата");
  }
  // Времени может не быть (черновики ThaiStarX: у половины постов
  // только дата) — тогда 00:00 и hasTime=false, как у пустого времени
  // в ручной форме события и у фестивалей musicfestival.in.th.
  const hasTime = Boolean(normalizeTimeValue(data.startTime));

  const dates = Array.from(new Set([data.date, ...data.extraDates]));

  const presaleAt =
    data.presaleDate && data.presaleTime
      ? combineDateTime(data.presaleDate, data.presaleTime)
      : null;

  // Постер забираем к себе ДО записи — в базе не должно оставаться
  // ссылок на thaiticketmajor.com (см. «Local image storage» в
  // docs/features/tmdb-import.md). Качаем вне транзакции: сетевой поход
  // не должен держать её открытой. Уже локальный адрес (админ заменил
  // постер своим файлом) downloadRemoteImage вернёт как есть, а если
  // чужой хост не ответил — вернёт исходную ссылку, и событие всё равно
  // создастся.
  // У постеров с thaistarx.com имя файла бывает общим («1-Poster.jpg»),
  // а помощник считает «уже на диске» по имени — без своего имени
  // второе событие получило бы постер первого (тот же случай, что у
  // фестивалей, см. localImage.ts). Имя — из слага поста.
  const posterUrl = await downloadRemoteImage(data.posterUrl.trim() || null, "posters", {
    localBase: posterLocalBase(data.sourceUrl),
  });

  // Картинки со страницы билетного сайта — в фотогалерею события
  // (просьба владельца 2026-09-22: «брать три картинки и вставлять их в
  // фото»). Качаем к себе тем же помощником, что постер: ссылок на
  // thaiticketmajor.com в базе оставаться не должно. Имя файла у них
  // общее по всему сайту («r 02_…_SeatPlan.jpg»), поэтому у каждой —
  // своя основа имени, иначе второе событие получило бы план зала
  // первого. Не скачалась — просто пропускаем: галерея не повод ронять
  // импорт.
  const photoUrls: string[] = [];
  const photoBase = posterLocalBase(data.sourceUrl);
  for (const [i, raw] of (data.photos ?? []).slice(0, TTM_MAX_PHOTOS).entries()) {
    const url = raw.trim();
    if (!url) continue;
    const local = await downloadRemoteImage(url, "events", {
      localBase: photoBase ? `${photoBase}-${i + 1}` : undefined,
    }).catch(() => null);
    // Чужой хост не ответил — downloadRemoteImage вернёт исходную
    // ссылку; такую в базу не кладём.
    if (local && !/^https?:/i.test(local)) photoUrls.push(local);
  }

  // Итоговый состав события — виден и после транзакции: по нему уходит
  // «у избранного артиста новое событие» (свежесозданные в этой же
  // транзакции артисты в чьём-то избранном оказаться ещё не могли).
  let uniquePerformerIds: string[] = [];
  const event = await prisma.$transaction(async (tx) => {
    const performerIds: string[] = [...data.extraPerformerIds];

    for (const artist of data.artists) {
      if (artist.performerId) {
        performerIds.push(artist.performerId);
        continue;
      }
      const nickname = artist.nickname.trim();
      const fullName = artist.fullName.trim();
      if (!nickname) continue;

      const created = await tx.performer.create({
        data: { name: nickname, realName: fullName || null, type: artist.type ?? "SOLO" },
      });
      performerIds.push(created.id);
    }

    uniquePerformerIds = Array.from(new Set(performerIds));

    return tx.event.create({
      data: {
        title,
        venue,
        description: data.description.trim() || null,
        dramaId: data.dramaId || null,
        ticketPrice: data.ticketPrice.trim() || null,
        posterUrl,
        presaleAt,
        presaleUrl: data.presaleUrl.trim() || null,
        sourceUrl: data.sourceUrl.trim() || null,
        ...(data.timezone ? { timezone: data.timezone } : {}),
        occurrences: {
          create: dates.map((dateStr) => ({
            startsAt: combineDateTime(dateStr, hasTime ? data.startTime : "00:00"),
            endsAt: hasTime && data.endTime ? combineDateTime(dateStr, data.endTime) : null,
            hasTime,
          })),
        },
        performers: {
          create: uniquePerformerIds.map((performerId) => ({ performerId })),
        },
        photos: {
          create: photoUrls.map((url, sort) => ({ url, sort })),
        },
      },
    });
  });

  // История правок: событие пришло из парсера билетного сайта (по
  // ссылке из админки или одобрением черновика обхода афиши) — на
  // странице события видно, откуда оно взялось.
  await logAudit({
    action: "CREATE",
    entityType: "Event",
    entityId: event.id,
    entityLabel: title,
    note: data.sourceUrl.trim()
      ? `импорт события: ${data.sourceUrl.trim()}`
      : "импорт события с билетного сайта",
  });

  // «У избранного артиста новое событие» — и по ссылке из админки, и
  // при одобрении черновика обхода афиши (фоновая пачка зовёт этот же
  // экшен). Ошибку рассылка ловит сама, импорт не роняет.
  await notifyFavoritersAboutEventPerformers(event.id, uniquePerformerIds);

  if (opts.revalidate !== false) {
    revalidatePath("/");
    revalidatePath("/admin/events");
    revalidatePath("/admin/performers");
    revalidatePath("/artists");
  }

  return { id: event.id };
}

/**
 * Разовый импорт одного фестиваля musicfestival.in.th по ссылке
 * (просьба владельца 2026-09-06): у этого источника своя механика —
 * состав целиком, расписание по сценам, заготовки исполнителей, — и
 * экран проверки, как у билетных сайтов, ей не подходит. Поэтому здесь
 * не превью, а сразу импорт: тот же код, что у суточной задачи, просто
 * по одному адресу и по кнопке.
 */
export async function importMusicFestivalEvent(
  url: string,
): Promise<MusicFestivalSingleImport> {
  await requireAdmin();
  const result = await importMusicFestivalByUrl(url.trim());

  if (result.status === "created") {
    revalidatePath("/");
    revalidatePath("/admin/events");
    revalidatePath("/admin/performers");
    revalidatePath("/artists");
  }
  return result;
}

/** Своё имя локального файла постера для источников с неуникальными
 *  именами картинок: thaistarx.com → «thaistarx-<слаг поста>». Для
 *  остальных — undefined, имя берётся из удалённого файла, как раньше. */
function posterLocalBase(sourceUrl: string): string | undefined {
  try {
    const u = new URL(sourceUrl.trim());
    if (!/(^|\.)thaistarx\.com$/i.test(u.hostname)) return undefined;
    const slug = u.pathname.split("/").filter(Boolean).pop();
    return slug ? `thaistarx-${slug}` : undefined;
  } catch {
    return undefined;
  }
}

