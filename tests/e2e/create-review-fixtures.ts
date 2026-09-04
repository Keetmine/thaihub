import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { hashPassword } from "../../src/lib/userAuth";
import {
  REVIEW_AUTHOR_EMAIL,
  REVIEW_DRAMA,
  REVIEW_TEST_PASSWORD,
  REVIEW_VIEWER_EMAIL,
  VIEWER_PUBLIC_RATING,
} from "./testReviewFixtures";

/**
 * Фикстуры review-privacy.spec.ts: два пользователя (автор приватного
 * отзыва и зритель) и отдельный сериал, чтобы не трогать настоящие
 * записи. Зрителю сразу создаётся ПУБЛИЧНЫЙ отзыв с оценкой 10 — фон,
 * относительно которого проверяется, что приватная оценка не двигает
 * среднее. Всё через upsert — идемпотентно; уборка в
 * delete-review-fixtures.ts.
 */
async function main() {
  const users: Record<string, string> = {};
  for (const email of [REVIEW_AUTHOR_EMAIL, REVIEW_VIEWER_EMAIL]) {
    const row = await prisma.user.upsert({
      where: { email },
      // tourCompletedAt: тур для новичков иначе перекрывает интерфейс.
      create: {
        email,
        passwordHash: hashPassword(REVIEW_TEST_PASSWORD),
        name: email.split("@")[0],
        tourCompletedAt: new Date(),
      },
      update: {
        passwordHash: hashPassword(REVIEW_TEST_PASSWORD),
        tourCompletedAt: new Date(),
        deletedAt: null,
      },
    });
    users[email] = row.id;
  }

  const drama = await prisma.drama.upsert({
    where: { slug: REVIEW_DRAMA.slug },
    update: { title: REVIEW_DRAMA.title },
    create: { slug: REVIEW_DRAMA.slug, title: REVIEW_DRAMA.title },
  });

  // Прошлый прогон мог оставить отзывы (упавший спек не убирает за
  // собой) — начинаем с чистого листа и кладём только публичный фон.
  await prisma.review.deleteMany({
    where: { dramaId: drama.id, userId: { in: Object.values(users) } },
  });
  await prisma.review.create({
    data: {
      userId: users[REVIEW_VIEWER_EMAIL],
      dramaId: drama.id,
      rating: VIEWER_PUBLIC_RATING,
      text: "E2E public baseline review",
      isPrivate: false,
    },
  });

  console.log("ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
