import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import {
  PROFILE_DRAMA_PRIVATE,
  PROFILE_DRAMA_PUBLIC,
  PROFILE_OWNER_EMAIL,
  PROFILE_VIEWER_EMAIL,
} from "./testProfileFixtures";

/** Уборка за profile-privacy.spec.ts: отзывы, поездки и сессии уходят
 *  каскадом вместе с пользователями и сериалами. Идемпотентно. */
async function main() {
  await prisma.user.deleteMany({
    where: { email: { in: [PROFILE_OWNER_EMAIL, PROFILE_VIEWER_EMAIL] } },
  });
  await prisma.drama.deleteMany({
    where: { slug: { in: [PROFILE_DRAMA_PRIVATE.slug, PROFILE_DRAMA_PUBLIC.slug] } },
  });
  console.log("ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
