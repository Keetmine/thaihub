import { prisma } from "@/lib/prisma";
import {
  absMdlUrl,
  mdlIdFromUrl,
  mdlSearchUrl,
  parseMdlPersonPage,
  parseMdlSearchPeople,
  type MdlPerson,
} from "@/lib/mydramalist";
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from "@/lib/socialLinks";
import { downloadRemoteImage } from "@/lib/localImage";
import { MdlRunFetcher } from "@/lib/mdlClient";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";

/**
 * Досбор карточек исполнителей с MyDramaList — общий код для разового
 * скрипта (scripts/mdl-sync-performers.ts) и для задачи по расписанию
 * «MyDramaList: биографии актёров» (см. scheduledJobs.ts).
 *
 * Зачем задача: 8994 сольных артиста из 9806 сидят без биографии, и
 * писать её самим нельзя — это живые люди, выдумывать про них факты мы
 * не будем (обсуждение 2026-09-23). У 1675 из них уже сохранена ссылка
 * на MDL, остальных приходится искать по имени — поэтому отдельный
 * прогон, медленный и прерываемый, а не «кнопка, которая всё чинит».
 *
 * Почему модуль отдельный, а не внутри mdlPerformerImport: тот через
 * mdlDramaImport умеет заводить недостающие сериалы и скачивать их
 * страницы — на обходе в девять тысяч человек это сотни лишних
 * запросов к MDL. Здесь фильмография только СВЕРЯЕТСЯ с каталогом: по
 * ней опознаётся человек и проставляются роли, но новых записей не
 * появляется.
 *
 * Заполняем ТОЛЬКО пустое (bio, realName, birthDate, фото) — кроме
 * alsoKnownAs / nationality / gender, которые у MDL точнее наших
 * парсерных заготовок. Занесённое руками не переписываем.
 */

/** Пауза между походами на MDL: мы в гостях, и это та же пауза, что у
 *  остальных массовых обходов (см. mdlRequestsBatch.ts). */
export const PERFORMER_SYNC_DELAY_MS = 1500;

/** Сколько человек берём за одну пачку. Дальше задача просит
 *  планировщик разбудить её снова — так обход растягивается на дни, не
 *  занимая сервер на часы (просьба владельца: «медленно, долго, с
 *  возможностью стопнуть»). */
export const PERFORMER_SYNC_BATCH = 150;

/** Подряд упавших, после которых пачка сдаётся: одна ошибка — битая
 *  ссылка, десять подряд — нас перестали пускать. */
const FAILURE_STREAK_LIMIT = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Кого ждёт обход: сольные артисты без биографии, чью страницу на MDL
 * мы ещё ни разу не открывали.
 *
 * `mdlSyncedAt` — и отметка «смотрели», и точка возобновления: он
 * проставляется даже тем, кого на MDL не нашли, иначе каждая следующая
 * пачка начинала бы с одних и тех же ненаходимых имён. Поэтому счётчик
 * «осталось» честно доходит до нуля, а задача сама затихает.
 */
export const MISSING_BIO_WHERE = {
  type: "SOLO",
  bio: null,
  mdlSyncedAt: null,
} as const;

export type PerformerSyncOutcome = {
  /** Человек опознан на MDL (по сохранённой ссылке или поиском). */
  matched: boolean;
  url: string | null;
  /** Какие поля заполнили — только те, что были пустыми. */
  filled: string[];
  linksAdded: number;
  rolesSet: number;
};

/** Ищет наш сериал по строке фильмографии MDL: сначала по id страницы,
 *  потом по нормализованному названию. */
export type DramaResolver = (mdlPath: string, title: string) => string | undefined;

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'"“”:!?.,\-–—()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Указатель «страница MDL → наш сериал», один на весь прогон: каталог
 * это 5647 записей, и тянуть их на каждого из девяти тысяч артистов
 * было бы девять тысяч одинаковых запросов.
 */
export async function buildDramaResolver(): Promise<DramaResolver> {
  const dramas = await prisma.drama.findMany({
    select: { id: true, title: true, mydramalistUrl: true },
  });
  const byMdlId = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const d of dramas) {
    const mid = d.mydramalistUrl ? mdlIdFromUrl(d.mydramalistUrl) : null;
    if (mid) byMdlId.set(mid, d.id);
    byTitle.set(normTitle(d.title), d.id);
  }
  return (mdlPath, title) => {
    const mid = mdlIdFromUrl(mdlPath);
    return (mid ? byMdlId.get(mid) : undefined) ?? byTitle.get(normTitle(title));
  };
}

