import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { hashPassword } from "../../src/lib/userAuth";
import {
  PROFILE_DRAMA_PRIVATE,
  PROFILE_DRAMA_PUBLIC,
  PROFILE_OWNER_EMAIL,
  PROFILE_TEST_PASSWORD,
  PROFILE_VIEWER_EMAIL,
  PRIVATE_REVIEW_TEXT,
  PRIVATE_TRIP_TITLE,
  PUBLIC_REVIEW_TEXT,
  PUBLIC_TRIP_TITLE,
} from "./testProfileFixtures";

/**
 * Фикстуры profile-privacy.spec.ts: владелец с приватными данными
 * (приватный отзыв, приватная поездка) и посторонний зритель (НЕ друг).
 * Всё идемпотентно (upsert + deleteMany перед созданием); уборка —
 * delete-profile-fixtures.ts. Печатает JSON с id владельца — спек ходит
 * на /users/<id>.
 */
async function main() {
  const users: Record<string, string> = {};
  for (const email of [PROFILE_OWNER_EMAIL, PROFILE_VIEWER_EMAIL]) {
    const row = await prisma.user.upsert({
      where: { email },
      // tourCompletedAt: тур для новичков иначе перекрывает интерфейс.
      create: {
        email,
        passwordHash: hashPassword(PROFILE_TEST_PASSWORD),
        name: email.split("@")[0],
        tourCompletedAt: new Date(),
      },
      update: {
        passwordHash: hashPassword(PROFILE_TEST_PASSWORD),
        tourCompletedAt: new Date(),
        deletedAt: null,
      },
    });
    users[email] = row.id;
  }
  const ownerId = users[PROFILE_OWNER_EMAIL];

  const dramas: Record<string, string> = {};
  for (const d of [PROFILE_DRAMA_PRIVATE, PROFILE_DRAMA_PUBLIC]) {
    const row = await prisma.drama.upsert({
      where: { slug: d.slug },
      update: { title: d.title },
      create: { slug: d.slug, title: d.title },
    });
    dramas[d.slug] = row.id;
  }

  // Чистый лист: прошлый упавший прогон мог оставить строки.
  await prisma.review.deleteMany({
    where: { userId: ownerId, dramaId: { in: Object.values(dramas) } },
  });
  await prisma.review.create({
    data: {
      userId: ownerId,
      dramaId: dramas[PROFILE_DRAMA_PRIVATE.slug],
      rating: 2,
      text: PRIVATE_REVIEW_TEXT,
      isPrivate: true,
    },
  });
  await prisma.review.create({
    data: {
      userId: ownerId,
      dramaId: dramas[PROFILE_DRAMA_PUBLIC.slug],
      rating: 8,
      text: PUBLIC_REVIEW_TEXT,
      isPrivate: false,
    },
  });

  await prisma.trip.deleteMany({
    where: { userId: ownerId, title: { in: [PRIVATE_TRIP_TITLE, PUBLIC_TRIP_TITLE] } },
  });
  await prisma.trip.create({
    data: {
      userId: ownerId,
      title: PRIVATE_TRIP_TITLE,
      startDate: new Date("2027-01-10"),
      endDate: new Date("2027-01-20"),
      visibility: "PRIVATE",
    },
  });
  await prisma.trip.create({
    data: {
      userId: ownerId,
      title: PUBLIC_TRIP_TITLE,
      startDate: new Date("2027-02-10"),
      endDate: new Date("2027-02-20"),
      visibility: "PUBLIC",
    },
  });

  console.log(JSON.stringify({ ownerId }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
