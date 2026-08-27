import "dotenv/config";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { writeWebpVariants } from "../src/lib/localImage";
import { IMAGE_WIDTHS, isVariantName, variantName } from "../src/lib/imageVariants";

/**
 * Досыпает уменьшенные копии картинкам, которые лежали до Э2.7.
 *
 * Новые файлы получают копии при сохранении (`writeWebpVariants` зовут
 * и импорт, и загрузка из админки), а накопленному их никто не делал —
 * а это и есть почти всё, что показывается.
 *
 * Скрипт идёт по диску, а не по базе: на один и тот же файл могут
 * ссылаться разные записи, да и ссылки на постеры лежат в пяти
 * таблицах. Диск тут — полный список без исключений.
 *
 * Повторный запуск дёшев: файл, у которого копии уже есть, пропускаем
 * не читая. Так что прогон можно прервать и запустить заново.
 *
 *   docker compose exec app npx tsx scripts/generate-image-variants.ts
 *   docker compose exec app npx tsx scripts/generate-image-variants.ts --apply
 *
 * Пока прогон не дошёл до конца, `srcset` на сайте отдавать НЕЛЬЗЯ:
 * браузер, выбрав из него отсутствующий файл, показывает дыру, а не
 * возвращается к `src`. Поэтому `srcset` включается отдельно —
 * переменной `IMAGE_VARIANTS_READY=1`, уже после прогона.
 *
 * `--check` пересчитывает, у скольких картинок копий не хватает: перед
 * тем как включать переменную, число должно быть нулём.
 */

const apply = process.argv.includes("--apply");
const checkOnly = process.argv.includes("--check");
const UPLOADS = path.join(process.cwd(), "public", "uploads");

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const entries = await readdir(UPLOADS, { withFileTypes: true, recursive: true });
  const originals = entries
    .filter((e) => e.isFile() && e.name.endsWith(".webp") && !isVariantName(e.name))
    .map((e) => ({ dir: e.parentPath, name: e.name }));

  console.log(`Картинок всего: ${originals.length}`);

  let done = 0;
  let skipped = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const { dir, name } of originals) {
    const full = path.join(dir, name);
    // Достаточно проверить первую ступень: копии пишутся вместе.
    if (await exists(path.join(dir, variantName(name, IMAGE_WIDTHS[0])))) {
      skipped += 1;
      continue;
    }
    if (!apply) {
      done += 1;
      if (done <= 3) console.log(`  ${path.relative(UPLOADS, full)}`);
      continue;
    }

    const buffer = await readFile(full);
    await writeWebpVariants(dir, name, buffer);

    // Считаем выигрыш по самой мелкой ступени: именно её берут списки.
    const small = path.join(dir, variantName(name, IMAGE_WIDTHS[0]));
    if (await exists(small)) {
      bytesBefore += buffer.length;
      bytesAfter += (await stat(small)).size;
    }
    done += 1;
    if (done % 500 === 0) console.log(`  …${done}`);
  }

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} МБ`;
  if (checkOnly) {
    console.log(`\nС копиями: ${skipped}. Без копий: ${done}.`);
    console.log(
      done === 0
        ? "Все на месте — можно включать IMAGE_VARIANTS_READY=1."
        : "Копий не хватает — включать IMAGE_VARIANTS_READY рано.",
    );
    return;
  }
  console.log(`\nУ ${skipped} копии уже были.`);
  console.log(`${apply ? "Сделано" : "К обработке"}: ${done}.`);
  if (apply && bytesBefore > 0) {
    console.log(`В списках вместо ${mb(bytesBefore)} поедет ${mb(bytesAfter)}.`);
  }
  if (!apply) console.log("Это черновой прогон — добавьте --apply.");
}

main();
