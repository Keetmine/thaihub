import { prisma } from "@/lib/prisma";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import { importMdlPerformer } from "@/lib/mdlPerformerImport";
import { absMdlUrl, type MdlCastMember } from "@/lib/mydramalist";

// Привязка каста со страницы сериала к карточкам исполнителей.
//
// Отдельным модулем, а не внутри mdlDramaImport: дозаполнение карточки
// делает `importMdlPerformer`, а тот сам зовёт `upsertDramaFromMdl` для
// фильмографии — сложи это в один файл, и получится кольцо импортов.
// Пользуются им и одиночный импорт сериала из /admin/imports, и массовый
// со страницы поиска, но с разными правилами отбора (см. `scope`).

export type MdlCastLinkResult = {
  linked: number;
  createdPerformers: number;
  enriched: number;
  enrichFailed: number;
  /** Не взяли по правилу отбора: гостевая роль или незнакомый нам актёр
   *  второго плана. Ноль в массовом прогоне означал бы, что фильтр не
   *  сработал. */
  skipped: number;
};

export type MdlCastLinkOptions = {
  runId: string;
  /**
   * Кого берём из каста:
   *
   * - `all` — весь разобранный каст. Одиночный импорт сериала: человек
   *   вставил ссылку руками, и состав ему нужен целиком.
   * - `main-and-known-support` — главные роли целиком (незнакомых
   *   заводим), второй план ТОЛЬКО если актёр у нас уже есть и привязан
   *   хотя бы к одному агентству, гостевые роли не берём вовсе.
   *   Правило про агентство — ради стоимости прогона: незнакомого актёра
   *   второго плана пришлось бы заводить со страницы MDL, а это
   *   отдельный поход на чужой сайт на каждого, и на сотне сериалов
   *   счёт пошёл бы на сотни запросов. Проверка идёт только по нашей
   *   базе.
   */
  scope: "all" | "main-and-known-support";
  /** Дозаполнять карточки актёров их страницами на MDL. Это отдельная
   *  страница на каждого — в массовом прогоне выключено. */
  enrich: boolean;
};

/** Страховка от очень длинных кастов: каждая карточка — это отдельная
 *  страница MDL, а она может открываться через браузер и занимать
 *  десятки секунд. */
const ENRICH_LIMIT = 20;

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Привязка каста со страницы сериала. Актёра ищем сначала по ссылке на
 * MDL (точное совпадение), потом по имени; если не нашли — заводим
 * карточку-заготовку с именем и ссылкой. Заготовку потом дозаполнит
 * обычный импорт актёра — а так каст сериала оставался бы пустым, ради
 * чего всё и затевалось. Роли не перезаписываем: связь уже есть —
 * пропускаем.
 */
export async function linkMdlCast(
  dramaId: string,
  cast: MdlCastMember[],
  opts: MdlCastLinkOptions,
): Promise<MdlCastLinkResult> {
  let linked = 0;
  let createdPerformers = 0;
  let enriched = 0;
  let enrichFailed = 0;
  let skipped = 0;
  const staleBefore = new Date(Date.now() - STALE_MS);
  const selective = opts.scope === "main-and-known-support";

  for (const member of cast) {
    // Между актёрами даём остановить прогон: каст большой, ждать конца
    // ради отмены неразумно.
    await checkImportCancelled(opts.runId);

    // Гостевые роли отсекаем до запроса в БД — их не берём ни при каких
    // условиях.
    if (selective && member.roleType !== "Main Role" && member.roleType !== "Support Role") {
      skipped += 1;
      continue;
    }

    const mdlUrl = absMdlUrl(member.mdlPath);
    let performer = await prisma.performer.findFirst({
      where: {
        OR: [
          { mydramalistUrl: mdlUrl },
          { name: { equals: member.name, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        photoUrl: true,
        bio: true,
        realName: true,
        birthDate: true,
        mdlSyncedAt: true,
        _count: { select: { links: true, agencies: true } },
      },
    });

    // Второй план в массовом прогоне — только «свои»: актёр уже в
    // каталоге И состоит в агентстве. Незнакомого не заводим и на MDL
    // за ним не идём.
    if (selective && member.roleType === "Support Role") {
      if (!performer || performer._count.agencies === 0) {
        skipped += 1;
        continue;
      }
    }

    let isNew = false;

    if (!performer) {
      const created = await prisma.performer.create({
        data: { name: member.name, mydramalistUrl: mdlUrl },
        select: { id: true },
      });
      performer = {
        id: created.id,
        photoUrl: null,
        bio: null,
        realName: null,
        birthDate: null,
        mdlSyncedAt: null,
        _count: { links: 0, agencies: 0 },
      };
      isNew = true;
      createdPerformers += 1;
      await prisma.importedItem.create({
        data: {
          runId: opts.runId,
          entityType: "performer",
          entityId: created.id,
          action: "created",
          label: member.name,
        },
      });
    }

    // Дозаполняем карточку со страницы актёра — и заведённую только что,
    // и давнюю, если в ней чего-то не хватает. Полную и недавно
    // синхронизированную не трогаем: импорт всё равно пишет только в
    // пустые поля, а страница грузится долго.
    const incomplete =
      !performer.photoUrl ||
      !performer.bio ||
      !performer.realName ||
      !performer.birthDate ||
      performer._count.links === 0;
    const stale = !performer.mdlSyncedAt || performer.mdlSyncedAt < staleBefore;
    if (opts.enrich && (isNew || (incomplete && stale)) && enriched + enrichFailed < ENRICH_LIMIT) {
      try {
        await importMdlPerformer(mdlUrl, performer.id, opts.runId);
        await prisma.performer.update({
          where: { id: performer.id },
          data: { mdlSyncedAt: new Date() },
        });
        enriched += 1;
      } catch (e) {
        // Отмену пробрасываем, всё остальное — не повод ронять импорт
        // сериала: связь с актёром уже есть, карточку дозаполним позже.
        if (isImportCancelledError(e)) throw e;
        enrichFailed += 1;
      }
    }

    const already = await prisma.performerDrama.findUnique({
      where: { performerId_dramaId: { performerId: performer.id, dramaId } },
      select: { dramaId: true },
    });
    if (already) continue;

    await prisma.performerDrama.create({
      data: { performerId: performer.id, dramaId, role: member.role },
    });
    linked += 1;
  }

  return { linked, createdPerformers, enriched, enrichFailed, skipped };
}
