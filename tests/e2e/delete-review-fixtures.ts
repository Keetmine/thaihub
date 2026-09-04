import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import {
  REVIEW_AUTHOR_EMAIL,
  REVIEW_DRAMA,
  REVIEW_VIEWER_EMAIL,
} from "./testReviewFixtures";

/** Уборка за review-privacy.spec.ts: отзывы и сессии уходят каскадом
 *  вместе с пользователями и сериалом. Идемпотентно. */
async function main() {
  await prisma.user.deleteMany({
    where: { email: { in: [REVIEW_AUTHOR_EMAIL, REVIEW_VIEWER_EMAIL] } },
  });
  await prisma.drama.deleteMany({ where: { slug: REVIEW_DRAMA.slug } });
  console.log("ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
