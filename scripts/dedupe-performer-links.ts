/**
 * Разовая чистка: у артистов накопились дубли соцссылок — один и тот же
 * профиль записан в разной форме (`instagram.com/x` и
 * `www.instagram.com/x/`). Импорт и форма сравнивали адреса буквально,
 * поэтому считали их разными; теперь оба сравнивают по socialLinkKey, а
 * этот скрипт убирает то, что уже накопилось.
 *
 * Из каждой группы одинаковых оставляем самую «полную» запись: с
 * протоколом и осмысленной подписью. Запуск:
 *   npx tsx --env-file=.env scripts/dedupe-performer-links.ts        # показать
 *   npx tsx --env-file=.env scripts/dedupe-performer-links.ts --apply # удалить
 */
import { prisma } from "../src/lib/prisma";
import { socialLinkKey } from "../src/lib/socialLinks";

const apply = process.argv.includes("--apply");

/** Чем полнее адрес и осмысленнее подпись, тем лучше запись. */
function score(link: { label: string; url: string }): number {
  let s = 0;
  if (/^https?:\/\//i.test(link.url)) s += 2;
  if (link.label && link.label !== link.url) s += 1;
  return s;
}

async function main() {
  const performers = await prisma.performer.findMany({
    select: { id: true, name: true, links: { select: { id: true, label: true, url: true } } },
    where: { links: { some: {} } },
  });

  const toDelete: string[] = [];
  let affected = 0;

  for (const p of performers) {
    const groups = new Map<string, typeof p.links>();
    for (const l of p.links) {
      const key = socialLinkKey(l.url);
      const g = groups.get(key);
      if (g) g.push(l);
      else groups.set(key, [l]);
    }
    let printed = false;
    for (const [, group] of groups) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => score(b) - score(a));
      const keep = sorted[0];
      const drop = sorted.slice(1);
      if (!printed) {
        console.log(`\n${p.name}`);
        printed = true;
        affected += 1;
      }
      console.log(`  оставляем: [${keep.label}] ${keep.url}`);
      for (const d of drop) {
        console.log(`  удаляем:   [${d.label}] ${d.url}`);
        toDelete.push(d.id);
      }
    }
  }

  console.log(
    `\nАртистов с дублями: ${affected}, лишних ссылок: ${toDelete.length}` +
      (apply ? "" : " (это черновой прогон, ничего не удалено — добавьте --apply)"),
  );

  if (apply && toDelete.length > 0) {
    const res = await prisma.performerLink.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`Удалено: ${res.count}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
