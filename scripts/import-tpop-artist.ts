import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { importTpopArtist } from "../src/lib/tpopAgencyImport";

/**
 * Одиночный импорт артиста/группы с tpop.fandom.com (полный профиль,
 * дискография, концерты; агентство — из поля Agency его страницы).
 *   npx tsx scripts/import-tpop-artist.ts https://tpop.fandom.com/wiki/TYTAN
 */
async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx scripts/import-tpop-artist.ts <tpop-artist-url>");
    process.exit(1);
  }
  const run = await prisma.importRun.create({ data: { kind: "tpop-artist" } });
  try {
    const summary = await importTpopArtist(url, { runId: run.id, onProgress: (m) => console.log(m) });
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        summary: `${url.split("/wiki/")[1] ?? url}: +${summary.performersCreated}/~${summary.performersUpdated}, альбомов ${summary.albumsTouched}, песен +${summary.songsCreated}, событий +${summary.eventsCreated}`,
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
