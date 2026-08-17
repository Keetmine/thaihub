import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { MdlClient } from "../src/lib/mdlClient";
import {
  parseMdlPersonPage,
  parseMdlSearchPeople,
  mdlSearchUrl,
  mdlIdFromUrl,
  absMdlUrl,
  type MdlPerson,
} from "../src/lib/mydramalist";
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from "../src/lib/socialLinks";

/**
 * Обогащение исполнителей со страниц MyDramaList /people/. Прогоняется
 * ТОЛЬКО по актёрам, привязанным к агентствам (см. задачу): ищет
 * человека поиском (или по сохранённой ссылке), верифицирует кандидата
 * пересечением фильмографии с нашими сериалами (или полным совпадением
 * настоящего имени), после чего:
 * - заполняет alsoKnownAs / nationality / gender всегда, realName /
 *   birthDate / bio — только если пусто (Native name сознательно не
 *   трогаем — см. постановку);
 * - дополняет соцссылки недостающими платформами;
 * - сверяет фильмографию: недостающие связи с нашими сериалами
 *   создаются, у существующих проставляется роль (имя персонажа).
 * Раздел /people/ за Cloudflare-челленджем — работает через MdlClient
 * (headed chromium). Резюмится по mdlSyncedAt. Запуск:
 *   npx tsx scripts/mdl-sync-performers.ts [--limit N] [--force]
 */

