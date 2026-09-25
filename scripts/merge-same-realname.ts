import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { sameRealNamePairs, mergePerformers } from "../src/lib/duplicates";

/**
 * Разовый прогон: слить дубли «ник» ↔ «ник + полное имя», сведённые по
 * ОДИНАКОВОМУ настоящему имени («Guide» ↔ «Guide Kantapon Chompupan»).
 *
 * Откуда они взялись: обход биографий с MyDramaList проставил
 * `realName` тысячам карточек, и страница дублей разом показала 143
 * такие пары (вопрос владельца 2026-09-25: «появилось 144 дубля, хотя я
 * только всё разобрала»). Дубли не завелись — они лежали давно, просто
 * сравнивать было не с чем: у одной карточки из пары настоящее имя
 * пустовало. Ни одна из 296 карточек в группах не была создана за
 * последние пять дней.
 *
 * Отличие от `merge-nickname-duplicates.ts`: тот берёт пары, где
 * короткая запись — ПОЛНОЕ имя («Parada Thitawachira»), и на этих парах
 * он берёт 0 из 3. Здесь короткая — ник, а опорой служит совпавшее
 * настоящее имя (`sameRealNamePairs`, юнит-тест
 * tests/unit/duplicates.test.ts).
 *
 * Что делает с каждой парой:
 *  1. сливает записи (`mergePerformers` — связи переезжают, пустые поля
 *     выжившего дозаполняются из проигравшего);
 *  2. приводит выжившую карточку к виду сайта: в `name` остаётся ник
 *     («Guide»), в `realName` — полное имя («Kantapon Chompupan»).
 *
 * Чего НЕ трогает: три карточки на одно имя, перестановки слов («Koji
 * Mukai» ↔ «Mukai Koji»), пары с РАЗНЫМИ страницами на MyDramaList —
 * это разные люди либо работа для человека, всё остаётся на
 * /admin/duplicates.
 *
 * Запуск (по умолчанию — черновой прогон, ничего не меняет):
 *   npx tsx -r dotenv/config scripts/merge-same-realname.ts
 *   npx tsx -r dotenv/config scripts/merge-same-realname.ts --apply
 *   npx tsx -r dotenv/config scripts/merge-same-realname.ts --apply --limit 20
 * На проде — внутри контейнера:
 *   docker compose exec app npx tsx scripts/merge-same-realname.ts
 */

const apply = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

type Row = {
  id: string;
  name: string;
  realName: string | null;
  type: string;
  photoUrl: string | null;
  bio: string | null;
  mydramalistUrl: string | null;
  createdAt: Date;
  _count: { events: number; dramas: number; links: number };
};

/** Кого оставляем: сперва запись со ссылкой на MDL, потом более
 *  «обжитую» — с событиями, сериалами и ссылками, — потом заведённую
 *  раньше. Ровно то же правило, что в merge-nickname-duplicates.ts. */
function keeperOf(a: Row, b: Row): [Row, Row] {
  const weight = (r: Row) => [
    r.mydramalistUrl ? 1 : 0,
    r._count.events + r._count.dramas + r._count.links,
    r.photoUrl ? 1 : 0,
    r.bio ? 1 : 0,
    -r.createdAt.getTime(),
  ];
  const wa = weight(a);
  const wb = weight(b);
  for (let i = 0; i < wa.length; i++) {
    if (wa[i] !== wb[i]) return wa[i] > wb[i] ? [a, b] : [b, a];
  }
  return [a, b];
}

async function main() {
  const performers: Row[] = await prisma.performer.findMany({
    select: {
      id: true,
      name: true,
      realName: true,
      type: true,
      photoUrl: true,
      bio: true,
      mydramalistUrl: true,
      createdAt: true,
      _count: { select: { events: true, dramas: true, links: true } },
    },
  });

  const { pairs, ambiguous } = sameRealNamePairs(performers);

  // Разные страницы на MDL — это два РАЗНЫХ человека, которым совпало
  // написание настоящего имени. Сливать нельзя.
  const conflicting: string[] = [];
  const safe = pairs.filter((p) => {
    const a = p.long.mydramalistUrl;
    const b = p.short.mydramalistUrl;
    if (a && b && a !== b) {
      conflicting.push(`${p.long.name} + ${p.short.name} — разные страницы MyDramaList`);
      return false;
    }
    return true;
  });

  console.log(
    `Пар «ник ↔ ник + имя» по настоящему имени: ${pairs.length}, берём ${Math.min(safe.length, limit)}. ` +
      `Неоднозначного (разбирать руками): ${ambiguous.length}.`,
  );

  let merged = 0;
  let renamed = 0;
  for (const pair of safe.slice(0, Number.isFinite(limit) ? limit : undefined)) {
    const [keep, drop] = keeperOf(pair.long, pair.short);
    // Имя выжившей карточки — ник, настоящее имя — полное. У пары они
    // уже согласованы: по совпавшему realName её и нашли.
    const nickname = pair.nickname;
    const realName = (keep.realName ?? drop.realName ?? "").trim() || null;
    const needsRename = keep.name !== nickname || keep.realName !== realName;

    console.log(
      `  ${keep.name}${keep.realName ? ` (${keep.realName})` : ""}` +
        `  ←  ${drop.name}${drop.realName ? ` (${drop.realName})` : ""}` +
        (needsRename ? `\n      → «${nickname}» + «${realName ?? ""}»` : ""),
    );

    if (!apply) {
      merged += 1;
      if (needsRename) renamed += 1;
      continue;
    }
    await mergePerformers(keep.id, [drop.id]);
    merged += 1;
    if (needsRename) {
      await prisma.performer.update({
        where: { id: keep.id },
        data: { name: nickname, realName },
      });
      renamed += 1;
    }
  }

  if (conflicting.length > 0) {
    console.log(`\nПропущено (${conflicting.length}):`);
    for (const c of conflicting) console.log(`  · ${c}`);
  }

  console.log(
    `\nСлито пар: ${merged}, переименовано карточек: ${renamed}.` +
      (apply ? "" : "\nЭто черновой прогон, ничего не изменено — добавьте --apply."),
  );
  console.log("Неоднозначные группы остаются на /admin/duplicates.");
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
