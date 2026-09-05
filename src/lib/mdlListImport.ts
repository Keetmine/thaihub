import type { WatchStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { MdlRunFetcher } from "@/lib/mdlClient";
import { upsertMdlDramaRequests, type MdlRequestRow } from "@/lib/mdlDramaRequests";
import { absMdlUrl, mdlIdFromUrl, MdlHttpError } from "@/lib/mydramalist";

// Пользовательский импорт списка просмотра с MyDramaList
// (https://mydramalist.com/dramalist/<ник>) — статусы и прогресс серий
// переезжают в наш DramaWatchStatus. Запускается из настроек аккаунта
// (src/app/(public)/account/settings/), фича бесплатная — статусы
// просмотра у нас не за подпиской.
//
// Обычный модуль БЕЗ "use server" — как ownLocation.ts: снаружи функции
// не вызвать, userId сюда передают только экшены, уже проверившие
// сессию через getCurrentUser.
//
// Как устроена страница dramalist (сентябрь 2026):
// - GET /dramalist/<ник> отдаёт Vue-виджет: window.dramalist_json с
//   настройками (в т.ч. "load_more":true и код текущей вкладки
//   "filters":{"list":"N"}) и таблицу до 100 строк `<tr id="ml<id>">`;
// - у каждого статуса своя подстраница: /watching, /completed,
//   /on_hold, /dropped, /plan_to_watch (+ /undecided и /not_interested,
//   которые мы НЕ берём — см. STATUS_SECTIONS);
// - строки дальше сотой виджет докачивает POST'ом на /dramalist/<ник>
//   с JSON-телом {"page":N,"filters":{"list":"<код>"}} — ответ приходит
//   HTML-фрагментом той же таблицы (см. postMdlHtmlPlain и
//   MdlRunFetcher.postHtml).
//
// В строке таблицы: ссылка на тайтл `<a … class="title" href="/801612-…">`,
// и прогресс `<span class="num-seen …">7</span>/<span class="num-total">10</span>`.
// Колонка статуса есть только на общей вкладке — мы ходим по
// подстраницам, где статус задан самой страницей.

// ---------- разбор входа ----------

const NICK_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Ник из ссылки на список (`https://mydramalist.com/dramalist/<ник>[/...]`,
 * можно без схемы). null — не разобрали. Голый ник больше не принимаем:
 * отображаемое имя на MDL и ник в адресе часто не совпадают, и люди
 * вставляли имя профиля — импорт падал на «список не найден». Ссылку
 * человек копирует из адресной строки, там ник всегда верный.
 * Валидация жёсткая (^[A-Za-z0-9_-]+$ и только хост mydramalist.com):
 * из ника строится URL запроса, и ничего, кроме страницы списка на MDL,
 * из этой формы запросить нельзя (SSRF).
 */
export function parseMdlListInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.hostname !== "mydramalist.com" && u.hostname !== "www.mydramalist.com") return null;
    const m = u.pathname.match(/^\/dramalist\/([^/]+)/);
    return m && NICK_RE.test(m[1]) ? m[1] : null;
  } catch {
    return null;
  }
}

// ---------- разбор страницы ----------

export type MdlListRow = {
  /** "/801612-be-my-player-two" — тот же вид пути, что у импорта сериала. */
  mdlPath: string;
  title: string;
  /** Сколько серий отмечено («7» из «7/10»); null — не разобрали. */
  seen: number | null;
};

/**
 * Строки списка из HTML — работает и на полной странице, и на
 * фрагменте от POST-подгрузки (там та же таблица без обвязки).
 *
 * Разбор «по якорям», как у каста в mydramalist.ts: граница строки —
 * `<tr id="ml<id>">`, внутри неё ссылка с классом `title` (порядок
 * атрибутов у MDL плавает, поэтому тег ловим по классу, а href и
 * текст достаём отдельно) и счётчик `num-seen`.
 */