const DELAY_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'"“”:!?.,\-–—()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/\s+/).filter(Boolean);
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  const force = process.argv.includes("--force");
  // Точечный прогон одного актёра: --performer <slug или имя> (игнорирует
  // mdlSyncedAt — синкает всегда).
  const performerArg = process.argv.indexOf("--performer");
  const onlyPerformer = performerArg >= 0 ? process.argv[performerArg + 1] : null;

  const performers = await prisma.performer.findMany({
    where: onlyPerformer
      ? {
          OR: [
            { slug: onlyPerformer },
            { name: { equals: onlyPerformer, mode: "insensitive" } },
          ],
        }
      : {
          type: "SOLO",
          agencies: { some: {} },
          ...(force ? {} : { mdlSyncedAt: null }),
        },
    orderBy: { name: "asc" },
    include: {
      links: true,
      dramas: { include: { drama: { select: { id: true, title: true, mydramalistUrl: true } } } },
    },
  });
  console.log(`К синхронизации: ${Math.min(performers.length, limit)} из ${performers.length}`);

  // Карты наших сериалов для матчинга фильмографии.
  const allDramas = await prisma.drama.findMany({
    select: { id: true, title: true, mydramalistUrl: true },
  });
  const dramaByMdlId = new Map<string, string>();
  const dramaByTitle = new Map<string, string>();
  for (const d of allDramas) {
    const mid = d.mydramalistUrl ? mdlIdFromUrl(d.mydramalistUrl) : null;
    if (mid) dramaByMdlId.set(mid, d.id);
    dramaByTitle.set(normTitle(d.title), d.id);
  }
  const resolveDrama = (mdlPath: string, title: string): string | undefined =>
    (mdlIdFromUrl(mdlPath) ? dramaByMdlId.get(mdlIdFromUrl(mdlPath)!) : undefined) ??
    dramaByTitle.get(normTitle(title));

  const client = new MdlClient();
  await client.init();

  let done = 0;
  let notFound = 0;
  let failed = 0;
  let rolesSet = 0;
  let linksAdded = 0;

  try {
    for (const p of performers.slice(0, Number.isFinite(limit) ? limit : undefined)) {
      try {
        const ourDramaIds = new Set(p.dramas.map((pd) => pd.drama.id));

        const verify = (person: MdlPerson): boolean => {
          const overlap = person.filmography.some((row) => {
            const id = resolveDrama(row.mdlPath, row.title);
            return id != null && ourDramaIds.has(id);
          });
          if (overlap) return true;
          if (p.realName) {
            const hay = `${person.name} ${person.alsoKnownAs ?? ""} ${person.firstName ?? ""} ${person.familyName ?? ""}`.toLowerCase();
            if (tokens(p.realName).every((t) => hay.includes(t))) return true;
          }
          return false;
        };

        let person: MdlPerson | null = null;
        let personUrl: string | null = null;

        if (p.mydramalistUrl?.includes("/people/")) {
          personUrl = p.mydramalistUrl;
          person = parseMdlPersonPage(await client.fetchHtml(personUrl), personUrl);
          if (!verify(person)) {
            // сохранённая ссылка не проходит верификацию — доверяем ей всё равно
            console.log(`  [по ссылке, без верификации] ${p.name}`);
          }
        } else {
          const query = p.realName ? `${p.name} ${p.realName}` : p.name;
          const html = await client.fetchHtml(mdlSearchUrl(query));
          let candidates = parseMdlSearchPeople(html).filter((c) => c.path !== "/people/top");
          if (candidates.length === 0 && p.realName) {
            await sleep(DELAY_MS);
            const html2 = await client.fetchHtml(mdlSearchUrl(p.realName));
            candidates = parseMdlSearchPeople(html2).filter((c) => c.path !== "/people/top");
          }
          for (const cand of candidates.slice(0, 3)) {
            await sleep(DELAY_MS);
            const url = absMdlUrl(cand.path);
            try {
              const parsed = parseMdlPersonPage(await client.fetchHtml(url), url);
              if (verify(parsed)) {
                person = parsed;
                personUrl = url;
                break;
              }
            } catch {
              // кандидат не разобрался — следующий
            }
          }
        }

        if (!person || !personUrl) {
          notFound += 1;
          await prisma.performer.update({
            where: { id: p.id },
            data: { mdlSyncedAt: new Date() },
          });
          console.log(`  [не найден] ${p.name}${p.realName ? ` (${p.realName})` : ""}`);
          continue;
        }

        // --- профиль ---
        const realNameFromMdl =
          person.firstName && person.familyName
            ? `${person.firstName} ${person.familyName}`
            : null;
        await prisma.performer.update({
          where: { id: p.id },
          data: {
            mydramalistUrl: personUrl,
            alsoKnownAs: person.alsoKnownAs,
            nationality: person.nationality,
            gender: person.gender,
            ...(p.realName ? {} : realNameFromMdl ? { realName: realNameFromMdl } : {}),
            ...(p.birthDate ? {} : person.born ? { birthDate: person.born } : {}),
            ...(p.bio ? {} : person.bio ? { bio: person.bio } : {}),
            mdlSyncedAt: new Date(),
          },
        });

        // --- соцссылки: дополняем недостающие платформы ---
        const havePlatforms = new Set(
          p.links.map((l) => detectSocialPlatform(l.url)).filter(Boolean),
        );
        for (const link of person.socialLinks) {
          const platform = detectSocialPlatform(link);
          if (!platform || havePlatforms.has(platform)) continue;
          havePlatforms.add(platform);
          await prisma.performerLink.create({
            data: { performerId: p.id, label: SOCIAL_PLATFORM_LABELS[platform], url: link },
          });
          linksAdded += 1;
        }

        // --- фильмография: роли и недостающие связи ---
        const seenDramaIds = new Set<string>();
        for (const row of person.filmography) {
          const dramaId = resolveDrama(row.mdlPath, row.title);
          if (!dramaId || seenDramaIds.has(dramaId) || !row.role) continue;
          seenDramaIds.add(dramaId);
          await prisma.performerDrama.upsert({
            where: { performerId_dramaId: { performerId: p.id, dramaId } },
            create: { performerId: p.id, dramaId, role: row.role },
            update: { role: row.role },
          });
          rolesSet += 1;
        }

        done += 1;
        console.log(`  [ok] ${p.name} → ${personUrl}`);
      } catch (e) {
        failed += 1;
        console.log(`  [ошибка] ${p.name}: ${e instanceof Error ? e.message : e}`);
        if (failed > 30 && failed > done) {
          throw new Error("Слишком много ошибок подряд — останавливаюсь");
        }
      }
      await sleep(DELAY_MS);
    }
  } finally {
    await client.close();
  }

  console.log(
    `\nГотово: обновлено ${done}, не найдено ${notFound}, ошибок ${failed}, ролей ${rolesSet}, соцссылок ${linksAdded}.`,
  );
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
