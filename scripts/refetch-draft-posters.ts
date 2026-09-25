import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { downloadRemoteImage } from "../src/lib/localImage";

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
 * Трогаем ТОЛЬКО настоящие коллизии: один файл на диске, на который
 * ссылаются события с РАЗНЫМИ исходными адресами картинки. Остальные
 * постеры лежат под уникальными именами и показывают что надо — гонять
 * ради них чужие сайты и менять имена здоровых файлов незачем (первый
 * набросок скрипта хотел перекачать 70 постеров из 78, хотя сломаны
 * были единицы).
 *
 * Имя нового файла — от адреса страницы-источника, как теперь делает
 * и само одобрение черновиков (`posterLocalBase` в importActions.ts).
 *
 * Запуск:
 *   npx tsx -r dotenv/config scripts/refetch-draft-posters.ts
 *   npx tsx -r dotenv/config scripts/refetch-draft-posters.ts --apply
 *   … --source a-ara      # только один источник
 *   … --all               # перекачать всё, а не только склеенное
 */

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ALL = argv.includes("--all");
const sourceIdx = argv.indexOf("--source");
const SOURCE = sourceIdx >= 0 ? argv[sourceIdx + 1] : null;

type DraftPayload = { posterUrl?: string | null; photos?: string[] | null };

/** Уже под новым именем? Имя с отпечатком кончается на «-» и восемь
 *  шестнадцатеричных знаков перед расширением. */
function looksFixed(localPath: string): boolean {
  return /-[0-9a-f]{8}(\.[a-zA-Z0-9]+)?$/.test(localPath);
}

/** Читаемая основа имени — от адреса страницы события, как в
 *  importActions.posterLocalBase. */
function localBaseFor(sourceUrl: string): string | undefined {
  try {
    const u = new URL(sourceUrl.trim());
    const host = u.hostname.replace(/^www\./i, "").split(".")[0];
    const slug = u.pathname.split("/").filter(Boolean).pop();
    return host && slug ? `${host}-${slug}` : undefined;
  } catch {
    return undefined;
  }
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

  // Сначала собираем пары «локальный файл → события», чтобы увидеть
  // настоящие склейки, а не перекачивать весь каталог.
  type Row = { eventId: string; title: string; posterUrl: string; remote: string; sourceUrl: string };
  const rows: Row[] = [];
  for (const d of drafts) {
    const payload = (d.payload ?? {}) as DraftPayload;
    const remote = payload.posterUrl?.trim();
    if (!remote || !/^https?:/i.test(remote)) continue;
    const event = await prisma.event.findUnique({
      where: { id: d.eventId! },
      select: { id: true, title: true, posterUrl: true },
    });
    // Постера нет, он уже с отпечатком, или админ заменил его своим
    // файлом — не трогаем.
    if (!event?.posterUrl) continue;
    if (looksFixed(event.posterUrl)) continue;
    if (!event.posterUrl.startsWith("/uploads/posters/")) continue;
    rows.push({
      eventId: event.id,
      title: event.title,
      posterUrl: event.posterUrl,
      remote,
      sourceUrl: d.sourceUrl,
    });
  }

  const byFile = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byFile.get(r.posterUrl) ?? [];
    list.push(r);
    byFile.set(r.posterUrl, list);
  }
  // Склейка — это один файл на диске, на который смотрят события с
  // РАЗНЫМИ исходными адресами картинки.
  const collided = new Set<string>();
  for (const [file, list] of byFile) {
    if (new Set(list.map((r) => r.remote)).size > 1) collided.add(file);
  }
  const targets = ALL ? rows : rows.filter((r) => collided.has(r.posterUrl));

  console.log(`событий с постером из черновика: ${rows.length}`);
  console.log(`склеенных файлов: ${collided.size}, событий под ними: ${targets.length}`);
  if (!ALL && collided.size > 0) {
    for (const file of collided) {
      const list = byFile.get(file)!;
      console.log(`\n  ${file} — ${list.length} событий:`);
      for (const r of list) console.log(`    · ${r.title.slice(0, 55)}`);
    }
  }
  console.log("");

  let fixed = 0;
  let failed = 0;
  for (const r of targets) {
    const local = await downloadRemoteImage(r.remote, "posters", {
      localBase: localBaseFor(r.sourceUrl),
    }).catch(() => null);
    if (!local || /^https?:/i.test(local)) {
      failed += 1;
      console.log(`  [не скачалось] ${r.title.slice(0, 50)} — ${r.remote}`);
      continue;
    }
    if (local === r.posterUrl) continue;
    console.log(`  ${r.title.slice(0, 50)}\n     ${r.posterUrl} → ${local}`);
    if (APPLY) {
      await prisma.event.update({ where: { id: r.eventId }, data: { posterUrl: local } });
    }
    fixed += 1;
  }

  console.log(
    `\nперекачано ${fixed}, не вышло ${failed}` +
      (APPLY ? "" : " — это сухой прогон, добавьте --apply"),
  );
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
