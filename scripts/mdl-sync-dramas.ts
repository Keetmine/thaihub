import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { MdlClient } from "../src/lib/mdlClient";
import {
  parseMdlDramaPage,
  parseMdlSearchTitles,
  mdlSearchUrl,
  mdlIdFromUrl,
  absMdlUrl,
  type MdlRelatedEntry,
} from "../src/lib/mydramalist";
import { downloadRemoteImage } from "../src/lib/localImage";
import { isBlscenePoster } from "../src/lib/blsceneImport";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Массовый проход по всем сериалам каталога: находит страницу на
 * MyDramaList (по сохранённой ссылке или поиском по названию), парсит
 * Details/синопсис/Related Content и обновляет запись. Резюмится по
 * mdlSyncedAt (уже синхронизированные пропускаются), связи Related
 * Content разрешаются в конце прохода.
 *
 *   npx tsx scripts/mdl-sync-dramas.ts [--limit N] [--force] [--from-locations]
 *      [--overwrite-synopsis] [--overwrite-poster] [--fix-blscene-posters] [--dry-run]
 *
 * --from-locations — только сериалы, заведённые парсингом локаций
 *   (`blsceneUrl` заполнен). Отметку `mdlSyncedAt` в этом режиме не
 *   смотрим: заход прицельный, эти записи давно «синхронизированы».
 *   Записи без сохранённого адреса MDL пропускаются и перечисляются в
 *   конце — искать страницу по названию для ПЕРЕЗАПИСИ нельзя, именно
 *   так «Restart» 2026-го однажды и уехал в «Restart» 2021-го.
 *
 * --overwrite-synopsis, --overwrite-poster — брать с MDL, даже если у
 *   нас уже что-то есть. Без них скрипт заполняет только пустые поля и
 *   на записях от blscene не делает ничего: у них заполнено и то и
 *   другое. Флага два, а не один, потому что решения тут разные:
 *   описание с MDL у половины записей ровно то же самое (blscene его
 *   оттуда и берёт), а постеры у нас с TMDB — 500×750, ровно 2:3, как
 *   в вёрстке, — тогда как на MDL они 900×~1125 (соотношение ~0.8) и
 *   втрое тяжелее. Картинка шире рамки, значит `object-fit: cover`
 *   срежет ей бока, примерно по 8% с каждой стороны: решать это
 *   отдельно от описаний.
 *
 * --fix-blscene-posters — заменить постеры, пришедшие со страниц
 *   локаций: `/uploads/blscene/…` либо оставшаяся прямая ссылка на
 *   blscene.com. Это не афиши, а кадры из серий — у SOTUS S пляж из
 *   девятой, 1920×1080. Замена на MDL тут однозначное улучшение, в
 *   отличие от случая с постерами TMDB.
 *
 *   Отбор идёт по ВСЕМУ каталогу, а не только по `--from-locations`:
 *   повторный прогон импорта локаций затирал обложку и сериалам,
 *   заведённым руками (запись искали ещё и по названию), — у таких
 *   `blsceneUrl` пустой, и прицельный отбор их бы не увидел. Причину
 *   починили в `refreshScrapedDrama`, но уже испорченные записи
 *   остались.
 *
 * --dry-run — страницы читаются, в базу и на диск ничего не пишется;
 *   печатает, что бы изменилось.
 *
 * Перед каждой перезаписью прежние описание и постер уходят в файл
 * `private-uploads/mdl-sync-backup-<дата>.json` (постоянный том вне
 * public/). Текст с MDL обычно лучше нашего, но не всегда: у «Only
 * Friends: Dream On» наше описание было конкретнее — про постановку, а
 * не общая аннотация сериала. Такое видно только глазами и уже после,
 * поэтому старое должно откуда-то доставаться. Файл пишется по ходу, а
 * не в конце: прогон может оборваться на середине.
 *
 * Вернуть всё, что перезаписал прогон:
 *   npx tsx scripts/mdl-sync-dramas.ts --restore private-uploads/mdl-sync-backup-….json
 * Возврат можно сузить до одной записи: --only "Only Friends: Dream On".
 */

