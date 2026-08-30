import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { ADMIN_EMAIL } from "./helpers";
import {
  DL_TRANSLATED,
  DL_UNTRANSLATED,
  EPISODE_DRAMA,
  PHOTO_EVENT,
} from "./testAuditFixtures";

/**
 * Фикстуры для event-photos.spec.ts, episode-notifications.spec.ts и
 * doramaland-ru.spec.ts — отдельным tsx-процессом (Prisma в спеки не
 * импортировать, см. docs/testing.md). Идемпотентно: повторный запуск
 * приводит базу к тому же состоянию, а не плодит вторые фото и вторые
 * уведомления.
 *
 * Подписка админу: страница события целиком за пейволлом
 * (isPremiumActive в event/[id]/page.tsx), а фото живут на ней. Своего
 * премиум-юзера заводить незачем — вход админом уже сделан
 * setup-проектом, и лишний логин упёрся бы в лимит формы входа.
 * delete-audit-fixtures.ts подписку снимает.
 */

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  if (!admin) {
    throw new Error(
      `нет тестового админа ${ADMIN_EMAIL} — сначала должен пройти setup-проект ` +
        `(npx playwright test --project=setup), он же его и заводит`,
    );
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { premiumUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });

  /* ---------- Ж9: событие с фото для покупающих билеты ---------- */
  const event = await prisma.event.upsert({
    where: { slug: PHOTO_EVENT.slug },
    update: { title: PHOTO_EVENT.title, venue: PHOTO_EVENT.venue },
    create: {
      slug: PHOTO_EVENT.slug,
      title: PHOTO_EVENT.title,
      venue: PHOTO_EVENT.venue,
    },
  });
  // Дата в будущем: страница события строит шапку по ближайшей дате,
  // событие без дат — крайний случай, а спека не о нём.
  const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.eventOccurrence.deleteMany({ where: { eventId: event.id } });
  await prisma.eventOccurrence.create({ data: { eventId: event.id, startsAt } });
  // Фото пересобираются целиком — как это делают сами экшены события
  // (deleteMany + create), и заодно повторный прогон не даёт шести фото.
  await prisma.eventPhoto.deleteMany({ where: { eventId: event.id } });
  await prisma.eventPhoto.createMany({
    data: PHOTO_EVENT.photos.map((url, i) => ({ eventId: event.id, url, sort: i })),
  });

  /* ---------- З1: сериал, вчерашняя серия и подписка на неё ---------- */
  const drama = await prisma.drama.upsert({
    where: { slug: EPISODE_DRAMA.slug },
    update: { episodes: EPISODE_DRAMA.episodes, status: "RETURNING_SERIES" },
    create: {
      slug: EPISODE_DRAMA.slug,
      title: EPISODE_DRAMA.title,
      episodes: EPISODE_DRAMA.episodes,
      status: "RETURNING_SERIES",
    },
  });
  // Вчерашние бангкокские сутки: даты-без-времени лежат полуночью UTC
  // (см. lib/dates.ts), а окно рассылки — [последний вышедший день − 3
  // суток; последний вышедший день], где «последний» до 22:00 по
  // Бангкоку это вчера. Вчерашняя дата попадает в окно в любой час.
  const bkkNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const airDate = new Date(
    Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), bkkNow.getUTCDate() - 1),
  );
  const episode = await prisma.dramaEpisode.upsert({
    where: { dramaId_number: { dramaId: drama.id, number: EPISODE_DRAMA.episodeNumber } },
    update: { airDate },
    create: { dramaId: drama.id, number: EPISODE_DRAMA.episodeNumber, airDate },
  });
  // Колокольчик на странице сериала — именно он решает, кому слать
  // (а не статус просмотра). episodesWatched null: отмеченная серия
  // рассылку отменяет, «новость опоздала».
  await prisma.dramaWatchStatus.upsert({
    where: { userId_dramaId: { userId: admin.id, dramaId: drama.id } },
    update: { status: "WATCHING", notifyEpisodes: true, episodesWatched: null },
    create: {
      userId: admin.id,
      dramaId: drama.id,
      status: "WATCHING",
      notifyEpisodes: true,
    },
  });
  // Дедуп EpisodeNotification держится вечно, поэтому второй прогон без
  // этой чистки не отправил бы ничего и спека упала бы на пустой ленте.
  await prisma.episodeNotification.deleteMany({
    where: { userId: admin.id, episodeId: episode.id },
  });
  await prisma.notification.deleteMany({
    where: { userId: admin.id, kind: "EPISODE_AIRED", subject: EPISODE_DRAMA.title },
  });

  /* ---------- dorama.land: с переводом и без ---------- */
  await prisma.drama.upsert({
    where: { slug: DL_TRANSLATED.slug },
    update: {
      titleRu: DL_TRANSLATED.titleRu,
      synopsisRu: DL_TRANSLATED.synopsisRu,
      doramalandUrl: DL_TRANSLATED.doramalandUrl,
    },
    create: {
      slug: DL_TRANSLATED.slug,
      title: DL_TRANSLATED.title,
      titleRu: DL_TRANSLATED.titleRu,
      synopsisRu: DL_TRANSLATED.synopsisRu,
      doramalandUrl: DL_TRANSLATED.doramalandUrl,
    },
  });
  // Русские поля здесь чистятся ЯВНО: фильтр «Нет ру перевода» — это
  // `titleRu IS NULL`, и запись, которой прошлый прогон (или чужая
  // правка) дописал перевод, вымыла бы смысл проверки.
  await prisma.drama.upsert({
    where: { slug: DL_UNTRANSLATED.slug },
    update: { titleRu: null, synopsisRu: null, doramalandUrl: null },
    create: { slug: DL_UNTRANSLATED.slug, title: DL_UNTRANSLATED.title },
  });

  console.log("ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
