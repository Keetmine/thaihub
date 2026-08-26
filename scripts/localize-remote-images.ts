import "dotenv/config";
import { stat } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { downloadRemoteImage } from "../src/lib/localImage";

/**
 * Разовый перенос накопленного: поля с картинками, которые до сих пор
 * указывают на чужой хост, скачиваются в public/uploads/{папка}/ и
 * переезжают на локальный /uploads/... — ровно то же самое уже делают
 * сами импортёры на записи (blsceneImport, memindyImport,
 * tpopFandomImport, wikipediaAgencyImport), а это догоняет то, что
 * успело накопиться до починки. Общее правило — «Local image storage» в
 * docs/features/tmdb-import.md.
 *
 * Меняется ровно одно поле у одной записи, ничего не удаляется. Прогон
 * длинный (сотни картинок), поэтому его МОЖНО прервать и запустить
 * заново: выборка берёт только строки, где адрес ещё начинается с
 * "http", а downloadRemoteImage не качает повторно то, что уже лежит на
 * диске. Недоступная картинка не валит прогон — строка пропускается и
 * попадает в список в конце, следующий запуск попробует её ещё раз.
 *
 * Запуск:
 *   npx tsx --env-file=.env scripts/localize-remote-images.ts          # только план
 *   npx tsx --env-file=.env scripts/localize-remote-images.ts --apply  # перенести
 *
 * Без --apply не делается НИ ОДНОГО запроса за картинками — только
 * выборка из базы и печать плана.
 */
const apply = process.argv.includes("--apply");

/** 741 картинка последовательно — это часы, а семьсот параллельно —
 *  верный способ получить бан у blscene. Шесть — та же величина, что в
 *  scripts/backfill-tmdb-images.ts. */
const CONCURRENCY = 6;

/** Одна повторная попытка: у мелких хостов (blscene — обычный WordPress)
 *  пачка из полутысячи запросов ловит случайные обрывы. Больше попыток
 *  не делаем — на реально мёртвой картинке это только тянуло бы время,
 *  а прогон и так безопасно перезапускается. */
