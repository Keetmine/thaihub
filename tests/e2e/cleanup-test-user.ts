import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Run out-of-process (via `tsx`, not imported into a spec file) because
// Playwright Test's own module loader can't load the generated Prisma
// client's ESM output — see the afterAll hook in favorites.spec.ts.
const email = process.argv[2];
if (!email) throw new Error("usage: tsx cleanup-test-user.ts <email>");

prisma.user
  .deleteMany({ where: { email } })
  .finally(() => prisma.$disconnect());
