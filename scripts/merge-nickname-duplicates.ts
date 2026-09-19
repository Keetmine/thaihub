/**
 * Разовый прогон: слить дубли «ник + имя» ↔ «имя» (просьба владельца
 * 2026-09-19: «слить все дубли, где полное имя полностью сходится — как
 * Smile Parada Thitawachira и Parada Thitawachira; важно только полное
 * вхождение, остальные оставляем в дублях; если есть три дубля — такое
 * сама разберу»).
 *
 * Что делает с каждой парой:
 *  1. сливает записи (`mergePerformers` — связи переезжают, пустые поля
 *     выжившего дозаполняются из проигравшего);
 *  2. если у пары есть ссылка на MyDramaList — дотягивает оттуда всё про
 *     человека (дата рождения, био, фото, соцссылки). Фильмография НЕ
 *     трогается: сериалы в этом прогоне не нужны;
 *  3. разводит ник и имя, как это делает импорт с MDL: в `name`
 *     остаётся ник («Smile»), в `realName` — полное имя («Parada
 *     Thitawachira»). Имя переписывается, только если реальное имя
 *     карточки с ним не спорит и само имя выглядит полным, а не
 *     «фамилия + имя» («Shim Jin Hyuk» ↔ «Jin Hyuk» — там спереди
 *     фамилия, и карточка «Shim» была бы поломкой). Остальные всё равно
 *     сливаются, но имя остаётся как было, и пара уходит в отчёт.
 *
 * Пары ищет `fullNameInclusionPairs` (src/lib/duplicates.ts, юнит-тест
 * tests/unit/duplicates.test.ts). Всё неоднозначное — три записи на одно
 * имя, два разных ника без базовой записи, точные тёзки — прогон не
 * трогает: это разбирают руками на /admin/duplicates.
 *
 * Запуск (по умолчанию — черновой прогон, ничего не меняет):
 *   npx tsx --env-file=.env scripts/merge-nickname-duplicates.ts
 *   npx tsx --env-file=.env scripts/merge-nickname-duplicates.ts --apply
 *   npx tsx --env-file=.env scripts/merge-nickname-duplicates.ts --apply --limit 20
 *   npx tsx --env-file=.env scripts/merge-nickname-duplicates.ts --apply --no-mdl
 * На проде — внутри контейнера (образ несёт scripts/ и tsx):
 *   docker compose exec app npx tsx scripts/merge-nickname-duplicates.ts
 */
import { prisma } from "../src/lib/prisma";
import { fullNameInclusionPairs, mergePerformers } from "../src/lib/duplicates";
import { importMdlPerformer } from "../src/lib/mdlPerformerImport";

const apply = process.argv.includes("--apply");
const noMdl = process.argv.includes("--no-mdl");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