const RETRY_DELAY_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} КБ`;

type Row = { id: string; title: string; url: string };

type Target = {
  /** Как поле называется в схеме — им же подписаны итоги. */
  field: string;
  /** Папка под public/uploads/. */
  folder: string;
  load: () => Promise<Row[]>;
  save: (id: string, localUrl: string) => Promise<unknown>;
};

const TARGETS: Target[] = [
  {
    field: "Location.photoUrl",
    folder: "blscene",
    load: async () =>
      (
        await prisma.location.findMany({
          where: { photoUrl: { startsWith: "http" } },
          select: { id: true, name: true, photoUrl: true },
          orderBy: { name: "asc" },
        })
      ).map((r) => ({ id: r.id, title: r.name, url: r.photoUrl! })),
    save: (id, photoUrl) => prisma.location.update({ where: { id }, data: { photoUrl } }),
  },
  {
    field: "Performer.photoUrl",
    folder: "performers",
    load: async () =>
      (
        await prisma.performer.findMany({
          where: { photoUrl: { startsWith: "http" } },
          select: { id: true, name: true, photoUrl: true },
          orderBy: { name: "asc" },
        })
      ).map((r) => ({ id: r.id, title: r.name, url: r.photoUrl! })),
    save: (id, photoUrl) => prisma.performer.update({ where: { id }, data: { photoUrl } }),
  },
  {
    field: "Drama.posterUrl",
    folder: "blscene",
    load: async () =>
      (
        await prisma.drama.findMany({
          where: { posterUrl: { startsWith: "http" } },
          select: { id: true, title: true, posterUrl: true },
          orderBy: { title: "asc" },
        })
      ).map((r) => ({ id: r.id, title: r.title, url: r.posterUrl! })),
    save: (id, posterUrl) => prisma.drama.update({ where: { id }, data: { posterUrl } }),
  },
  {
    field: "Agency.logoUrl",
    folder: "agencies",
    load: async () =>
      (
        await prisma.agency.findMany({
          where: { logoUrl: { startsWith: "http" } },
          select: { id: true, name: true, logoUrl: true },
          orderBy: { name: "asc" },
        })
      ).map((r) => ({ id: r.id, title: r.name, url: r.logoUrl! })),
    save: (id, logoUrl) => prisma.agency.update({ where: { id }, data: { logoUrl } }),
  },
];

// User.photoUrl СОЗНАТЕЛЬНО не в списке: это аватар из входа через
// Google, он принадлежит человеку и обновляется при каждом входе — не
// каталожная картинка, копировать её к себе незачем.

/** Викия отдаёт …/Имя.webp/revision/latest/scale-to-width-down/268?cb=… —
 *  последний сегмент пути одинаковый («268») у ВСЕХ таких ссылок, а имя
 *  локального файла downloadRemoteImage берёт именно оттуда: без обрезки
 *  десятки фото легли бы в один 268.webp и перезаписали друг друга.
 *  Базовый адрес без /revision/ отдаёт тот же файл под настоящим именем
 *  — так же чистит ссылку и сам скрапер (infoboxImage в
 *  src/lib/tpopFandom.ts), но в базе остались строки, записанные до
 *  этого. */
function normalizeUrl(url: string): string {
  return url.replace(/\/revision\/.*$/, "");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(неразбираемый адрес)";
  }
}

/** Имя, под которым файл ляжет на диск — тем же способом, что и в
 *  downloadRemoteImage. Нужно только для проверки на совпадения в плане. */
function localBasename(url: string): string {
  try {
    const remoteName = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return remoteName.replace(/\.[a-zA-Z0-9]+$/, "");
  } catch {
    return "";
  }
}

/** Сколько весит оригинал у чужого хоста. Спрашиваем один байт: HEAD у
 *  части хостов отвечает 403, а Range отвечает 206 и полным размером в
 *  content-range. 0 — размер узнать не вышло. */
async function remoteSize(url: string): Promise<number> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const total = res.headers.get("content-range")?.split("/")[1];
    if (total) return Number(total);
    return res.ok ? Number(res.headers.get("content-length") ?? 0) : 0;
  } catch {
    return 0;
  }
}

async function localSize(localUrl: string): Promise<number> {
  try {
    const file = path.join(process.cwd(), "public", localUrl.replace(/^\//, ""));
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function processInPool<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runOne));
}

async function downloadWithRetry(url: string, folder: string): Promise<string | null> {
  const first = await downloadRemoteImage(url, folder);
  if (first && first !== url) return first;
  await sleep(RETRY_DELAY_MS);
  return downloadRemoteImage(url, folder);
}

type FieldResult = { field: string; total: number; moved: number; before: number; after: number };

/** Печатает план по одному полю и ничего больше не делает. */
function reportPlan(target: Target, rows: Row[]): void {
  console.log(`${target.field}: ${rows.length} → /uploads/${target.folder}/`);
  if (rows.length === 0) return;

  const byHost = new Map<string, number>();
  for (const row of rows) {
    const host = hostOf(row.url);
    byHost.set(host, (byHost.get(host) ?? 0) + 1);
  }
  for (const [host, count] of [...byHost].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${host} — ${count}`);
  }

  // Совпадение имён внутри одной папки означало бы, что одна картинка
  // перезапишет другую, — лучше увидеть это в плане, чем после прогона.
  const names = new Map<string, number>();
  for (const row of rows) {
    const name = localBasename(normalizeUrl(row.url));
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  const collisions = [...names].filter(([, n]) => n > 1);
  if (collisions.length > 0) {
    console.log(`  ВНИМАНИЕ: ${collisions.length} совпадающих имён файлов:`);
    for (const [name, n] of collisions.slice(0, 10)) console.log(`    ${name} ×${n}`);
  }
}

