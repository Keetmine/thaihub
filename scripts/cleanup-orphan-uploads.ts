import "dotenv/config";
import { readdir, stat, rm } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { IMAGE_WIDTHS, isVariantName } from "../src/lib/imageVariants";
import { privateUploadsDir } from "../src/lib/privateUploads";

/**
 * Чистка файлов-сирот в public/uploads и private-uploads: файлов, на
 * которые больше не ссылается ни одна строка в базе. Сироты копятся
 * закономерно — загрузка идёт ДО сабмита формы (/api/upload и три
 * приватные ручки), и брошенная форма оставляет файл на диске навсегда.
 *
 * Запуск:
 *   npx tsx --env-file=.env scripts/cleanup-orphan-uploads.ts          # только список
 *   npx tsx --env-file=.env scripts/cleanup-orphan-uploads.ts --apply  # удалить
 *
 * Как ищем ссылки. НЕ по списку моделей руками (photoUrl, posterUrl,
 * fileUrl, imageUrl… — список в prisma/schema.prisma длинный и будет
 * отставать от схемы), а сканом ВСЕХ текстовых колонок публичной схемы
 * через information_schema: берём каждое значение, где встречается
 * «/uploads/» или «/files/», в один общий текст. Это ловит и прямые
 * поля-ссылки, и адреса картинок внутри HTML вики-статей, и всё, что
 * появится в схеме позже.
 *
 * Живость файла — вхождение его ИМЕНИ в этот текст (имена у нас
 * уникальны: randomUUID у загрузок, длинные content-addressed имена у
 * импортов). Проверка нарочно грубая в безопасную сторону: совпадение
 * подстроки оставит файл жить, но никогда не удалит живой.
 *
 * Уменьшенные копии картинок (суффиксы -20/-200/-400 — см.
 * src/lib/imageVariants.ts) в базе не упоминаются никогда: они живы,
 * пока жив оригинал, и удаляются вместе с ним.
 *
 * Предохранители:
 *  - любая ошибка чтения БД — стоп, ничего не удаляем;
 *  - ноль ссылок в базе при непустом диске — стоп (скорее пустая/не та
 *    база, чем правда всё сироты);
 *  - файлы моложе суток не трогаем: их форму, возможно, заполняют
 *    прямо сейчас.
 */

const apply = process.argv.includes("--apply");

const MIN_AGE_MS = 24 * 60 * 60 * 1000;

const PUBLIC_UPLOADS = path.join(process.cwd(), "public", "uploads");

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} КБ`;

/** Все значения текстовых колонок, где встречается путь загрузки, —
 *  одним текстом. Бросает при любой ошибке БД — вызывающий не удаляет. */
async function collectDbReferences(): Promise<string> {
  const columns = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying', 'json', 'jsonb')`,
  );

  const chunks: string[] = [];
  for (const { table_name, column_name } of columns) {
    // Идентификаторы приходят из information_schema, но экранируем всё
    // равно — привычка дешевле инцидента.
    const t = `"${table_name.replace(/"/g, '""')}"`;
    const c = `"${column_name.replace(/"/g, '""')}"`;
    const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT ${c}::text AS v FROM ${t}
        WHERE ${c}::text LIKE '%/uploads/%' OR ${c}::text LIKE '%/files/%'`,
    );
    for (const { v } of rows) chunks.push(v);
  }
  return chunks.join("\n");
}

type FileEntry = { fullPath: string; name: string; size: number; mtimeMs: number };

async function walk(dir: string): Promise<FileEntry[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // каталога нет (например, private-uploads на дев-машине)
  }
  const out: FileEntry[] = [];
  for (const e of entries) {
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(fullPath)));
    } else if (e.isFile()) {
      const s = await stat(fullPath);
      out.push({ fullPath, name: e.name, size: s.size, mtimeMs: s.mtimeMs });
    }
  }
  return out;
}

/** Для копии — имя её оригинала: poster-200.webp → poster.webp. */
function originalName(name: string): string {
  for (const w of IMAGE_WIDTHS) {
    const suffix = `-${w}.webp`;
    if (name.endsWith(suffix)) return `${name.slice(0, -suffix.length)}.webp`;
  }
  return name;
}

async function main() {
  let refs: string;
  try {
    refs = await collectDbReferences();
  } catch (err) {
    console.error("Ошибка чтения БД — ничего не удаляем и не печатаем:", err);
    process.exitCode = 1;
    return;
  }

  const files = [...(await walk(PUBLIC_UPLOADS)), ...(await walk(privateUploadsDir()))];
  console.log(`Файлов на диске: ${files.length}, ссылок в БД: ${refs ? "есть" : "НЕТ"}.`);

  if (!refs && files.length > 0) {
    console.error(
      "В базе не нашлось НИ ОДНОЙ ссылки на загрузки при непустом диске — " +
        "похоже на пустую или не ту базу. Стоп, ничего не удаляем.",
    );
    process.exitCode = 1;
    return;
  }

  // Живость проверяем по имени: у копий — по имени оригинала. Проверяем
  // и как есть, и в URL-кодировке — в HTML имя могло попасть закодированным.
  const alive = (name: string): boolean => {
    const target = isVariantName(name) ? originalName(name) : name;
    return refs.includes(target) || refs.includes(encodeURIComponent(target));
  };

  const now = Date.now();
  const orphans: FileEntry[] = [];
  let young = 0;
  for (const file of files) {
    if (alive(file.name)) continue;
    if (now - file.mtimeMs < MIN_AGE_MS) {
      young++;
      continue; // может, форму с этим файлом заполняют прямо сейчас
    }
    orphans.push(file);
  }

  const totalBytes = orphans.reduce((sum, f) => sum + f.size, 0);
  console.log(
    `Сирот: ${orphans.length} (${kb(totalBytes)}); ` +
      `свежих без ссылок (моложе суток, не трогаем): ${young}.`,
  );
  for (const f of orphans) {
    console.log(`  ${path.relative(process.cwd(), f.fullPath)} — ${kb(f.size)}`);
  }

  if (!apply) {
    console.log("\nЧерновой прогон — ничего не удалялось. Удалить: добавьте --apply.");
    return;
  }

  let removed = 0;
  for (const f of orphans) {
    try {
      await rm(f.fullPath);
      removed++;
    } catch (err) {
      console.error(`Не удалилось ${f.fullPath}:`, err);
    }
  }
  console.log(`\nУдалено ${removed} из ${orphans.length}, освобождено ~${kb(totalBytes)}.`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
