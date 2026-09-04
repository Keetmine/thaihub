import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Уборка фикстур ttm-drafts.spec.ts — по метке TTMDRAFT/ttmdraft, что бы
// спека ни успела сделать с черновиком (отклонить, оставить).

async function main() {
  await prisma.eventDraft.deleteMany({ where: { sourceUrl: { contains: "ttmdraft-e2e" } } });
  await prisma.performer.deleteMany({ where: { name: { contains: "TTMDRAFT_E2E" } } });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