/** Пауза между обращениями к MDL — тот же шаг, что у ночного досинка. */
const DELAY_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Сравнение имён «по сути»: регистр, пробелы и пунктуация не в счёт. */
const norm = (v: string | null) =>
  (v ?? "").toLowerCase().replace(/[.'’`-]/g, "").replace(/\s+/g, " ").trim();

/** Имя без приписанного спереди ника: «Copter Nuntapong Wongsakulyong»
 *  → «Nuntapong Wongsakulyong». Не начинается с ника — возвращается как
 *  было. */
function withoutNickname(value: string | null, nickname: string): string {
  const v = norm(value);
  const n = norm(nickname);
  return v.startsWith(`${n} `) ? v.slice(n.length + 1) : v;
}

/**
 * Похоже ли на полное имя, а не на корейское или китайское «фамилия +
 * личное имя». Тайские фамилии и имена длинные («Wongsakulyong»,
 * «Jirakul», «Hemmanee»), и приписанное спереди слово у них — ник. А у
 * «Shim Jin Hyuk» ↔ «Jin Hyuk» спереди стоит ФАМИЛИЯ, и переименовать
 * карточку в «Shim» значило бы испортить её. Порог в шесть букв
 * разделяет эти случаи на нашем каталоге; всё, что не прошло, просто
 * сливается без переименования и уходит в отчёт.
 */
function looksLikeFullName(name: string): boolean {
  return name.split(/[\s_]+/).some((w) => w.replace(/[^A-Za-z]/g, "").length >= 6);
}

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

/** Кого оставляем: сперва запись со ссылкой на MDL (её поля пришли
 *  оттуда и будут дозаполняться дальше), потом более «обжитую» — с
 *  событиями, сериалами и ссылками, — потом заведённую раньше. */
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

  const { pairs, ambiguous } = fullNameInclusionPairs(performers);
  const nicknames = new Map(pairs.map((p) => [`${p.long.id}:${p.short.id}`, p.nickname]));
  const pairNickname = (long: Row, short: Row) => nicknames.get(`${long.id}:${short.id}`) ?? "";

  // Что прогон не берёт на себя даже при полном вхождении имени.
  const skipped: string[] = [];
  const todo = pairs.filter(({ long, short }) => {
    if (long.type === "BAND" || short.type === "BAND") {
      skipped.push(`${long.name} + ${short.name} — одна из записей это группа`);
      return false;
    }
    if (long.mydramalistUrl && short.mydramalistUrl && long.mydramalistUrl !== short.mydramalistUrl) {
      // Две РАЗНЫЕ страницы MDL — это два разных человека, как бы ни
      // совпадали имена.
      skipped.push(`${long.name} + ${short.name} — разные страницы MyDramaList`);
      return false;
    }
    // Реальные имена сравниваем БЕЗ ника: «Copter Nuntapong
    // Wongsakulyong» и «Nuntapong Wongsakulyong» — это одно и то же имя,
    // записанное по-разному, ровно то, что прогон и чинит. А вот «Mint
    // Nutwara Vongvasana» с реальным именем «Wanitcha Wongwasana» —
    // действительно другой человек.
    if (
      long.realName &&
      short.realName &&
      withoutNickname(long.realName, pairNickname(long, short)) !== withoutNickname(short.realName, pairNickname(long, short))
    ) {
      skipped.push(
        `${long.name} + ${short.name} — разные реальные имена («${long.realName}» и «${short.realName}»)`,
      );
      return false;
    }
    return true;
  });

  console.log(
    `Полное вхождение имени: ${pairs.length} пар, из них берём ${todo.length}. ` +
      `Неоднозначного (разбирать руками): ${ambiguous.length}.`,
  );
  if (skipped.length > 0) {
    console.log("\nПропущено:");
    for (const line of skipped) console.log(`  · ${line}`);
  }

  let merged = 0;
  let enriched = 0;
  let renamed = 0;
  const unnamed: string[] = [];
  const failed: string[] = [];
  const mdlErrors: string[] = [];
  // MyDramaList прячется за Cloudflare, и если он начал отбивать
  // запросы, следующие двести тоже отобьёт — только медленно (каждый
  // тянет за собой запуск браузера). Три подряд — и дальше просто
  // сливаем, дозаполнить можно ночным досинком.
  let mdlFails = 0;
  let mdlGaveUp = false;

  for (const pair of todo.slice(0, limit === Infinity ? undefined : limit)) {
    const [keeper, loser] = keeperOf(pair.long, pair.short);
    const mdlUrl = keeper.mydramalistUrl ?? loser.mydramalistUrl;
    const head = `«${pair.long.name}» + «${pair.short.name}» → ник «${pair.nickname}», имя «${pair.short.name}»`;

    if (!apply) {
      console.log(
        `  ${head}; оставляем ${keeper.id} (${keeper.name})` +
          (mdlUrl ? `, MDL ${mdlUrl}` : ", MDL нет"),
      );
      continue;
    }

    try {
      await mergePerformers(keeper.id, [loser.id]);
      merged += 1;

      if (mdlUrl && !noMdl && !mdlGaveUp) {
        try {
          // Только карточка человека: сериалы в этом прогоне не нужны.
          await importMdlPerformer(mdlUrl, keeper.id, undefined, { withFilmography: false });
          enriched += 1;
          mdlFails = 0;
          await sleep(DELAY_MS);
        } catch (e) {
          // Не дотянули с MDL — запись всё равно слита, это главное.
          mdlFails += 1;
          mdlErrors.push(`${keeper.id}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
          if (mdlFails >= 3) {
            mdlGaveUp = true;
            console.log("  MyDramaList не отвечает — дальше сливаем без дозаполнения");
          }
        }
      }

      // Ник и имя — врозь: в name остаётся ник, в realName полное имя.
      // Переписываем, когда реальное имя карточки (своё или пришедшее с
      // MDL) не спорит с полным именем и само это имя выглядит полным, а
      // не «фамилия + имя» (см. looksLikeFullName).
      const card = await prisma.performer.findUnique({
        where: { id: keeper.id },
        select: { name: true, realName: true },
      });
      if (!card) throw new Error("карточка пропала после слияния");
      const realNameFits =
        !card.realName || withoutNickname(card.realName, pair.nickname) === norm(pair.short.name);
      if (realNameFits && looksLikeFullName(pair.short.name)) {
        await prisma.performer.update({
          where: { id: keeper.id },
          data: { name: pair.nickname, realName: pair.short.name },
        });
        renamed += 1;
        console.log(`  ✓ ${head}`);
      } else {
        unnamed.push(
          `${keeper.id} «${card.name}» — ник «${pair.nickname}» не подтверждён` +
            (card.realName ? `, реальное имя карточки «${card.realName}»` : ", реального имени нет"),
        );
        console.log(`  ✓ ${head} (слито, имя не тронуто)`);
      }
    } catch (e) {
      failed.push(`${head}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }

  if (!apply) {
    console.log(
      `\nЭто черновой прогон, ничего не изменено — добавьте --apply.` +
        (ambiguous.length > 0
          ? `\nНеоднозначные группы остаются на /admin/duplicates.`
          : ""),
    );
    await prisma.$disconnect();
    return;
  }

  console.log(
    `\nСлито ${merged}, дозаполнено с MDL ${enriched}, имя и ник разведены у ${renamed}.`,
  );
  if (unnamed.length > 0) {
    console.log("\nИмя оставлено как было (проверьте руками):");
    for (const line of unnamed) console.log(`  · ${line}`);
  }
  if (mdlErrors.length > 0) {
    console.log(`\nMyDramaList не ответил по ${mdlErrors.length} карточкам (записи слиты):`);
    for (const line of mdlErrors.slice(0, 10)) console.log(`  · ${line}`);
  }
  if (failed.length > 0) {
    console.log("\nНе получилось:");
    for (const line of failed) console.log(`  · ${line}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
