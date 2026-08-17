import * as cheerio from "cheerio";
import { prisma } from "@/lib/prisma";
import {
  fetchTpopAgencyPage,
  fetchTpopArtistExtras,
  fetchTpopPageStreamingLink,
  fetchTpopConcertPage,
  type TpopConcertEntry,
} from "@/lib/tpopArtistExtras";
import { fetchTpopBandPage, fetchTpopMemberPage, parseTpopPageTitle } from "@/lib/tpopFandom";
import { importTpopBand } from "@/lib/tpopFandomImport";
import { fetchTpopDiscography, fetchTpopPageImage } from "@/lib/tpopDiscography";
import { downloadRemoteImage } from "@/lib/localImage";
import { addPerformerAgency } from "@/lib/performerAgency";
import { scrapeTtmEvent, type TtmEvent } from "@/lib/thaiticketmajor";

// Импорт агентства целиком с tpop.fandom.com (см. tpop-agency-import.md):
// агентство с лого, все Groups/Duos/Soloists/Former artists (создание или
// дообогащение), расширенный профиль каждого (occupation/instruments/
// рост/вес/клипы/награды/факты/источники), дискография со ссылками на
// площадки, сверка Concerts с афишей + догрузка новых с thaiticketmajor.
// Всё созданное/обновлённое пишется в ImportedItem («последнее
// спарсенное» в /admin/imports).

const TTM_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";

export type TpopAgencyImportSummary = {
  agencyName: string;
  performersCreated: number;
  performersUpdated: number;
  albumsTouched: number;
  songsCreated: number;
  eventsCreated: number;
  concertsMatched: number;
  concertsNotFound: string[];
};

type Ctx = {
  runId: string | null;
  log: (m: string) => void;
  summary: TpopAgencyImportSummary;
};

async function recordItem(
  ctx: Ctx,
  entityType: string,
  entityId: string,
  action: "created" | "updated",
  label: string,
): Promise<void> {
  await prisma.importedItem.create({
    data: { runId: ctx.runId, entityType, entityId, action, label },
  });
}

/** Расширенный профиль поверх Performer: перезаписываем только
 *  спарсенные поля (пустые массивы не затирают вручную занесённое). */
async function applyArtistExtras(ctx: Ctx, performerId: string, page: string): Promise<void> {
  const extras = await fetchTpopArtistExtras(page);
  const current = await prisma.performer.findUnique({ where: { id: performerId } });
  if (!current) return;
  await prisma.performer.update({
    where: { id: performerId },
    data: {
      ...(extras.occupation.length > 0 ? { occupation: extras.occupation } : {}),
      ...(extras.instruments.length > 0 ? { instruments: extras.instruments } : {}),
      ...(extras.soloDebut ? { soloDebut: extras.soloDebut } : {}),
      ...(extras.height ? { height: extras.height } : {}),
      ...(extras.weight ? { weight: extras.weight } : {}),
      ...(extras.mvAppearances.length > 0 ? { mvAppearances: extras.mvAppearances } : {}),
      ...(extras.trivia.length > 0 ? { trivia: extras.trivia } : {}),
      ...(extras.awards.length > 0 ? { awards: extras.awards } : {}),
      ...(extras.references.length > 0 ? { references: extras.references } : {}),
      sourceUrl: extras.sourceUrl,
    },
  });
  await importConcerts(ctx, performerId, extras.concerts);
}

/** Дискография: альбомы (обложка + ссылка на площадку со страницы
 *  альбома) и песни (ссылка со страницы песни, если она есть). */
