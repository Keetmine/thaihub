import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { oneProfilePlatformOf } from "../src/lib/socialLinks";

/** Артисты с ДВУМЯ+ ссылками на одну сеть «один профиль» (Instagram/
 *  TikTok/Twitter): почти всегда это старый и новый хэндлы после
 *  переименования аккаунта — импорт доливал новый рядом со старым
 *  (кейс Sea, 2026-08-29; теперь импорты вторую ссылку на занятую сеть
 *  не пишут). Скрипт только ПОКАЗЫВАЕТ пары — какой хэндл живой, решает
 *  человек и правит в форме артиста (секция «Ссылки»).
 *
 *    docker compose exec app npx tsx scripts/report-social-doubles.ts
 */
async function main() {
  const links = await prisma.performerLink.findMany({
    select: { url: true, performer: { select: { id: true, name: true, slug: true } } },
    orderBy: { performerId: "asc" },
  });
  const byPerformerNetwork = new Map<string, { name: string; slug: string | null; urls: string[] }>();
  for (const l of links) {
    const network = oneProfilePlatformOf(l.url);
    if (!network) continue;
    const key = `${l.performer.id}::${network}`;
    const entry = byPerformerNetwork.get(key) ?? { name: l.performer.name, slug: l.performer.slug, urls: [] };
    entry.urls.push(l.url);
    byPerformerNetwork.set(key, entry);
  }
  const doubles = [...byPerformerNetwork.entries()].filter(([, e]) => e.urls.length > 1);
  if (doubles.length === 0) {
    console.log("Задвоенных соцсетей нет.");
    return;
  }
  console.log(`Задвоенных сетей: ${doubles.length}\n`);
  for (const [key, e] of doubles) {
    const network = key.split("::")[1];
    console.log(`${e.name} (/artists/${e.slug ?? "?"}) — ${network}:`);
    for (const u of e.urls) console.log(`   ${u}`);
  }
  console.log("\nПравится в админке: форма артиста → секция «Ссылки».");
}
main()
  .catch((e) => { console.error("FATAL", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