type PerformerForSync = {
  id: string;
  name: string;
  realName: string | null;
  bio: string | null;
  birthDate: Date | null;
  photoUrl: string | null;
  mydramalistUrl: string | null;
  links: { url: string }[];
  dramas: { dramaId: string }[];
};

const PERFORMER_SELECT = {
  id: true,
  name: true,
  realName: true,
  bio: true,
  birthDate: true,
  photoUrl: true,
  mydramalistUrl: true,
  links: { select: { url: true } },
  dramas: { select: { dramaId: true } },
} as const;

/**
 * Опознание человека на чужом сайте — главная опасность этого обхода:
 * тёзок много, а приписать тайскому актёру чужую биографию хуже, чем
 * оставить карточку пустой.
 *
 * Поэтому кандидат из поиска принимается, только если он подтверждён:
 * либо его фильмография пересекается с нашим каталогом (он играл в
 * сериале, который у нас уже связан с этим артистом), либо настоящее
 * имя из нашей карточки целиком встречается в его именах на MDL.
 * Не подтвердился — считаем, что не нашли.
 */
function verifier(p: PerformerForSync, resolveDrama: DramaResolver) {
  const ourDramaIds = new Set(p.dramas.map((d) => d.dramaId));
  return (person: MdlPerson): boolean => {
    const overlap = person.filmography.some((row) => {
      const id = resolveDrama(row.mdlPath, row.title);
      return id != null && ourDramaIds.has(id);
    });
    if (overlap) return true;
    if (p.realName) {
      const hay =
        `${person.name} ${person.alsoKnownAs ?? ""} ${person.firstName ?? ""} ${person.familyName ?? ""}`.toLowerCase();
      if (tokens(p.realName).every((t) => hay.includes(t))) return true;
    }
    return false;
  };
}

/** Страница человека по сохранённой ссылке либо поиском по имени.
 *  Возвращает null, если не нашли или ни один кандидат не подтвердился. */
async function findPerson(
  p: PerformerForSync,
  opts: { fetchHtml: (url: string) => Promise<string>; resolveDrama: DramaResolver; delayMs: number },
): Promise<{ person: MdlPerson; url: string } | null> {
  const verify = verifier(p, opts.resolveDrama);

  // Сохранённой ссылке верим без проверки: её проставил человек или
  // импорт по адресу, а не догадка по имени.
  if (p.mydramalistUrl?.includes("/people/")) {
    const url = p.mydramalistUrl;
    return { person: parseMdlPersonPage(await opts.fetchHtml(url), url), url };
  }

  const query = p.realName ? `${p.name} ${p.realName}` : p.name;
  let candidates = parseMdlSearchPeople(await opts.fetchHtml(mdlSearchUrl(query))).filter(
    // /people/top — служебная ссылка «топ людей» в шапке выдачи.
    (c) => c.path !== "/people/top",
  );
  // Ничего не нашлось по «псевдоним + имя» — пробуем одно настоящее
  // имя: под ним человек на MDL и заведён чаще всего.
  if (candidates.length === 0 && p.realName) {
    await sleep(opts.delayMs);
    candidates = parseMdlSearchPeople(await opts.fetchHtml(mdlSearchUrl(p.realName))).filter(
      (c) => c.path !== "/people/top",
    );
  }

  // Дальше третьего кандидата не смотрим: если человека нет в первой
  // тройке выдачи по его же имени, его там, скорее всего, нет вовсе —
  // а каждая проверка это лишняя страница у чужого сайта.
  for (const cand of candidates.slice(0, 3)) {
    await sleep(opts.delayMs);
    const url = absMdlUrl(cand.path);
    try {
      const person = parseMdlPersonPage(await opts.fetchHtml(url), url);
      if (verify(person)) return { person, url };
    } catch {
      // Кандидат не разобрался — пробуем следующего.
    }
  }
  return null;
}

/**
 * Досбор одной карточки. Не бросает на «не нашли» — это обычный исход
 * (`matched: false`), а не сбой; бросает только на сетевых ошибках и
 * остановке прогона.
 */