async function importDiscography(ctx: Ctx, performerId: string, page: string): Promise<void> {
  let disco;
  try {
    disco = await fetchTpopDiscography(page);
  } catch {
    return; // нет секции Discography — не ошибка
  }

  for (const album of disco.albums) {
    let coverUrl: string | null = null;
    let url: string | null = null;
    if (album.pageTitle) {
      coverUrl = await downloadRemoteImage(await fetchTpopPageImage(album.pageTitle), "albums");
      url = await fetchTpopPageStreamingLink(album.pageTitle);
    }
    const existing = await prisma.album.findUnique({
      where: { performerId_title: { performerId, title: album.title } },
    });
    const saved = await prisma.album.upsert({
      where: { performerId_title: { performerId, title: album.title } },
      create: { performerId, title: album.title, type: album.type, year: album.year, coverUrl, url },
      update: {
        type: album.type,
        year: album.year,
        ...(coverUrl ? { coverUrl } : {}),
        ...(url ? { url } : {}),
      },
    });
    ctx.summary.albumsTouched += 1;
    if (!existing) await recordItem(ctx, "album", saved.id, "created", album.title);
  }

  const existingSongs = await prisma.song.findMany({
    where: { performerId },
    select: { id: true, title: true, note: true, url: true },
  });
  const byKey = new Map(existingSongs.map((s) => [`${s.title}|${s.note ?? ""}`, s]));
  for (const song of disco.songs) {
    const key = `${song.title}|${song.note ?? ""}`;
    const url = song.pageTitle ? await fetchTpopPageStreamingLink(song.pageTitle) : null;
    const existing = byKey.get(key);
    if (existing) {
      if (url && !existing.url) {
        await prisma.song.update({ where: { id: existing.id }, data: { url } });
      }
      continue;
    }
    const created = await prisma.song.create({
      data: { performerId, title: song.title, note: song.note, year: song.year, url },
    });
    byKey.set(key, { id: created.id, title: song.title, note: song.note ?? null, url });
    ctx.summary.songsCreated += 1;
  }
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'«»“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Поиск на thaiticketmajor: выдача /search?keyword= — ссылки на
 *  страницы событий с заголовками. Возвращает только текущие продажи
 *  (прошедшее TTM из поиска убирает — это ок: прошлое не создаём). */
async function searchTtm(query: string): Promise<{ url: string; title: string }[]> {
  const res = await fetch(
    `https://www.thaiticketmajor.com/search?keyword=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": TTM_UA }, redirect: "follow" },
  );
  if (!res.ok) return [];
  const $ = cheerio.load(await res.text());
  const out: { url: string; title: string }[] = [];
  $('a[href*="/concert/"], a[href*="/performance/"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!href.endsWith(".html")) return;
    const url = href.startsWith("http") ? href : `https://www.thaiticketmajor.com${href}`;
    const title = $(a).attr("title")?.trim() || $(a).text().replace(/\s+/g, " ").trim();
    if (!out.some((o) => o.url === url)) out.push({ url, title });
  });
  return out;
}

/** Привязывает к событию всех артистов концерта (включая гостей),
 *  которых удалось найти в каталоге по имени/алиасу. */
export async function linkEventArtists(eventId: string, artistNames: string[]): Promise<number> {
  let linked = 0;
  for (const raw of artistNames) {
    const name = raw.replace(/\(.*?\)/g, "").trim();
    if (name.length < 2) continue;
    const performer = await prisma.performer.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: "insensitive" } },
          { musicAlias: { equals: name, mode: "insensitive" } },
        ],
      },
    });
    if (!performer) continue;
    await prisma.eventPerformer.upsert({
      where: { eventId_performerId: { eventId, performerId: performer.id } },
      update: {},
      create: { eventId, performerId: performer.id },
    });
    linked += 1;
  }
  return linked;
}

/** Старые страницы TTM живы по предсказуемым слагам — пробуем угадать
 *  URL по названию концерта (поиск сайта старые продажи не отдаёт). */
