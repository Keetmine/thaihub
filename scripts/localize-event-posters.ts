import "dotenv/config";
import { stat } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { downloadRemoteImage } from "../src/lib/localImage";

/**
 * Разовый перенос: события, у которых `posterUrl` до сих пор указывает на
 * чужой хост (импорт с ThaiTicketMajor складывал ссылку как есть),
 * скачиваются в public/uploads/posters/ и переезжают на локальный
 * /uploads/... — новые импорты так делают сразу
 * (createEventFromTtmImport), а это догоняет уже накопленное. Заодно
 * постер ужимается в WebP: у TTM это ~1000px JPEG/PNG на плашку 74px.
 *
 * Меняется ровно одно поле — `posterUrl`, и только у событий с внешней
 * ссылкой. Ничего не удаляется. Безопасно перезапускать: локальные
 * события отсекает сам запрос, а downloadRemoteImage не качает повторно
 * то, что уже лежит на диске.
 *
 * Запуск:
 *   npx tsx --env-file=.env scripts/localize-event-posters.ts         # показать
 *   npx tsx --env-file=.env scripts/localize-event-posters.ts --apply # перенести
 */
const apply = process.argv.includes("--apply");
const FOLDER = "posters";

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} КБ`;

/** Сколько весит оригинал у чужого хоста. Спрашиваем один байт: HEAD на
 *  thaiticketmajor.com отдаёт 403, а вот Range отвечает 206 и полным
 *  размером в content-range. 0 — размер узнать не вышло. */
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

async function main() {
  const events = await prisma.event.findMany({
    where: { posterUrl: { startsWith: "http" } },
    select: { id: true, title: true, posterUrl: true },
    orderBy: { title: "asc" },
  });

  console.log(`Событий с внешним постером: ${events.length}\n`);

  let before = 0;
  let after = 0;
  let moved = 0;
  const failed: { title: string; url: string }[] = [];

  for (const event of events) {
    const url = event.posterUrl!;
    const wasBytes = await remoteSize(url);
    before += wasBytes;

    if (!apply) {
      console.log(`${event.title}\n  ${url}  (${kb(wasBytes)})\n  → /uploads/${FOLDER}/…webp`);
      continue;
    }

    // Не скачалось — downloadRemoteImage вернёт ту же ссылку и напишет
    // warning; такое событие просто пропускаем, постер остаётся внешним.
    const local = await downloadRemoteImage(url, FOLDER);
    if (!local || local === url) {
      failed.push({ title: event.title, url });
      console.log(`${event.title}\n  ПРОПУЩЕНО — не скачалось: ${url}`);
      continue;
    }

    await prisma.event.update({ where: { id: event.id }, data: { posterUrl: local } });
    const nowBytes = await localSize(local);
    after += nowBytes;
    moved += 1;
    console.log(`${event.title}\n  ${kb(wasBytes)} → ${kb(nowBytes)}  ${local}`);
  }

  if (!apply) {
    console.log(
      `\nИтого: ${events.length} постер(ов), ${kb(before)} у чужого хоста.` +
        `\nЭто черновой прогон, в базе ничего не менялось — добавьте --apply.`,
    );
  } else {
    console.log(`\nПеренесено: ${moved} из ${events.length}`);
    console.log(`Было ${before} байт (${kb(before)}) → стало ${after} байт (${kb(after)})`);
    if (failed.length > 0) {
      console.log(`Не скачалось: ${failed.length} — постер остался внешней ссылкой:`);
      for (const f of failed) console.log(`  ${f.title} — ${f.url}`);
    } else {
      console.log("Не скачалось: 0");
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
