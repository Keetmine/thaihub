import type { WatchStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { canonicalMdlUrl, mdlIdFromUrl } from "@/lib/mydramalist";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

// Заявки «добавьте сериал» (MdlDramaRequest): ненайденные строки
// пользовательского импорта списка MDL копятся здесь, владелец видит их
// в /admin/imports и запускает точечный импорт. Когда сериал с этой
// страницей появляется в каталоге ЛЮБЫМ путём — кнопкой из заявки,
// обычным админским импортом, прогоном по странице поиска — хук в
// upsertDramaFromMdl зовёт resolveMdlDramaRequests: просившим
// дописывается их статус из списка (НЕ перетирая уже заведённый руками)
// и уходит уведомление DRAMA_ADDED со ссылкой на сериал.
// См. docs/features/mydramalist-import.md, раздел про заявки.

export type MdlRequestRow = {
  /** Путь или полный адрес страницы MDL — нормализуется здесь. */
  mdlUrl: string;
  title: string;
  /** Желаемый статус из списка пользователя. */
  status: WatchStatus;
  /** Отмеченный прогресс серий; null — не отмечал. */
  seen: number | null;
};

/**
 * Ненайденные строки импорта списка → заявки. Дедуп по каноническому
 * mdlUrl: сериал могли просить несколько людей, юзер добавляется к
 * существующей заявке. Повторный импорт того же юзера освежает его
 * статус в заявке (последняя просьба — актуальная).
 *
 * Отклонённые владельцем заявки (rejectedAt) не воскрешаются и юзеров
 * не копят: мусорная ссылка остаётся разобранной. Уже РЕЗОЛВНУТАЯ
 * заявка сюда не попадёт вовсе — раз сериал в каталоге, строка списка
 * совпала бы при матчинге.
 */
export async function upsertMdlDramaRequests(
  userId: string,
  rows: MdlRequestRow[],
): Promise<void> {
  for (const row of rows) {
    const mdlUrl = canonicalMdlUrl(row.mdlUrl);
    const existing = await prisma.mdlDramaRequest.findUnique({
      where: { mdlUrl },
      select: { id: true, rejectedAt: true },
    });
    if (existing?.rejectedAt) continue;

    const request =
      existing ??
      (await prisma.mdlDramaRequest.upsert({
        where: { mdlUrl },
        create: { mdlUrl, title: row.title },
        // Гонка двух прогонов: заявка уже есть — этого достаточно.
        update: {},
        select: { id: true, rejectedAt: true },
      }));

    await prisma.mdlDramaRequestUser.upsert({
      where: { requestId_userId: { requestId: request.id, userId } },
      create: {
        requestId: request.id,
        userId,
        status: row.status,
        episodesWatched: row.seen,
      },
      update: { status: row.status, episodesWatched: row.seen },
    });
  }
}

export type MdlRequestResolution = {
  /** Заявок закрыто этим сериалом (обычно 0 или 1). */
  resolved: number;
  /** Скольким юзерам дописали статус (у остальных он уже был). */
  statusesWritten: number;
  /** Скольким ушло уведомление. */
  notified: number;
};

/** Всё, что нужно резолву от только что записанного сериала: ссылка
 *  строится dramaHref (slug ?? id), название локализуется per-получатель. */
type ResolvedDrama = {
  id: string;
  slug: string | null;
  title: string;
  titleRu: string | null;
  episodes: number | null;
};

/**
 * «Сериал с этой страницей MDL появился в каталоге» — закрывает открытые
 * заявки на него. Центральная точка: зовётся из upsertDramaFromMdl, то
 * есть срабатывает на ЛЮБОМ пути появления сериала с mydramalistUrl.
 *
 * Для каждого просившего:
 * - дописываем его статус/прогресс из заявки, НЕ перетирая статус,
 *   который юзер уже завёл сам (createMany + skipDuplicates по PK);
 *   прогресс валидируется против Drama.episodes тем же правилом, что в
 *   runMdlListImport; notifyEpisodes — как при ручной установке
 *   статуса: true только у WATCHING;
 * - уведомляем через notifyUser (DRAMA_ADDED): колокольчик + Telegram по
 *   его настройкам, href — страница сериала.
 *
 * Повторно не шлёт: берутся только открытые заявки (resolvedAt IS NULL),
 * а резолв сразу ставит resolvedAt + notifiedAt. Отклонённые заявки тоже
 * закрываются: раз сериал всё же появился, просившие должны узнать.
 *
 * Ошибок наружу не бросает: уведомление и заявка не должны ронять
 * импорт, который их закрыл.
 */
export async function resolveMdlDramaRequests(
  drama: ResolvedDrama,
  sourceUrl: string,
): Promise<MdlRequestResolution> {
  const result: MdlRequestResolution = { resolved: 0, statusesWritten: 0, notified: 0 };
  try {
    const mdlId = mdlIdFromUrl(sourceUrl);
    if (!mdlId) return result;

    // По числовому id, а не строке целиком: слаг в адресе MDL меняется,
    // id — нет (то же правило, что у findDramaForMdlPage).
    const requests = await prisma.mdlDramaRequest.findMany({
      where: { resolvedAt: null, mdlUrl: { contains: `/${mdlId}-` } },
      include: { users: true },
    });
    if (requests.length === 0) return result;

    for (const request of requests) {
      // Точная сверка id: contains поймал бы и "/123-" внутри "/5123-x".
      if (mdlIdFromUrl(request.mdlUrl) !== mdlId) continue;

      // Статусы — одним createMany: skipDuplicates по PK (userId,
      // dramaId) и есть само правило «не перетирать заведённое руками».
      const created = await prisma.dramaWatchStatus.createMany({
        data: request.users.map((u) => ({
          userId: u.userId,
          dramaId: drama.id,
          status: u.status,
          episodesWatched:
            drama.episodes != null &&
            u.episodesWatched != null &&
            u.episodesWatched >= 0 &&
            u.episodesWatched <= drama.episodes
              ? u.episodesWatched
              : null,
          notifyEpisodes: u.status === "WATCHING",
        })),
        skipDuplicates: true,
      });
      result.statusesWritten += created.count;

      // Получатели одним findMany со всеми полями notifyUser — иначе
      // N+1 (notifyUser сам ходил бы в БД за каждым).
      const users = await prisma.user.findMany({
        where: { id: { in: request.users.map((u) => u.userId) } },
        select: {
          id: true,
          locale: true,
          telegramId: true,
          tgNotifyInvites: true,
          tgNotifyFriends: true,
          tgNotifyReplies: true,
          tgNotifyEvents: true,
          tgNotifyBirthdays: true,
          tgNotifyEpisodes: true,
        },
      });
      for (const user of users) {
        const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
        await notifyUser({
          userId: user.id,
          user,
          kind: "DRAMA_ADDED",
          // Название замораживается на языке получателя — notifyUser
          // локализует фразу, но не данные (как у EPISODE_AIRED).
          subject: dramaTitleForLocale(drama, locale),
          href: dramaHref(drama),
        });
        result.notified += 1;
      }

      await prisma.mdlDramaRequest.update({
        where: { id: request.id },
        data: {
          resolvedAt: new Date(),
          resolvedDramaId: drama.id,
          notifiedAt: new Date(),
        },
      });
      result.resolved += 1;
    }
  } catch (error) {
    // Импорт сериала важнее заявки: не закрылась — закроется следующим
    // импортом той же страницы (resolvedAt так и остался пустым).
    console.error("resolveMdlDramaRequests failed", error);
  }
  return result;
}

/** Открытая (не резолвнутая и не отклонённая) заявка — то, что ждёт
 *  владельца: фильтр общий для списка в /admin/imports и бейджа. */
export const OPEN_MDL_REQUEST_WHERE = { resolvedAt: null, rejectedAt: null } as const;
