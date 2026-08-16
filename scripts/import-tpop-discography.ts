import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchTpopDiscography, fetchTpopPageImage } from "../src/lib/tpopDiscography";
import { downloadRemoteImage } from "../src/lib/localImage";

/**
 * Импортирует дискографию группы/артиста из статьи tpop.fandom.com:
 * альбомы/EP (с обложками со страниц самих альбомов) и песни/синглы
 * (с пояснениями — коллаборации, OST'ы). Исполнитель матчится по
 * названию статьи (name или musicAlias, без учёта регистра). Повторный
 * запуск безопасен: альбомы апсертятся по (performerId, title), песни
 * докидываются только новые. Запуск:
 *   npx tsx scripts/import-tpop-discography.ts <tpop-fandom-url-or-title>
 */
async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npx tsx scripts/import-tpop-discography.ts <tpop-fandom-url-or-title>");
    process.exit(1);
  }

  const disco = await fetchTpopDiscography(input);
  console.log(
    `«${disco.pageTitle}»: альбомов — ${disco.albums.length}, песен — ${disco.songs.length}`,
  );

  const performer = await prisma.performer.findFirst({
    where: {
      OR: [
        { name: { equals: disco.pageTitle, mode: "insensitive" } },
        { musicAlias: { equals: disco.pageTitle, mode: "insensitive" } },
      ],
    },
  });
  if (!performer) {
    console.error(`Исполнитель «${disco.pageTitle}» не найден в каталоге — сначала импортируй группу.`);
    process.exit(1);
  }

  let albumsCreated = 0;
  for (const album of disco.albums) {
    let coverUrl: string | null = null;
    if (album.pageTitle) {
      const remote = await fetchTpopPageImage(album.pageTitle);
      coverUrl = await downloadRemoteImage(remote, "albums");
    }
    const existing = await prisma.album.findUnique({
      where: { performerId_title: { performerId: performer.id, title: album.title } },
    });
    await prisma.album.upsert({
      where: { performerId_title: { performerId: performer.id, title: album.title } },
      create: {
        performerId: performer.id,
        title: album.title,
        type: album.type,
        year: album.year,
        coverUrl,
      },
      update: {
        type: album.type,
        year: album.year,
        // не затираем обложку, если новую не нашли
        ...(coverUrl ? { coverUrl } : {}),
      },
    });
    if (!existing) albumsCreated += 1;
    console.log(`  [альбом] ${album.title} (${album.year ?? "?"})${coverUrl ? " + обложка" : ""}`);
  }

  const existingSongs = await prisma.song.findMany({
    where: { performerId: performer.id },
    select: { title: true, note: true },
  });
  const seen = new Set(existingSongs.map((s) => `${s.title}|${s.note ?? ""}`));
  let songsCreated = 0;
  for (const song of disco.songs) {
    const key = `${song.title}|${song.note ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.song.create({
      data: {
        performerId: performer.id,
        title: song.title,
        note: song.note,
        year: song.year,
      },
    });
    songsCreated += 1;
    console.log(`  [песня] ${song.title}${song.note ? ` · ${song.note}` : ""} (${song.year ?? "?"})`);
  }

  console.log(`\nГотово: альбомов создано ${albumsCreated}, песен создано ${songsCreated}.`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