async function migrate(target: Target, rows: Row[]): Promise<{ result: FieldResult; failed: Row[] }> {
  console.log(`\n=== ${target.field}: ${rows.length} шт. → /uploads/${target.folder}/ ===`);

  const failed: Row[] = [];
  let moved = 0;
  let before = 0;
  let after = 0;
  let done = 0;
  // Прогресс по завершённым, а не по порядку в списке: работа идёт в
  // несколько потоков, и на семистах картинках важно видеть, что прогон
  // жив.
  const progress = () => `[${target.field} ${++done}/${rows.length}]`;

  await processInPool(
    rows,
    async (row) => {
      const url = normalizeUrl(row.url);
      // Одна упавшая строка не должна ронять весь прогон: и сеть, и
      // запись в базу здесь под общим try.
      try {
        const wasBytes = await remoteSize(url);
        const local = await downloadWithRetry(url, target.folder);
        // Не скачалось — downloadRemoteImage возвращает не null, а ту же
        // ссылку (и пишет warning). Строку пропускаем, адрес остаётся
        // внешним, следующий запуск попробует снова.
        if (!local || local === url) {
          failed.push(row);
          console.log(`${progress()} ${row.title} — ПРОПУЩЕНО: не скачалось`);
          return;
        }

        await target.save(row.id, local);
        const nowBytes = await localSize(local);
        before += wasBytes;
        after += nowBytes;
        moved += 1;
        console.log(`${progress()} ${row.title} — ${kb(wasBytes)} → ${kb(nowBytes)}`);
      } catch (err) {
        failed.push(row);
        const message = err instanceof Error ? err.message : String(err);
        console.log(`${progress()} ${row.title} — ПРОПУЩЕНО: ${message}`);
      }
    },
    CONCURRENCY,
  );

  console.log(
    `${target.field}: перенесено ${moved} из ${rows.length}, ` +
      `было ${before} байт (${kb(before)}) → стало ${after} байт (${kb(after)})`,
  );
  return { result: { field: target.field, total: rows.length, moved, before, after }, failed };
}

async function main() {
  const startedAt = Date.now();

  const loaded: { target: Target; rows: Row[] }[] = [];
  for (const target of TARGETS) loaded.push({ target, rows: await target.load() });
  const grandTotal = loaded.reduce((sum, l) => sum + l.rows.length, 0);

  if (!apply) {
    console.log("План переноса (черновой прогон — ни одного запроса за картинками):\n");
    for (const { target, rows } of loaded) reportPlan(target, rows);
    console.log(`\nВсего картинок с чужих хостов: ${grandTotal}.`);
    console.log("В базе ничего не менялось и ничего не скачивалось — добавьте --apply.");
    return;
  }

  const results: FieldResult[] = [];
  const failures: { field: string; rows: Row[] }[] = [];
  for (const { target, rows } of loaded) {
    if (rows.length === 0) {
      console.log(`\n=== ${target.field}: нечего переносить ===`);
      continue;
    }
    const { result, failed } = await migrate(target, rows);
    results.push(result);
    if (failed.length > 0) failures.push({ field: target.field, rows: failed });
  }

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\n=== Готово за ${elapsedMin} мин ===`);
  for (const r of results) {
    console.log(
      `${r.field}: перенесено ${r.moved} из ${r.total}, ` +
        `было ${r.before} байт (${kb(r.before)}) → стало ${r.after} байт (${kb(r.after)})`,
    );
  }

  const skippedCount = failures.reduce((sum, f) => sum + f.rows.length, 0);
  if (skippedCount === 0) {
    console.log("Пропущено: 0");
    return;
  }
  console.log(`\nПропущено ${skippedCount} — адрес остался внешним, запустите скрипт ещё раз:`);
  for (const { field, rows } of failures) {
    for (const row of rows) console.log(`  ${field} — ${row.title}: ${row.url}`);
  }
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
