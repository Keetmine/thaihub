import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { importTpopAgency } from "../src/lib/tpopAgencyImport";

/**
 * Импорт агентства целиком с tpop.fandom.com (тот же код, что и кнопка
 * в /admin/imports, но с логом в консоль). Запуск:
 *   npx tsx scripts/import-tpop-agency.ts https://tpop.fandom.com/wiki/RISER_MUSIC
 */
async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx scripts/import-tpop-agency.ts <tpop-agency-url>");
    process.exit(1);
  }
  const run = await prisma.importRun.create({ data: { kind: "tpop-agency" } });
  try {
    const summary = await importTpopAgency(url, {
      runId: run.id,
      onProgress: (m) => console.log(m),
    });
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        summary: `${summary.agencyName}: исполнителей +${summary.performersCreated}/~${summary.performersUpdated}, альбомов ${summary.albumsTouched}, песен +${summary.songsCreated}, событий +${summary.eventsCreated}`,
      },
    });
    console.log("\nИтог:", JSON.stringify(summary, null, 1));
  } catch (e) {
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), summary: String(e) },
    });
    throw e;
  }
}
main().then(() => process.exit(0));