/** Возвращает описания и постеры из файла страховки. */
async function restore(file: string, only: string | null) {
  const rows: { id: string; title: string; synopsis: string | null; posterUrl: string | null }[] =
    JSON.parse(await readFile(file, "utf8"));
  const wanted = only ? rows.filter((r) => r.title === only) : rows;
  if (wanted.length === 0) {
    console.log(only ? `В файле нет записи «${only}».` : "Файл пуст.");
    return;
  }
  for (const r of wanted) {
    await prisma.drama.update({
      where: { id: r.id },
      data: { synopsis: r.synopsis, posterUrl: r.posterUrl },
    });
    console.log(`  вернул ${r.title}`);
  }
  console.log(`Возвращено записей: ${wanted.length}.`);
}

const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'"“”:!?.,\-–—()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Found = { url: string; mdl: ReturnType<typeof parseMdlDramaPage> };

const THAI_SCRIPT = /[\u0E00-\u0E7F]/;

/**
 * Ищет страницу тайтла. Для латинских названий — точное совпадение
 * нормализованного названия (при нескольких — ближайший год). Для
 * тайских названий результат нельзя сверить по заголовку (MDL отдаёт
 * английский) — верифицируем кандидатов их страницами: Native Title /
 * Also Known As должны содержать наше название.
 */