export async function syncPerformerFromMdl(
  performer: PerformerForSync,
  opts: {
    fetchHtml: (url: string) => Promise<string>;
    resolveDrama: DramaResolver;
    delayMs?: number;
  },
): Promise<PerformerSyncOutcome> {
  const delayMs = opts.delayMs ?? PERFORMER_SYNC_DELAY_MS;
  const found = await findPerson(performer, { ...opts, delayMs });

  if (!found) {
    // Отметку ставим и ненайденным — иначе следующая пачка начнёт с
    // них же и обход никогда не сдвинется (см. MISSING_BIO_WHERE).
    await prisma.performer.update({
      where: { id: performer.id },
      data: { mdlSyncedAt: new Date() },
    });
    return { matched: false, url: null, filled: [], linksAdded: 0, rolesSet: 0 };
  }

  const { person, url } = found;
  const filled: string[] = [];
  const realNameFromMdl =
    person.firstName && person.familyName ? `${person.firstName} ${person.familyName}` : null;

  // downloadRemoteImage не бросает: не скачалось — вернёт исходный
  // адрес, и в карточке останется внешняя ссылка (так же ведут себя
  // остальные импортёры).
  const photoUrl =
    !performer.photoUrl && person.photoUrl
      ? await downloadRemoteImage(person.photoUrl, "mdl")
      : null;

  if (!performer.bio && person.bio) filled.push("биография");
  if (!performer.realName && realNameFromMdl) filled.push("настоящее имя");
  if (!performer.birthDate && person.born) filled.push("дата рождения");
  if (photoUrl) filled.push("фото");

  await prisma.performer.update({
    where: { id: performer.id },
    data: {
      mydramalistUrl: url,
      // Эти три у MDL точнее наших заготовок — обновляем всегда.
      alsoKnownAs: person.alsoKnownAs,
      nationality: person.nationality,
      gender: person.gender,
      ...(performer.bio || !person.bio ? {} : { bio: person.bio }),
      ...(performer.realName || !realNameFromMdl ? {} : { realName: realNameFromMdl }),
      ...(performer.birthDate || !person.born ? {} : { birthDate: person.born }),
      ...(photoUrl ? { photoUrl } : {}),
      mdlSyncedAt: new Date(),
    },
  });

  // Соцссылки: дописываем только недостающие платформы — второй
  // инстаграм в карточке никому не нужен.
  let linksAdded = 0;
  const havePlatforms = new Set(
    performer.links.map((l) => detectSocialPlatform(l.url)).filter(Boolean),
  );
  for (const link of person.socialLinks) {
    const platform = detectSocialPlatform(link);
    if (!platform || havePlatforms.has(platform)) continue;
    havePlatforms.add(platform);
    await prisma.performerLink.create({
      data: { performerId: performer.id, label: SOCIAL_PLATFORM_LABELS[platform], url: link },
    });
    linksAdded += 1;
  }

  // Фильмография: роли у известных нам сериалов и недостающие связи.
  // Сериалов, которых нет в каталоге, НЕ заводим — см. шапку файла.
  let rolesSet = 0;
  const seen = new Set<string>();
  for (const row of person.filmography) {
    const dramaId = opts.resolveDrama(row.mdlPath, row.title);
    if (!dramaId || seen.has(dramaId) || !row.role) continue;
    seen.add(dramaId);
    await prisma.performerDrama.upsert({
      where: { performerId_dramaId: { performerId: performer.id, dramaId } },
      create: { performerId: performer.id, dramaId, role: row.role },
      update: { role: row.role },
    });
    rolesSet += 1;
  }

  return { matched: true, url, filled, linksAdded, rolesSet };
}

export type PerformerBioRunResult = {
  checked: number;
  /** Кому дописали биографию — ради чего обход и затеян. */
  bios: number;
  /** Кого не нашли на MDL: их карточки останутся пустыми. */
  notFound: number;
  failed: number;
  linksAdded: number;
  rolesSet: number;
  /** Сколько осталось в очереди ПОСЛЕ пачки — по нему планировщик
   *  решает, брать ли следующую. */
  remaining: number;
  /** Прервались раньше времени: MDL перестал отдавать страницы. */
  abortedAfter: string | null;
};