async function guessTtmEvent(title: string): Promise<TtmEvent | null> {
  const slug = title
    .toLowerCase()
    .replace(/["'«»“”‘’:.,!?]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length < 8) return null;
  for (const section of ["concert", "performance"]) {
    const url = `https://www.thaiticketmajor.com/${section}/${slug}.html`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": TTM_UA } });
      if (!res.ok) continue;
      return await scrapeTtmEvent(url);
    } catch {
      continue;
    }
  }
  return null;
}

/** Создаёт событие из спарсенных TTM-данных (та же логика полей, что и
 *  ручной импорт /admin/events/import-ttm, но без ревью-экрана). */
async function createEventFromTtm(
  ctx: Ctx,
  performerId: string,
  ttm: TtmEvent,
  extraArtists: string[] = [],
): Promise<void> {
  if (!ttm.date) return;
  const startTime = ttm.startTime ?? "19:00";
  const dates = [ttm.date, ...ttm.extraDates];
  const event = await prisma.event.create({
    data: {
      title: ttm.title,
      venue: ttm.venue ?? "TBA",
      ticketPrice: ttm.ticketPrice,
      posterUrl: await downloadRemoteImage(ttm.posterUrl, "posters"),
      presaleAt:
        ttm.presaleDate && ttm.presaleTime
          ? new Date(`${ttm.presaleDate}T${ttm.presaleTime}`)
          : ttm.presaleDate
            ? new Date(`${ttm.presaleDate}T10:00`)
            : null,
      presaleUrl: ttm.sourceUrl,
      occurrences: {
        create: dates.map((d) => ({ startsAt: new Date(`${d}T${startTime}`), hasTime: true })),
      },
      performers: { create: { performerId } },
    },
  });
  // артисты с TTM-страницы + с вики-страницы концерта (гости включая)
  await linkEventArtists(event.id, [
    ...ttm.artists.map((a) => a.nickname || a.fullName),
    ...extraArtists,
  ]);
  ctx.summary.eventsCreated += 1;
  await recordItem(ctx, "event", event.id, "created", ttm.title);
  ctx.log(`  [событие] создано с TTM: ${ttm.title}`);
}

/** Создаёт событие по данным вики-страницы концерта (прошедшие: TTM не
 *  нашёлся) — даты без времени (hasTime=false), постер из инфобокса. */
async function createEventFromWiki(
  ctx: Ctx,
  performerId: string,
  wiki: { title: string; venue: string | null; posterUrl: string | null; artists: string[]; dates: string[] },
): Promise<void> {
  if (wiki.dates.length === 0) return;
  const event = await prisma.event.create({
    data: {
      title: wiki.title,
      venue: wiki.venue ?? "TBA",
      posterUrl: await downloadRemoteImage(wiki.posterUrl, "posters"),
      occurrences: {
        create: wiki.dates.map((d) => ({ startsAt: new Date(`${d}T00:00`), hasTime: false })),
      },
      performers: { create: { performerId } },
    },
  });
  await linkEventArtists(event.id, wiki.artists);
  ctx.summary.eventsCreated += 1;
  await recordItem(ctx, "event", event.id, "created", wiki.title);
  ctx.log(`  [событие] создано с вики концерта: ${wiki.title}`);
}

/** Сверяет список концертов артиста с афишей; новые ищет на TTM. */
async function importConcerts(
  ctx: Ctx,
  performerId: string,
  concerts: TpopConcertEntry[],
): Promise<void> {
  if (concerts.length === 0) return;
  const allEvents = await prisma.event.findMany({ select: { id: true, title: true } });
  const normed = allEvents.map((e) => ({ id: e.id, norm: normTitle(e.title) }));

  for (const concert of concerts) {
    const cNorm = normTitle(concert.title);
    if (cNorm.length < 6) continue;
    const match = normed.find(
      (e) => e.norm === cNorm || e.norm.includes(cNorm) || cNorm.includes(e.norm),
    );
    if (match) {
      // концерт уже в афише — убеждаемся, что артист привязан (пустой id
      // = событие создано этим же прогоном строкой другого артиста)
      if (!match.id) {
        ctx.summary.concertsMatched += 1;
        continue;
      }
      await prisma.eventPerformer.upsert({
        where: { eventId_performerId: { eventId: match.id, performerId } },
        update: {},
        create: { eventId: match.id, performerId },
      });
      ctx.summary.concertsMatched += 1;
      continue;
    }

    // не нашли у себя — собираем данные: вики-страница концерта (артисты,
    // даты, постер) + TTM (страницы прошедших живы по угаданному слагу,
    // текущие — через поиск).
    try {
      const wiki = concert.wikiHref
        ? await fetchTpopConcertPage(concert.wikiHref).catch(() => null)
        : null;

      let ttm: TtmEvent | null = await guessTtmEvent(wiki?.title ?? concert.title);
      if (!ttm) {
        const results = await searchTtm(concert.title.slice(0, 60));
        const hit = results.find((r) => {
          const rNorm = normTitle(r.title);
          return rNorm.includes(cNorm) || cNorm.includes(rNorm);
        });
        if (hit) ttm = await scrapeTtmEvent(hit.url);
      }

      // после скрейпа перепроверяем точное название против афиши
      const finalTitle = ttm?.title ?? wiki?.title;
      if (finalTitle && normed.some((e) => e.norm === normTitle(finalTitle))) {
        ctx.summary.concertsMatched += 1;
        continue;
      }

      if (ttm?.date) {
        await createEventFromTtm(ctx, performerId, ttm, wiki?.artists ?? []);
        // защита от повторного создания в этом же прогоне (тот же концерт
        // в списках нескольких артистов / в двух секциях одной страницы)
        normed.push({ id: "", norm: normTitle(ttm.title) });
      } else if (wiki && wiki.dates.length > 0) {
        await createEventFromWiki(ctx, performerId, wiki);
        normed.push({ id: "", norm: normTitle(wiki.title) });
      } else {
        ctx.summary.concertsNotFound.push(`${concert.title}${concert.year ? ` (${concert.year})` : ""}`);
      }
    } catch {
      ctx.summary.concertsNotFound.push(`${concert.title} — ошибка источника`);
    }
  }
}

/** Один артист из списка агентства: группа (есть участники в инфобоксе)
 *  или солист. linkAgency=false для Former artists. */
async function importArtist(
  ctx: Ctx,
  link: { name: string; href: string },
  agencyId: string | null,
  linkAgency: boolean,
): Promise<void> {
  const page = parseTpopPageTitle(link.href);
  ctx.log(`— ${link.name}`);

  let performerId: string | null = null;
  const band = await fetchTpopBandPage(page).catch(() => null);
  if (band && band.members.length > 0) {
    const result = await importTpopBand(page, (m) => ctx.log(`  ${m}`));
    const row = await prisma.performer.findFirst({
      where: { name: { equals: band.name, mode: "insensitive" }, type: "BAND" },
    });
    performerId = row?.id ?? null;
    if (result.bandCreated) ctx.summary.performersCreated += 1;
    else ctx.summary.performersUpdated += 1;
    // и создание, и обновление — в ленту «последнего спарсенного»,
    // иначе повторный импорт уже известной группы выглядит как «ничего
    // не произошло».
    if (performerId) {
      await recordItem(ctx, "performer", performerId, result.bandCreated ? "created" : "updated", band.name);
    }
  } else {
    const member = await fetchTpopMemberPage(page).catch(() => null);
    // Дизамбиг из заголовка статьи («Fourth (soloist)») — не имя.
    const displayName = (member?.stageName || link.name)
      .replace(/\s*\((soloist|singer|actor|rapper|group|duo)\)$/i, "")
      .trim();
    let existing = await prisma.performer.findFirst({
      where: {
        OR: [
          { name: { equals: displayName, mode: "insensitive" } },
          { musicAlias: { equals: displayName, mode: "insensitive" } },
          ...(member?.birthName
            ? [{ realName: { equals: member.birthName, mode: "insensitive" as const } }]
            : []),
        ],
      },
    });
    // Фолбэк: реальные имена часто расходятся дефисами/пробелами
    // («Opas-iamkajorn» vs «Opasiamkajorn») — сравниваем нормализованно
    // среди кандидатов по первому слову.
    if (!existing && member?.birthName) {
      const normName = (v: string) => v.toLowerCase().replace(/[-\s]/g, "");
      const firstWord = member.birthName.split(/\s+/)[0];
      if (firstWord.length >= 4) {
        const candidates = await prisma.performer.findMany({
          where: { realName: { contains: firstWord, mode: "insensitive" } },
        });
        existing =
          candidates.find((c) => c.realName && normName(c.realName) === normName(member.birthName!)) ??
          null;
      }
    }
    if (existing) {
      const data: Record<string, unknown> = {};
      if (!existing.realName && member?.birthName) data.realName = member.birthName;
      if (!existing.photoUrl && member?.photoUrl) {
        data.photoUrl = await downloadRemoteImage(member.photoUrl, "performers");
      }
      if (Object.keys(data).length > 0) {
        await prisma.performer.update({ where: { id: existing.id }, data });
      }
      performerId = existing.id;
      ctx.summary.performersUpdated += 1;
      await recordItem(ctx, "performer", existing.id, "updated", displayName);
    } else {
      const created = await prisma.performer.create({
        data: {
          name: displayName,
          type: "SOLO",
          realName: member?.birthName ?? null,
          photoUrl: member?.photoUrl
            ? await downloadRemoteImage(member.photoUrl, "performers")
            : null,
        },
      });
      performerId = created.id;
      ctx.summary.performersCreated += 1;
      await recordItem(ctx, "performer", created.id, "created", displayName);
    }
  }

  if (!performerId) return;
  if (linkAgency && agencyId) await addPerformerAgency(performerId, agencyId);
  await applyArtistExtras(ctx, performerId, page);
  await importDiscography(ctx, performerId, page);
}

/** Одиночный импорт артиста/группы по его странице (без контекста
 *  агентства): тип определяется по инфобоксу, агентство берётся из
 *  поля Agency самой страницы (текущее — parseCurrentAgencyName). */
export async function importTpopArtist(
  pageUrlOrTitle: string,
  options?: { runId?: string | null; onProgress?: (m: string) => void },
): Promise<TpopAgencyImportSummary> {
  const ctx: Ctx = {
    runId: options?.runId ?? null,
    log: options?.onProgress ?? (() => {}),
    summary: {
      agencyName: "",
      performersCreated: 0,
      performersUpdated: 0,
      albumsTouched: 0,
      songsCreated: 0,
      eventsCreated: 0,
      concertsMatched: 0,
      concertsNotFound: [],
    },
  };
  const page = parseTpopPageTitle(pageUrlOrTitle);

  // Агентство — из личной страницы (у групп importTpopBand возьмёт Label сам).
  let agencyId: string | null = null;
  const member = await fetchTpopMemberPage(page).catch(() => null);
  if (member?.agency) {
    const agency = await prisma.agency.upsert({
      where: { name: member.agency },
      update: {},
      create: { name: member.agency },
    });
    agencyId = agency.id;
    ctx.summary.agencyName = agency.name;
  }

  await importArtist(ctx, { name: page, href: `/wiki/${page.replace(/ /g, "_")}` }, agencyId, agencyId != null);
  return ctx.summary;
}

export async function importTpopAgency(
  pageUrlOrTitle: string,
  options?: { runId?: string | null; onProgress?: (m: string) => void; skipFormer?: boolean },
): Promise<TpopAgencyImportSummary> {
  const ctx: Ctx = {
    runId: options?.runId ?? null,
    log: options?.onProgress ?? (() => {}),
    summary: {
      agencyName: "",
      performersCreated: 0,
      performersUpdated: 0,
      albumsTouched: 0,
      songsCreated: 0,
      eventsCreated: 0,
      concertsMatched: 0,
      concertsNotFound: [],
    },
  };

  const pageData = await fetchTpopAgencyPage(pageUrlOrTitle);
  ctx.summary.agencyName = pageData.name;
  ctx.log(`Агентство: ${pageData.name}`);

  const existingAgency = await prisma.agency.findFirst({
    where: { name: { equals: pageData.name, mode: "insensitive" } },
  });
  let agency;
  if (existingAgency) {
    agency = existingAgency;
    if (!existingAgency.logoUrl && pageData.photoUrl) {
      agency = await prisma.agency.update({
        where: { id: existingAgency.id },
        data: { logoUrl: await downloadRemoteImage(pageData.photoUrl, "agencies") },
      });
    }
    await recordItem(ctx, "agency", agency.id, "updated", agency.name);
  } else {
    agency = await prisma.agency.create({
      data: {
        name: pageData.name,
        logoUrl: pageData.photoUrl
          ? await downloadRemoteImage(pageData.photoUrl, "agencies")
          : null,
      },
    });
    await recordItem(ctx, "agency", agency.id, "created", agency.name);
  }

  for (const group of [...pageData.groups, ...pageData.duos]) {
    await importArtist(ctx, group, agency.id, true);
  }
  for (const solo of pageData.soloists) {
    await importArtist(ctx, solo, agency.id, true);
  }
  // Бывшие артисты: страницы импортируем/обогащаем, но текущим агентством
  // не привязываем; skipFormer — не трогаем вовсе.
  if (!options?.skipFormer) {
    for (const former of pageData.former) {
      await importArtist(ctx, former, agency.id, false);
    }
  }

  return ctx.summary;
}
