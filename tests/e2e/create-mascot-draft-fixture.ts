import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Фикстуры для mascot-drafts.spec.ts: черновики маскотов в очереди
// PENDING (вкладка «Маскоты» на /admin/imports) + совпавший владелец.
// Всё помечено MASCOTDRAFT_E2E — убирает delete-mascot-draft-fixture.ts
// (отдельным tsx-процессом — Prisma в спеки не импортировать, см.
// docs/testing.md). Картинок нет нарочно: одобрение обходится без сети.

const MARK = "MASCOTDRAFT_E2E";

function payload(name: string, anchor: string) {
  return {
    name,
    anchor,
    sourceUrl: `https://gmmtv.fandom.com/wiki/Mascots#${anchor}`,
    imageUrl: null,
    description: `${name} is the mascot of the boys love pair Owner-Ghost (e2e fixture).`,
    ownerKind: "pair",
    owners: [
      { name: `${MARK} Owner`, wikiTitle: null },
      { name: `${MARK} Ghost`, wikiTitle: null },
    ],
    unmatchedOwners: [`${MARK} Ghost`],
  };
}

async function main() {
  const owner = await prisma.performer.upsert({
    where: { slug: "mascotdraft-e2e-owner" },
    update: {},
    create: { slug: "mascotdraft-e2e-owner", name: `${MARK} Owner`, type: "SOLO" },
  });
  const matched = [{ performerId: owner.id, name: `${MARK} Owner`, type: "SOLO" }];

  // reject — карточка с чипами и точечное «Отклонить»; approve —
  // «Одобрить» создаёт Performer типа MASCOT с владельцем.
  const drafts: [string, string][] = [
    [`${MARK} Rejectable`, "Rejectable"],
    [`${MARK} Approvable`, "Approvable"],
  ];
  for (const [name, anchor] of drafts) {
    const nameKey = name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    await prisma.mascotDraft.upsert({
      where: { nameKey },
      update: { status: "PENDING", reviewedAt: null, performerId: null },
      create: {
        nameKey,
        name,
        sourceUrl: `https://gmmtv.fandom.com/wiki/Mascots#${anchor}`,
        payload: payload(name, anchor),
        matchedOwners: matched,
      },
    });
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