async function findMdl(
  client: MdlClient,
  title: string,
  year: number | null,
): Promise<Found | null> {
  const html = await client.fetchHtml(mdlSearchUrl(title));
  const results = parseMdlSearchTitles(html);

  if (THAI_SCRIPT.test(title)) {
    for (const r of results.slice(0, 3)) {
      const url = absMdlUrl(r.path);
      await sleep(DELAY_MS);
      try {
        const mdl = parseMdlDramaPage(await client.fetchHtml(url), url);
        const t = title.trim();
        if (mdl.nativeTitle?.trim() === t || (mdl.alsoKnownAs ?? "").includes(t)) {
          return { url, mdl };
        }
      } catch {
        // кандидат не разобрался — пробуем следующего
      }
    }
    return null;
  }

  const target = normTitle(title);
  const exact = results.filter((r) => normTitle(r.title) === target);
  let path: string | null = null;
  if (exact.length === 1) path = exact[0].path;
  else if (exact.length > 1) {
    const byYear = year
      ? exact.find((r) => r.year != null && Math.abs(r.year - year) <= 1)
      : null;
    path = (byYear ?? exact[0]).path;
  } else if (results.length > 0 && year) {
    const near = results.filter(
      (r) => r.year != null && Math.abs(r.year - year) <= 1 && normTitle(r.title).includes(target),
    );
    if (near.length === 1) path = near[0].path;
  }
  if (!path) return null;
  const url = absMdlUrl(path);
  await sleep(DELAY_MS);
  return { url, mdl: parseMdlDramaPage(await client.fetchHtml(url), url) };
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  const force = process.argv.includes("--force");
  const restoreArg = process.argv.indexOf("--restore");
  if (restoreArg >= 0) {
    const onlyArg = process.argv.indexOf("--only");
    return restore(
      process.argv[restoreArg + 1],
      onlyArg >= 0 ? process.argv[onlyArg + 1] : null,
    );
  }
  const fromLocations = process.argv.includes("--from-locations");
  const overwriteSynopsis = process.argv.includes("--overwrite-synopsis");
  const overwritePoster = process.argv.includes("--overwrite-poster");
  const fixBlscenePosters = process.argv.includes("--fix-blscene-posters");
  const overwrite = overwriteSynopsis || overwritePoster || fixBlscenePosters;
  const dryRun = process.argv.includes("--dry-run");

  // Постеры от blscene ищем по всему каталогу: у испорченных записей
  // `blsceneUrl` может быть пустым (см. --fix-blscene-posters).
  const blscenePoster = { posterUrl: { contains: "blscene" } };
  const where = fixBlscenePosters
    ? fromLocations
      ? { AND: [{ blsceneUrl: { not: null } }, blscenePoster] }
      : blscenePoster
    : fromLocations
      ? { blsceneUrl: { not: null } }
      : force
        ? {}
        : { mdlSyncedAt: null };

  const dramas = await prisma.drama.findMany({
    where,
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      year: true,
      mydramalistUrl: true,
      posterUrl: true,
      synopsis: true,
      network: true,
    },
  });
  console.log(`К синхронизации: ${Math.min(dramas.length, limit)} из ${dramas.length}`);
  if (fromLocations) console.log("Отбор: заведённые парсингом локаций.");
  if (overwriteSynopsis) console.log("Описание будет перезаписано с MDL.");
  if (overwritePoster) console.log("Постер будет перезаписан с MDL.");
  if (fixBlscenePosters) console.log("Постеры со страниц локаций будут заменены на MDL.");
  if (dryRun) console.log("Черновой прогон — ничего не сохраняется.");

  const client = new MdlClient();
  await client.init();

  const relatedByDrama: { dramaId: string; related: MdlRelatedEntry[] }[] = [];
  const skippedNoUrl: string[] = [];

  /**
   * Куда сложить прежние значения. Внутри контейнера это постоянный
   * том; локально — просто папка рядом с проектом.
   */
  const backupFile = path.join(
    process.cwd(),
    "private-uploads",
    `mdl-sync-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
  );
  const backup: { id: string; title: string; synopsis: string | null; posterUrl: string | null }[] =
    [];
  async function rememberBefore(row: (typeof dramas)[number]) {
    backup.push({
      id: row.id,
      title: row.title,
      synopsis: row.synopsis,
      posterUrl: row.posterUrl,
    });
    await mkdir(path.dirname(backupFile), { recursive: true });
    await writeFile(backupFile, JSON.stringify(backup, null, 2));
  }
  let done = 0;
  let notFound = 0;
  let failed = 0;

  try {
    for (const drama of dramas.slice(0, Number.isFinite(limit) ? limit : undefined)) {
      try {
        let found: Found | null = null;
        if (drama.mydramalistUrl) {
          const url = drama.mydramalistUrl;
          found = { url, mdl: parseMdlDramaPage(await client.fetchHtml(url), url) };
        } else if (overwrite) {
          // Поиск по названию годится, чтобы ЗАПОЛНИТЬ пустое: ошибся —
          // потеряли немного. Для перезаписи он не годится вовсе: чужая
          // страница затрёт живое описание, и вернуть его будет неоткуда.
          skippedNoUrl.push(`${drama.title} (${drama.year ?? "год неизвестен"})`);
          continue;
        } else {
          found = await findMdl(client, drama.title, drama.year);
        }
        if (!found) {
          notFound += 1;
          // отмечаем, чтобы не искать заново при резюме; ссылки нет
          if (!dryRun) {
            await prisma.drama.update({
              where: { id: drama.id },
              data: { mdlSyncedAt: new Date() },
            });
          }
          console.log(`  [нет на MDL] ${drama.title}`);
          continue;
        }
        const { url, mdl } = found;

        const wantsPoster =
          mdl.posterUrl &&
          (overwritePoster ||
            !drama.posterUrl ||
            (fixBlscenePosters && isBlscenePoster(drama.posterUrl)));
        // Половина описаний с MDL дословно совпадает с нашими — blscene
        // их оттуда и переписал. Переписывать текст тем же текстом
        // незачем: лишний UPDATE и лишняя строка в отчёте.
        const wantsSynopsis =
          mdl.synopsis &&
          (overwriteSynopsis || !drama.synopsis) &&
          mdl.synopsis.trim() !== (drama.synopsis ?? "").trim();

        if (dryRun) {
          const parts = [
            wantsSynopsis
              ? `описание ${drama.synopsis ? `${drama.synopsis.length}→${mdl.synopsis!.length} симв.` : "появится"}`
              : null,
            wantsPoster ? `постер ${drama.posterUrl ? "заменится" : "появится"}` : null,
          ].filter(Boolean);
          console.log(`  ${drama.title}: ${parts.length ? parts.join(", ") : "без изменений"}`);
          done += 1;
          await sleep(DELAY_MS);
          continue;
        }

        // Прежние значения — на диск ДО того, как что-то поменяется, и
        // только когда мы правда затираем непустое поле.
        if ((wantsSynopsis && drama.synopsis) || (wantsPoster && drama.posterUrl)) {
          await rememberBefore(drama);
        }

        // Скачиваем постер только когда он и правда нужен: файл ложится
        // на диск ещё до update, и лишние качать незачем.
        const posterUrl = wantsPoster
          ? await downloadRemoteImage(mdl.posterUrl!, "mdl")
          : undefined;

        await prisma.drama.update({
          where: { id: drama.id },
          data: {
            mydramalistUrl: url,
            nativeTitle: mdl.nativeTitle,
            alsoKnownAs: mdl.alsoKnownAs,
            synopsis: wantsSynopsis ? mdl.synopsis : drama.synopsis,
            director: mdl.director,
            screenwriter: mdl.screenwriter,
            genres: mdl.genres,
            tags: mdl.tags,
            episodes: mdl.episodes,
            airedFrom: mdl.airedFrom,
            airedTo: mdl.airedTo,
            airedOn: mdl.airedOn,
            duration: mdl.duration,
            contentRating: mdl.contentRating,
            mdlScore: mdl.rating,
            network: mdl.network ?? drama.network,
            year: mdl.year ?? drama.year,
            ...(mdl.status ? { status: mdl.status } : {}),
            ...(posterUrl ? { posterUrl } : {}),
            mdlSyncedAt: new Date(),
          },
        });
        if (mdl.related.length > 0) {
          relatedByDrama.push({ dramaId: drama.id, related: mdl.related });
        }
        done += 1;
        if (done % 25 === 0) console.log(`  …${done} готово (${drama.title})`);
      } catch (e) {
        failed += 1;
        console.log(`  [ошибка] ${drama.title}: ${e instanceof Error ? e.message : e}`);
        if (failed > 50 && failed > done) {
          throw new Error("Слишком много ошибок подряд — останавливаюсь");
        }
      }
      await sleep(DELAY_MS);
    }
  } finally {
    await client.close();
  }

  if (skippedNoUrl.length > 0) {
    console.log(`\nПропущено без адреса MDL: ${skippedNoUrl.length}`);
    for (const s of skippedNoUrl) console.log(`  ${s}`);
    console.log("  Впишите им адрес в карточке — и прогоните ещё раз.");
  }

  if (dryRun) {
    console.log(`\nЧерновой прогон: посмотрено ${done}, не найдено ${notFound}, ошибок ${failed}.`);
    console.log("Ничего не сохранено — уберите --dry-run, чтобы применить.");
    return;
  }

  // Related Content → DramaRelation (разрешаем по mdl-id или названию).
  console.log("\nСвязываю Related Content…");
  const all = await prisma.drama.findMany({
    select: { id: true, title: true, mydramalistUrl: true },
  });
  const byMdlId = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const d of all) {
    const mid = d.mydramalistUrl ? mdlIdFromUrl(d.mydramalistUrl) : null;
    if (mid) byMdlId.set(mid, d.id);
    byTitle.set(normTitle(d.title), d.id);
  }
  let links = 0;
  for (const { dramaId, related } of relatedByDrama) {
    for (const rel of related) {
      const relId =
        (mdlIdFromUrl(rel.url) ? byMdlId.get(mdlIdFromUrl(rel.url)!) : undefined) ??
        byTitle.get(normTitle(rel.title));
      if (!relId || relId === dramaId) continue;
      await prisma.dramaRelation.upsert({
        where: { dramaId_relatedId: { dramaId, relatedId: relId } },
        create: { dramaId, relatedId: relId, relation: rel.relation },
        update: { relation: rel.relation },
      });
      links += 1;
    }
  }

  console.log(
    `\nГотово: обновлено ${done}, не найдено ${notFound}, ошибок ${failed}, связей ${links}.`,
  );
  if (backup.length > 0) {
    console.log(`Прежние значения ${backup.length} записей: ${backupFile}`);
  }
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
