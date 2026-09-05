import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Убирает всё, что создал create-mascot-draft-fixture.ts (и то, что
// спек успел создать одобрением): черновики и исполнителей с меткой.
// MascotOwner-связи уходят каскадом вместе с Performer.

const MARK = "MASCOTDRAFT_E2E";

async function main() {
  await prisma.mascotDraft.deleteMany({ where: { name: { contains: MARK } } });
  await prisma.performer.deleteMany({ where: { name: { contains: MARK } } });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