/**
 * Пачка обхода: берёт из очереди limit человек и проходит их по
 * одному. Сначала те, у кого ссылка на MDL уже есть — им нужна одна
 * страница и опознание не требуется; поиск по имени идёт следом.
 *
 * Страницы — через `MdlRunFetcher`: обычным fetch'ем, а если MDL
 * закрылся Cloudflare-проверкой, ОДНИМ браузером на всю пачку.
 */
export async function refreshMissingPerformerBios(opts: {
  runId?: string | null;
  onProgress?: (message: string) => void;
  limit?: number;
  /** Тестовый шов: подсунуть страницы без похода на MDL. */
  fetchHtml?: (url: string) => Promise<string>;
  /** Пауза между людьми; в тестах 0. */
  delayMs?: number;
}): Promise<PerformerBioRunResult> {
  const limit = opts.limit ?? PERFORMER_SYNC_BATCH;
  const delayMs = opts.delayMs ?? PERFORMER_SYNC_DELAY_MS;

  const performers = (await prisma.performer.findMany({
    where: MISSING_BIO_WHERE,
    select: PERFORMER_SELECT,
    // Со ссылкой — вперёд: одна страница вместо поиска по трём
    // кандидатам, и результат достовернее.
    orderBy: [{ mydramalistUrl: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    take: limit,
  })) as PerformerForSync[];

  const result: PerformerBioRunResult = {
    checked: 0,
    bios: 0,
    notFound: 0,
    failed: 0,
    linksAdded: 0,
    rolesSet: 0,
    remaining: 0,
    abortedAfter: null,
  };
  let streak = 0;

  const resolveDrama = await buildDramaResolver();
  const fetcher = opts.fetchHtml ? null : new MdlRunFetcher({ onNotice: opts.onProgress });
  const fetchHtml = opts.fetchHtml ?? fetcher!.fetchHtml;

  try {
    for (const [i, p] of performers.entries()) {
      await checkImportCancelled(opts.runId);
      if (i > 0 && delayMs > 0) await sleep(delayMs);
      opts.onProgress?.(`Смотрим ${i + 1} из ${performers.length}: ${p.name}`);
      result.checked += 1;

      try {
        const res = await syncPerformerFromMdl(p, { fetchHtml, resolveDrama, delayMs });
        streak = 0;
        result.linksAdded += res.linksAdded;
        result.rolesSet += res.rolesSet;
        if (!res.matched) {
          result.notFound += 1;
          continue;
        }
        if (res.filled.includes("биография")) result.bios += 1;
        // В ленту «что спарсено» — только карточки, которые реально
        // изменились: по этим же записям остановка кнопкой считает,
        // сколько успели.
        if (res.filled.length > 0 || res.linksAdded > 0 || res.rolesSet > 0) {
          if (opts.runId) {
            await prisma.importedItem.create({
              data: {
                runId: opts.runId,
                entityType: "performer",
                entityId: p.id,
                action: "updated",
                label: res.filled.length > 0 ? `${p.name}: ${res.filled.join(", ")}` : p.name,
              },
            });
          }
        }
      } catch (e) {
        if (isImportCancelledError(e)) throw e;
        result.failed += 1;
        streak += 1;
        if (streak >= FAILURE_STREAK_LIMIT) {
          result.abortedAfter = `остановились после ${FAILURE_STREAK_LIMIT} ошибок подряд: ${
            e instanceof Error ? e.message : String(e)
          }`;
          break;
        }
      }
    }
  } finally {
    // И на остановке кнопкой: брошенный chromium — это память сервера,
    // которая сама не вернётся.
    await fetcher?.close();
  }

  result.remaining = await prisma.performer.count({ where: MISSING_BIO_WHERE });
  return result;
}

/** Сводка для журнала импортов и расписания. */
export function summarizePerformerBioRun(r: PerformerBioRunResult): string {
  return (
    `посмотрели ${r.checked}, биографий +${r.bios}, не нашли ${r.notFound}, ошибок ${r.failed}` +
    (r.linksAdded ? `, соцссылок +${r.linksAdded}` : "") +
    (r.rolesSet ? `, ролей +${r.rolesSet}` : "") +
    (r.remaining ? `, осталось ${r.remaining}` : ", очередь пуста") +
    (r.abortedAfter ? ` · ${r.abortedAfter}` : "")
  );
}