export function parseMdlListRows(html: string): MdlListRow[] {
  const out: MdlListRow[] = [];
  for (const m of html.matchAll(/<tr id="ml\d+">([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const link = row.match(/<a\b[^>]*\bclass="[^"]*\btitle\b[^"]*"[^>]*>/)?.[0];
    if (!link) continue;
    const href = link.match(
      /href="(?:https?:\/\/(?:www\.)?mydramalist\.com)?(\/\d+-[^"#?]*)"/,
    )?.[1];
    if (!href) continue;
    // Название — из атрибута title ссылки (там оно без разметки); текст
    // ссылки — запасной путь на случай, если атрибут уберут.
    const title =
      link.match(/title="([^"]+)"/)?.[1]?.trim() ||
      row.match(/<a\b[^>]*\bclass="[^"]*\btitle\b[^"]*"[^>]*>\s*(?:<span[^>]*>)?([^<]+)/)?.[1]?.trim() ||
      "";
    if (!title) continue;
    const seenRaw = row.match(/class="num-seen[^"]*">\s*(\d+)\s*</)?.[1];
    out.push({
      mdlPath: href,
      title: title.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'),
      seen: seenRaw != null ? Number(seenRaw) : null,
    });
  }
  return out;
}

export type MdlListDoc = {
  rows: MdlListRow[];
  /** Код вкладки из window.dramalist_json ("filters":{"list":"N"}) —
   *  его же виджет шлёт в POST-подгрузку. null — конфиг не нашли. */
  listId: string | null;
  /** Есть ли строки дальше сотой ("load_more":true в конфиге). */
  loadMore: boolean;
};

/** Полная страница /dramalist/<ник>/<статус>: строки + параметры
 *  подгрузки. Бросает, если на странице нет ни таблицы, ни конфига —
 *  так выглядят приватный список и неожиданная вёрстка. */
export function parseMdlListDoc(html: string): MdlListDoc {
  const hasConfig = html.includes("dramalist_json");
  const hasTable = /<table class="msv2-table/.test(html);
  if (!hasConfig && !hasTable) {
    throw new MdlListUnavailableError();
  }
  return {
    rows: parseMdlListRows(html),
    listId: html.match(/"filters":\{[^{}]*"list":"(\d+)"/)?.[1] ?? null,
    loadMore: /"load_more":true/.test(html),
  };
}

/** Список не отдался: у пользователя он приватный, или вёрстка MDL
 *  разъехалась. Для формы это один и тот же ответ — «список недоступен». */
export class MdlListUnavailableError extends Error {
  readonly kind = "unavailable";
  constructor() {
    super("Список недоступен — возможно, он приватный");
    this.name = "MdlListUnavailableError";
  }
}

/** Ника на MDL нет (страница списка ответила 404). */
export class MdlListNotFoundError extends Error {
  readonly kind = "not-found";
  constructor() {
    super("Список не найден — проверьте ссылку");
    this.name = "MdlListNotFoundError";
  }
}

// ---------- статусы ----------

/**
 * Подстраницы статусов MDL → наш WatchStatus. Все пять наших статусов
 * есть у MDL один в один (включая Dropped → DROPPED). Ещё две вкладки
 * MDL не берём намеренно: Undecided (человек сам не решил — статусом
 * это не является) и Not Interested (это «скрыть из рекомендаций», а
 * не статус просмотра; аналога у нас нет и не надо).
 */
export const MDL_STATUS_SECTIONS: ReadonlyArray<{ slug: string; status: WatchStatus }> = [
  { slug: "watching", status: "WATCHING" },
  { slug: "completed", status: "COMPLETED" },
  { slug: "on_hold", status: "ON_HOLD" },
  { slug: "dropped", status: "DROPPED" },
  { slug: "plan_to_watch", status: "PLAN_TO_WATCH" },
];

// ---------- сам импорт ----------

export type MdlListNotFoundRow = { title: string; url: string };

export type MdlListImportReport = {
  nick: string;
  /** Всего строк в пяти статусах списка (без Undecided/Not Interested). */
  totalRows: number;
  /** Совпало с каталогом и записано. */
  matched: number;
  byStatus: Partial<Record<WatchStatus, number>>;
  /** Кого у нас нет — названия со ссылками на MDL. Эти же строки ушли
   *  заявками в MdlDramaRequest: владелец импортирует их из админки, и
   *  просившему допишется статус и придёт уведомление DRAMA_ADDED. */
  notFound: MdlListNotFoundRow[];
};

const PAGE_SIZE = 100;
/** Потолок подгрузки на один статус: 30 страниц = 3000 тайтлов. Больше —
 *  это уже не «перенести свой список», а обход чужого сайта. */
const MAX_PAGES_PER_STATUS = 30;
/** Пауза между запросами к MDL — чужой сайт, не душим. */
const PAGE_PAUSE_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Скачивает список пользователя и записывает статусы. Экспортирована
 * для прогонов через tsx; из веба зовите startMdlListImport — там
 * очередь, лимит частоты и состояние для поллинга.
 *
 * Правила записи (решение владельца):
 * - строки списка ПЕРЕЗАПИСЫВАЮТ наш статус: источник правды — то, что
 *   человек попросил импортировать;
 * - сериалы, которых в списке нет, не трогаются;
 * - повторный импорт идемпотентен (upsert по (userId, dramaId));
 * - прогресс серий пишется, только если у нас известно число серий и
 *   отмеченное не больше его — иначе просто статус (счётчик у
 *   «Просмотрено» и так рисуется как n из n, см. episodeProgress);
 * - колокольчик notifyEpisodes ведёт себя как при ручной смене статуса
 *   (favorites/actions.ts): при СМЕНЕ статуса включается для WATCHING и
 *   гаснет для остальных, при том же статусе не трогается.
 *
 * Матчинг — ТОЛЬКО точный по числовому id из адреса MDL (как
 * findDramaForMdlPage): никакого угадывания по названию, ненайденное
 * уходит в отчёт списком.
 */
export async function runMdlListImport(
  userId: string,
  nick: string,
  opts: { onProgress?: (pages: number, rows: number) => void } = {},
): Promise<MdlListImportReport> {
  if (!NICK_RE.test(nick)) throw new Error("Некорректный ник");

  const fetcher = new MdlRunFetcher();
  const rowsByStatus = new Map<WatchStatus, MdlListRow[]>();
  let pages = 0;
  let rowsSeen = 0;
  const bump = (n: number) => {
    pages += 1;
    rowsSeen += n;
    opts.onProgress?.(pages, rowsSeen);
  };

  try {
    for (const section of MDL_STATUS_SECTIONS) {
      const pageUrl = `https://mydramalist.com/dramalist/${nick}/${section.slug}`;
      let doc: MdlListDoc;
      try {
        doc = parseMdlListDoc(await fetcher.fetchHtml(pageUrl));
      } catch (e) {
        if (e instanceof MdlHttpError && e.status === 404) throw new MdlListNotFoundError();
        throw e;
      }
      const rows = [...doc.rows];
      bump(doc.rows.length);

      // Подгрузка хвоста тем же POST'ом, что у виджета. Конец понимаем
      // по неполной странице: во фрагментах флага load_more нет.
      let page = 1;
      let lastCount = doc.rows.length;
      while (
        doc.loadMore &&
        doc.listId &&
        lastCount >= PAGE_SIZE &&
        page < MAX_PAGES_PER_STATUS
      ) {
        page += 1;
        await sleep(PAGE_PAUSE_MS);
        const fragment = await fetcher.postHtml(
          `https://mydramalist.com/dramalist/${nick}`,
          {
            page,
            sort_by: "title",
            sort_order: "asc",
            filters: {
              search: "",
              list: doc.listId,
              country: "",
              type: "",
              category: "",
              tags: [],
              genres: [],
            },
            roll_dice: null,
          },
          pageUrl,
        );
        const more = parseMdlListRows(fragment);
        rows.push(...more);
        lastCount = more.length;
        bump(more.length);
        if (more.length === 0) break;
      }

      rowsByStatus.set(section.status, rows);
      await sleep(PAGE_PAUSE_MS);
    }
  } finally {
    await fetcher.close().catch(() => {});
  }

  // ---------- матчинг по каноническому mdl-id ----------

  // Один проход по каталогу вместо запроса на строку: у прогона сотни
  // строк, а записей с MDL-адресом — тысячи, и выбрать три поля разом
  // дешевле, чем 300 раз ходить в базу с `contains`.
  const catalog = await prisma.drama.findMany({
    where: { OR: [{ mdlUrl: { not: null } }, { mydramalistUrl: { not: null } }] },
    select: { id: true, mdlUrl: true, mydramalistUrl: true, episodes: true },
  });
  const byMdlId = new Map<string, (typeof catalog)[number]>();
  for (const d of catalog) {
    for (const u of [d.mdlUrl, d.mydramalistUrl]) {
      const id = u ? mdlIdFromUrl(u) : null;
      if (id && !byMdlId.has(id)) byMdlId.set(id, d);
    }
  }

  const report: MdlListImportReport = {
    nick,
    totalRows: 0,
    matched: 0,
    byStatus: {},
    notFound: [],
  };

  type Write = { dramaId: string; status: WatchStatus; episodesWatched: number | null };
  const writes = new Map<string, Write>(); // dramaId → запись
  const seenMdlIds = new Set<string>();
  // Ненайденное уходит заявками в MdlDramaRequest — вместе с желаемым
  // статусом и прогрессом, чтобы при появлении сериала дописать их юзеру.
  const missing: MdlRequestRow[] = [];

  for (const section of MDL_STATUS_SECTIONS) {
    for (const row of rowsByStatus.get(section.status) ?? []) {
      const mdlId = mdlIdFromUrl(row.mdlPath);
      if (!mdlId || seenMdlIds.has(mdlId)) continue;
      seenMdlIds.add(mdlId);
      report.totalRows += 1;

      const drama = byMdlId.get(mdlId);
      if (!drama) {
        report.notFound.push({ title: row.title, url: absMdlUrl(row.mdlPath) });
        missing.push({
          mdlUrl: row.mdlPath,
          title: row.title,
          status: section.status,
          seen: row.seen,
        });
        continue;
      }
      const episodesOk =
        drama.episodes != null &&
        row.seen != null &&
        row.seen >= 0 &&
        row.seen <= drama.episodes;
      writes.set(drama.id, {
        dramaId: drama.id,
        status: section.status,
        episodesWatched: episodesOk ? row.seen : null,
      });
      report.matched += 1;
      report.byStatus[section.status] = (report.byStatus[section.status] ?? 0) + 1;
    }
  }

  // ---------- запись ----------

  const current = await prisma.dramaWatchStatus.findMany({
    where: { userId, dramaId: { in: [...writes.keys()] } },
    select: { dramaId: true, status: true },
  });
  const currentStatus = new Map(current.map((c) => [c.dramaId, c.status]));

  for (const w of writes.values()) {
    const statusChanged = currentStatus.get(w.dramaId) !== w.status;
    await prisma.dramaWatchStatus.upsert({
      where: { userId_dramaId: { userId, dramaId: w.dramaId } },
      update: {
        status: w.status,
        // Прогресс без верхней границы не пишем: «иначе просто статус».
        ...(w.episodesWatched != null ? { episodesWatched: w.episodesWatched } : {}),
        ...(statusChanged ? { notifyEpisodes: w.status === "WATCHING" } : {}),
      },
      create: {
        userId,
        dramaId: w.dramaId,
        status: w.status,
        episodesWatched: w.episodesWatched,
        notifyEpisodes: w.status === "WATCHING",
      },
    });
  }

  // Заявки «добавьте сериал»: дедуп по mdlUrl, юзер добавляется к
  // существующей. Владелец импортирует их из /admin/imports, и заявка
  // резолвится сама (см. mdlDramaRequests.ts).
  if (missing.length > 0) {
    await upsertMdlDramaRequests(userId, missing);
  }

  return report;
}

// ---------- запуск из веба: очередь, лимит, состояние ----------

export type MdlListRunState =
  | { state: "running"; startedAt: number; pages: number; rows: number }
  | { state: "done"; finishedAt: number; report: MdlListImportReport }
  | {
      state: "error";
      finishedAt: number;
      /** Ключ для словаря, когда причина типовая; иначе показываем message. */
      errorKey: "listNotFound" | "listUnavailable" | null;
      message: string;
    };

// In-memory, как rateLimit.ts: процесс один (single-container deploy).
// После рестарта сервера состояние теряется — поллинг тогда честно
// отвечает null, и форма предлагает попробовать снова.
const runs = new Map<string, MdlListRunState>();
const lastStartAt = new Map<string, number>();

/** Не чаще одного запуска в 10 минут на пользователя — импорт ходит по
 *  чужому сайту десятком запросов, и кнопка не должна это умножать.
 *  Считается только для прогонов, которые дошли до конца: упавший
 *  (не та ссылка, приватный список, MDL не ответил) окно не занимает,
 *  иначе человек после опечатки ждал бы 10 минут, чтобы её исправить. */
const USER_COOLDOWN_MS = 10 * 60 * 1000;

// Глобальная очередь на ОДИН прогон за раз (как mapsBrowserQueue в
// ownLocation.ts): десять пользователей не должны поднять десять
// chromium'ов — при Cloudflare-заглушке каждый прогон держит свой.
let importQueue: Promise<unknown> = Promise.resolve();

export type StartMdlListImportResult =
  | { ok: true }
  | { ok: false; errorKey: "rateLimited" | "alreadyRunning" };

/**
 * Ставит импорт списка в очередь и сразу возвращается — сам прогон идёт
 * в фоне (fire-and-forget, как импорты в /admin/imports), ход и итог
 * форма забирает поллингом getMdlListRunState.
 */
export function startMdlListImport(userId: string, nick: string): StartMdlListImportResult {
  const running = runs.get(userId);
  if (running?.state === "running") return { ok: false, errorKey: "alreadyRunning" };

  const last = lastStartAt.get(userId);
  if (last != null && Date.now() - last < USER_COOLDOWN_MS) {
    return { ok: false, errorKey: "rateLimited" };
  }
  lastStartAt.set(userId, Date.now());
  // Память ограничена, как в rateLimit.ts: чистим отработавшие окна.
  for (const [k, at] of lastStartAt) {
    if (Date.now() - at >= USER_COOLDOWN_MS && runs.get(k)?.state !== "running") {
      lastStartAt.delete(k);
    }
  }

  runs.set(userId, { state: "running", startedAt: Date.now(), pages: 0, rows: 0 });

  const task = importQueue.then(async () => {
    try {
      const report = await runMdlListImport(userId, nick, {
        onProgress: (pages, rows) => {
          const cur = runs.get(userId);
          if (cur?.state === "running") runs.set(userId, { ...cur, pages, rows });
        },
      });
      runs.set(userId, { state: "done", finishedAt: Date.now(), report });
    } catch (e) {
      const errorKey =
        e instanceof MdlListNotFoundError
          ? ("listNotFound" as const)
          : e instanceof MdlListUnavailableError
            ? ("listUnavailable" as const)
            : null;
      runs.set(userId, {
        state: "error",
        finishedAt: Date.now(),
        errorKey,
        message: e instanceof Error ? e.message : String(e),
      });
      // Упавший прогон окно не занимает — можно сразу исправить ссылку.
      lastStartAt.delete(userId);
    }
  });
  importQueue = task.catch(() => {});
  return { ok: true };
}

/** Текущее состояние прогона пользователя; null — прогона нет (или
 *  сервер перезапустили, и in-memory состояние пропало). */
export function getMdlListRunState(userId: string): MdlListRunState | null {
  return runs.get(userId) ?? null;
}
