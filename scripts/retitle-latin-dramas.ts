import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { slugify } from "../src/lib/slug";
import { parseMdlDramaPage, MDL_UA } from "../src/lib/mydramalist";

/**
 * Переименование сериалов с не-латинскими названиями (тайские и пр.) в
 * английские: если у сериала есть страница MDL — берём её английское
 * название (точнее всего), иначе — первый латинский вариант из
 * alsoKnownAs. Старое название уезжает в «Другие названия», nativeTitle
 * заполняется, если пуст, слаг генерируется от нового названия (у
 * тайских названий его не было). Пример: คุณพ่อจอมซ่าส์ → Hardcore Daddy.
 * Запуск: npx tsx scripts/retitle-latin-dramas.ts [--apply]
 */

const HAS_LATIN = /[A-Za-z]/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function uniqueSlug(title: string): Promise<string | null> {
  const base = slugify(title);
  if (!base) return null;
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const clash = await prisma.drama.findUnique({ where: { slug: candidate } });
    if (!clash) return candidate;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");

  // prisma не умеет «нет латиницы» — фильтруем в JS
  const all = await prisma.drama.findMany({
    select: {
      id: true,
      title: true,
      slug: true,
      alsoKnownAs: true,
      nativeTitle: true,
      mydramalistUrl: true,
    },
  });
  const targets = all.filter((d) => !HAS_LATIN.test(d.title));
  console.log(`Сериалов без латиницы в названии: ${targets.length}`);

  let renamed = 0;
  let skipped = 0;
  for (const d of targets) {
    let engTitle: string | null = null;

    if (d.mydramalistUrl) {
      try {
        const res = await fetch(d.mydramalistUrl, { headers: { "User-Agent": MDL_UA } });
        if (res.ok) {
          const mdl = parseMdlDramaPage(await res.text(), d.mydramalistUrl);
          if (HAS_LATIN.test(mdl.title)) engTitle = mdl.title;
        }
      } catch {
        // сеть/парсинг — попробуем alsoKnownAs
      }
      await sleep(350);
    }
    if (!engTitle && d.alsoKnownAs) {
      engTitle =
        d.alsoKnownAs
          .split(",")
          .map((t) => t.trim())
          .find((t) => t && HAS_LATIN.test(t) && !/[฀-๿぀-ヿ一-鿿가-힯]/.test(t)) ?? null;
    }
    if (!engTitle || engTitle === d.title) {
      skipped += 1;
      continue;
    }

    const oldTitle = d.title;
    const aka = new Set(
      (d.alsoKnownAs ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => t !== engTitle),
    );
    aka.add(oldTitle);

    console.log(`  ${oldTitle} → ${engTitle}`);
    if (apply) {
      const slug = d.slug ?? (await uniqueSlug(engTitle));
      await prisma.drama.update({
        where: { id: d.id },
        data: {
          title: engTitle,
          alsoKnownAs: Array.from(aka).join(", "),
          nativeTitle: d.nativeTitle ?? oldTitle,
          ...(slug ? { slug } : {}),
        },
      });
    }
    renamed += 1;
  }

  console.log(`\n${apply ? "Переименовано" : "Будет переименовано"}: ${renamed}, пропущено (нет варианта): ${skipped}`);
  if (!apply) console.log("Запусти с --apply, чтобы применить.");
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
