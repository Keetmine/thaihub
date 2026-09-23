import { prisma } from "@/lib/prisma";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import { logAudit } from "@/lib/audit";
import { importMdlPerformer } from "@/lib/mdlPerformerImport";
import { sharedDramaResolver, syncPerformerById } from "@/lib/mdlPerformerSync";
import { absMdlUrl, fetchMdlHtmlPlain, type MdlCastMember } from "@/lib/mydramalist";

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
   *   У шоу (Type: TV Program) свои подписи — «Main Host» и «Regular
   *   Member» считаются главным составом, «Guest» — гостевым.
   *   Правило про агентство — ради стоимости прогона: незнакомого актёра
   *   второго плана пришлось бы заводить со страницы MDL, а это
   *   отдельный поход на чужой сайт на каждого, и на сотне сериалов
   *   счёт пошёл бы на сотни запросов. Проверка идёт только по нашей
   *   базе.
   */
  scope: "all" | "main-and-known-support";
  /**
   * Дозаполнять ли карточки актёров их страницами на MDL — это отдельная
   * страница на каждого, поэтому режима три:
   *
   * - `full` — полный импорт актёра (`importMdlPerformer`): карточка И
   *   фильмография с заведением недостающих сериалов. Дорого: каждый
   *   незнакомый тайтл из фильмографии — ещё одна страница. Для
   *   одиночного импорта, куда ссылку вставили руками.
   * - `card` — только карточка (`mdlPerformerSync`): одна страница,
   *   ничего не заводится, проставляются роли у сериалов, которые у нас
   *   уже есть. Для массовых прогонов — ими и заводятся заготовки.
   * - `none` — не ходить вовсе.
   *
   * Массовые прогоны раньше стояли на `none`, и заготовки «имя + ссылка
   * на MDL» копились: 1673 штуки за август-сентябрь 2026 (вопрос
   * владельца: «откуда у нас записи со ссылкой, но без инфы?»). Теперь
   * они на `card` — одна страница на КАЖДОГО ЗАВЕДЁННОГО актёра, не на
   * каждого из состава.
   */
  enrich: "full" | "card" | "none";
  /** Загрузчик страниц прогона (`MdlRunFetcher.fetchHtml`) — чтобы
   *  дозаполнение шло тем же браузером и теми же cookies, что и сам
   *  импорт. Без него страница актёра тянулась бы отдельным запросом и
   *  ловила Cloudflare заново. */
  fetchHtml?: (url: string) => Promise<string>;
};

/** Страховка от очень длинных кастов: каждая карточка — это отдельная
 *  страница MDL, а она может открываться через браузер и занимать
 *  десятки секунд. */
const ENRICH_LIMIT = 20;

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

/** Подписи «главного состава» в селективном отборе: роли сериалов плюс
 *  участие в шоу (у TV Program каст размечен не ролями). */
const MAIN_TIER = new Set(["Main Role", "Main Host", "Regular Member"]);

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
    // условиях. «Main Host» и «Regular Member» — главный состав шоу.
    if (selective && !MAIN_TIER.has(member.roleType ?? "") && member.roleType !== "Support Role") {
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
      // История правок: карточка-заготовка появилась из каста сериала
      // (потом её дозаполнит импорт актёра — у того своя запись).
      await logAudit({
        action: "CREATE",
        entityType: "Performer",
        entityId: created.id,
        entityLabel: member.name,
        note: "каст сериала с MyDramaList",
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

    // Дозаполняем карточку со страницы актёра. В полном режиме — и
    // заведённую только что, и давнюю, если в ней чего-то не хватает
    // (полную и свежую не трогаем: импорт всё равно пишет только в
    // пустые поля, а страница грузится долго). В лёгком — ТОЛЬКО
    // заведённых сейчас: чинить чужие старые пробелы на массовом
    // прогоне значило бы по странице на каждого неполного актёра из
    // каждого состава, а этим занята ночная задача «биографии актёров».
    const incomplete =
      !performer.photoUrl ||
      !performer.bio ||
      !performer.realName ||
      !performer.birthDate ||
      performer._count.links === 0;
    const stale = !performer.mdlSyncedAt || performer.mdlSyncedAt < staleBefore;
    const wanted =
      opts.enrich === "full"
        ? isNew || (incomplete && stale)
        : opts.enrich === "card" && isNew;
    if (wanted && enriched + enrichFailed < ENRICH_LIMIT) {
      try {
        if (opts.enrich === "full") {
          await importMdlPerformer(mdlUrl, performer.id, opts.runId);
          await prisma.performer.update({
            where: { id: performer.id },
            data: { mdlSyncedAt: new Date() },
          });
        } else {
          // Лёгкий досбор сам ставит mdlSyncedAt — и найденному, и
          // ненайденному (см. mdlPerformerSync.ts).
          await syncPerformerById(performer.id, {
            fetchHtml: opts.fetchHtml ?? ((url) => fetchMdlHtmlPlain(url)),
            resolveDrama: await sharedDramaResolver(),
          });
        }
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
