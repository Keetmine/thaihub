import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { mdlIdFromUrl } from "../src/lib/mydramalist";
import { slugify } from "../src/lib/slug";

/**
 * Ищет сериалы, которых импорт с MyDramaList мог перепутать.
 *
 * Откуда взялось. Запасной поиск соответствия шёл по одному названию:
 * `findFirst({ where: { title } })`. Названия у сериалов повторяются
 * постоянно — римейки, продолжения, просто совпадения, — и страница
 * «Restart» 2026 года подтянулась к «Restart» 2021-го и обновила его.
 * Сверка теперь требует ещё и года и однозначности (см.
 * `findDramaForMdlPage`), но записи, испорченные до этого, остались.
 *
 * Три захода, потому что одного мало (см. ниже, почему «расхождений
 * нет» само по себе ничего не доказывает). Ни один не лезет в сеть:
 * всё, что нужно, уже лежит в базе.
 *
 * Скрипт ничего не меняет: что делать с находкой — решать человеку,
 * автоматически «починить» тут нечего. Развести две записи может
 * только тот, кто знает, какой из сериалов настоящий.
 *
 *   npx tsx --env-file=.env scripts/find-mismatched-mdl.ts
 */

type Row = {
  title: string;
  nativeTitle: string | null;
  alsoKnownAs: string | null;
  year: number | null;
  slug: string | null;
  mdlUrl: string | null;
  mydramalistUrl: string | null;
  mdlSyncedAt: Date | null;
};

function show(r: Row): string {
  return `${r.title} (${r.year ?? "год неизвестен"})  /dramas/${r.slug ?? "—"}`;
}

/**
 * Слаг из адреса MDL: `/12345-restart` → `restart`. Он собран из
 * английского названия страницы, поэтому и служит подписью: у чужой
 * страницы подпись будет чужая.
 */
function mdlSlugFromUrl(url: string): string | null {
  return url.match(/(?:^|\/)\d+-([^/?#]+)/)?.[1]?.toLowerCase() ?? null;
}

/** Слова длиннее двух букв из всех известных нам названий записи. */
function titleWords(r: Row): Set<string> {
  const all = [r.title, r.nativeTitle, ...(r.alsoKnownAs ?? "").split(/[,;/]/)];
  const words = all.flatMap((t) => slugify(t ?? "").split("-"));
  return new Set(words.filter((w) => w.length > 2));
}

/** Заход 1: два адреса на одну запись ведут на разные страницы. */
function findConflictingUrls(rows: Row[]): Row[] {
  return rows.filter((r) => {
    const a = mdlIdFromUrl(r.mdlUrl ?? "");
    const b = mdlIdFromUrl(r.mydramalistUrl ?? "");
    return a && b && a !== b;
  });
}

/**
 * Заход 2: адрес не похож ни на одно название записи.
 *
 * Это и есть проверка тех записей, до которых первый заход не достаёт:
 * если `mydramalistUrl` никто руками не заполнял, сравнивать не с чем,
 * зато сам адрес несёт в себе название чужой страницы.
 *
 * Совпадение считаем по общим словам, а не побуквенно: у нас может
 * стоять тайское или альтернативное название, а на MDL — английское.
 * Одного общего слова хватает, чтобы снять подозрение; ноль общих —
 * повод посмотреть глазами.
 */
function findUrlTitleMismatch(rows: Row[]): Row[] {
  return rows.filter((r) => {
    const urlSlug = mdlSlugFromUrl(r.mdlUrl ?? "");
    if (!urlSlug) return false;
    const urlWords = urlSlug.split("-").filter((w) => w.length > 2);
    const ours = titleWords(r);
    if (urlWords.length === 0 || ours.size === 0) return false;
    return !urlWords.some((w) => ours.has(w));
  });
}

/**
 * Заход 3: тёзки, из которых хотя бы одного трогал импорт.
 *
 * Это не находка, а список под наблюдением: именно на таких парах
 * старая сверка и ошибалась. Годы у тёзок разные — значит, «Restart»
 * 2026-го мог уехать в «Restart» 2021-го, и наоборот.
 */
function findRiskyNamesakes(rows: Row[]): Row[][] {
  const byTitle = new Map<string, Row[]>();
  for (const r of rows) {
    const key = slugify(r.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), r]);
  }
  return [...byTitle.values()].filter(
    (group) =>
      group.length > 1 &&
      group.some((r) => r.mdlUrl) &&
      new Set(group.map((r) => r.year)).size > 1,
  );
}

async function main() {
  const select = {
    title: true,
    nativeTitle: true,
    alsoKnownAs: true,
    year: true,
    slug: true,
    mdlUrl: true,
    mydramalistUrl: true,
    mdlSyncedAt: true,
  } as const;

  const linked: Row[] = await prisma.drama.findMany({
    where: { mdlUrl: { not: null } },
    select,
    orderBy: { title: "asc" },
  });
  const all: Row[] = await prisma.drama.findMany({ select, orderBy: { title: "asc" } });

  const bothUrls = linked.filter((r) => r.mydramalistUrl);
  console.log(`Записей, связанных импортом: ${linked.length}`);
  console.log(`  из них с адресом, вписанным руками: ${bothUrls.length}`);
  console.log(`  только с адресом от импорта: ${linked.length - bothUrls.length}\n`);

  const conflicting = findConflictingUrls(bothUrls);
  console.log(`1. Два адреса ведут на разные страницы: ${conflicting.length}`);
  for (const r of conflicting) {
    console.log(`   ${show(r)}`);
    console.log(`     импорт связал с: ${r.mdlUrl}`);
    console.log(`     в карточке было: ${r.mydramalistUrl}`);
    console.log(`     синхронизация:   ${r.mdlSyncedAt?.toISOString().slice(0, 16) ?? "—"}`);
  }

  const mismatched = findUrlTitleMismatch(linked);
  console.log(`\n2. Адрес не похож ни на одно название записи: ${mismatched.length}`);
  for (const r of mismatched) {
    console.log(`   ${show(r)}`);
    console.log(`     связан с: ${r.mdlUrl}`);
  }

  const namesakes = findRiskyNamesakes(all);
  console.log(`\n3. Группы тёзок разных лет, где импорт кого-то трогал: ${namesakes.length}`);
  for (const group of namesakes) {
    for (const r of group) {
      console.log(`   ${show(r)}  ${r.mdlUrl ? `→ ${r.mdlUrl}` : "(импорт не трогал)"}`);
    }
    console.log("");
  }

  if (conflicting.length + mismatched.length + namesakes.length === 0) {
    console.log("\nЧисто по всем трём заходам.");
    return;
  }
  console.log(
    "\nЗаходы 1 и 2 — подозрения, а не приговор: адрес могли поправить руками,\n" +
      "а название на MDL бывает совсем другим. Заход 3 — просто список пар,\n" +
      "которые старая сверка могла перепутать; проверьте у них год и состав.\n" +
      "Если импорт подтянул чужой сериал — почистите у записи поля, пришедшие\n" +
      "не от неё, и заведите второй сериал заново.",
  );
}

main().finally(() => prisma.$disconnect());
