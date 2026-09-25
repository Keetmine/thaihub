import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { downloadRemoteImage, localImageName } from "../src/lib/localImage";

/**
 * Перекачивает постеры (и фото) событий, заведённых из очереди
 * черновиков, — починка после ошибки с именами файлов.
 *
 * Что было: имя локального файла бралось из чужого адреса, а проверка
 * «файл с таким именем уже есть — скачивать не надо» считала это той же
 * картинкой. У WordPress-афиш файл называется по размеру
 * («bnr_1050_486-1.jpg»), и одним таким именем на a-ara.co.jp названы
 * постеры шести разных событий: первое одобрение клало файл на диск, а
 * все следующие получали чужую картинку (жалоба владельца 2026-09-25).
 * Починено в lib/localImage.ts — в имя добавлен отпечаток адреса.
 *
 * Здесь чинится уже созданное. Настоящий адрес картинки лежит в
 * payload черновика, поэтому качаем оттуда заново: имя теперь своё у
 * каждого адреса, и событие получает СВОЮ картинку.
 *
 * Трогаем только события, у которых постер лежит под СТАРЫМ именем (без
 * отпечатка): у починенных адрес уже правильный, дёргать чужой сайт
 * ещё раз незачем.
 *
 * Запуск:
 *   npx tsx -r dotenv/config scripts/refetch-draft-posters.ts
 *   npx tsx -r dotenv/config scripts/refetch-draft-posters.ts --apply
 *   … --source a-ara      # только один источник
 */

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const sourceIdx = argv.indexOf("--source");
const SOURCE = sourceIdx >= 0 ? argv[sourceIdx + 1] : null;

type DraftPayload = { posterUrl?: string | null; photos?: string[] | null };

/** Уже под новым именем? Имя с отпечатком кончается на «-» и восемь
 *  шестнадцатеричных знаков перед расширением. */
function looksFixed(localPath: string): boolean {
  return /-[0-9a-f]{8}(\.[a-zA-Z0-9]+)?$/.test(localPath);
}

async function main() {
  const drafts = await prisma.eventDraft.findMany({
    where: {
      eventId: { not: null },
      ...(SOURCE ? { sourceUrl: { contains: SOURCE } } : {}),
    },
    select: { sourceUrl: true, eventId: true, payload: true },
  });
  console.log(`черновиков с созданным событием: ${drafts.length}${APPLY ? "" : " (сухой прогон)"}`);

  let checked = 0;
  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const d of drafts) {
    const payload = (d.payload ?? {}) as DraftPayload;
    const remote = payload.posterUrl?.trim();
    if (!remote || !/^https?:/i.test(remote)) {
      skipped += 1;
      continue;
    }
    const event = await prisma.event.findUnique({
      where: { id: d.eventId! },
      select: { id: true, title: true, posterUrl: true },
    });
    if (!event) {
      skipped += 1;
      continue;
    }
    checked += 1;

    // Постера нет вовсе или он уже под новым именем — не трогаем.
    if (!event.posterUrl || looksFixed(event.posterUrl)) {
      skipped += 1;
      continue;
    }
    // Админ заменил постер своим файлом — чужой адрес поверх не кладём.
    if (!event.posterUrl.startsWith("/uploads/posters/")) {
      skipped += 1;
      continue;
    }

    const wanted = localImageName(remote);
    if (!wanted) {
      skipped += 1;
      continue;
    }

    const local = await downloadRemoteImage(remote, "posters").catch(() => null);
    if (!local || /^https?:/i.test(local)) {
      failed += 1;
      console.log(`  [не скачалось] ${event.title.slice(0, 50)} — ${remote}`);
      continue;
    }
    if (local === event.posterUrl) {
      skipped += 1;
      continue;
    }
    console.log(`  ${event.title.slice(0, 50)}\n     ${event.posterUrl} → ${local}`);
    if (APPLY) {
      await prisma.event.update({ where: { id: event.id }, data: { posterUrl: local } });
    }
    fixed += 1;
  }

  console.log(
    `\nпроверено ${checked}, перекачано ${fixed}, пропущено ${skipped}, не вышло ${failed}` +
      (APPLY ? "" : " — это сухой прогон, добавьте --apply"),
  );
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
