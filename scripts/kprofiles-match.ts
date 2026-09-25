import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import {
  matchKpToCatalog,
  normalizeKpProfile,
  type KpCatalogRow,
  type KpNormalized,
  type KpProfile,
} from "../src/lib/kprofiles";

/**
 * Шаг 2 разового импорта с kprofiles.com: сырая выгрузка → люди →
 * сопоставление с каталогом (см. docs/features/kprofiles-import.md).
 *
 * Что делает:
 *  1. отбирает тайцев: страницы из общего списка и трёх групп, плюс те
 *     из прихваченных ссылок, у кого Nationality тайское — страницы
 *     групп ссылались и на корейские/китайские коллективы, их не берём;
 *  2. склеивает одного человека с двух страниц (в группе и на своей):
 *     факты объединяются, поля берутся с более полной;
 *  3. нормализует значения (дата, рост, вес, кровь, MBTI, соцсети);
 *  4. сопоставляет с каталогом (`matchKpToCatalog`, под тестом).
 *
 * Результат — tmp/kprofiles/people.json: у каждого `performerId`
 * (или null, если заводить новую карточку) и `match` — по какому
 * признаку. Неоднозначные печатаются списком: их разбирает владелец.
 *
 *   npx tsx -r dotenv/config scripts/kprofiles-match.ts
 */

const RAW = "tmp/kprofiles/raw.json";
const LIST = "tmp/kp-list.json";
const OUT = "tmp/kprofiles/people.json";
const GROUP_PAGES = ["domundi-members-profile-facts", "dexx-members-profile", "dmd-trainee-profile"];

export type KpPerson = KpNormalized & {
  performerId: string | null;
  match: string;
  candidates: string[];
};

const key = (p: { birthName: string | null; stageName: string | null }) =>
  (p.birthName ?? p.stageName ?? "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function main() {
  const raw = JSON.parse(readFileSync(RAW, "utf8")) as KpProfile[];
  const listUrls = new Set((JSON.parse(readFileSync(LIST, "utf8")) as { url: string }[]).map((r) => r.url));

  const thai = raw.filter(
    (p) =>
      listUrls.has(p.sourceUrl) ||
      GROUP_PAGES.some((g) => p.sourceUrl.includes(g)) ||
      /thai/i.test(p.fields["Nationality"] ?? ""),
  );

  // Один человек с двух страниц → одна запись. Факты объединяем, поля —
  // с той страницы, где фактов больше (она полнее), пустое добираем.
  const byKey = new Map<string, KpProfile>();
  for (const p of thai) {
    const k = key(p);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { ...p });
      continue;
    }
    const [rich, poor] = p.facts.length >= prev.facts.length ? [p, prev] : [prev, p];
    byKey.set(k, {
      ...rich,
      fields: { ...poor.fields, ...rich.fields },
      facts: [...new Set([...rich.facts, ...poor.facts])],
      stageNameThai: rich.stageNameThai ?? poor.stageNameThai,
      birthNameThai: rich.birthNameThai ?? poor.birthNameThai,
      signatureUrl: rich.signatureUrl ?? poor.signatureUrl,
      photoUrl: rich.photoUrl ?? poor.photoUrl,
      intro: rich.intro ?? poor.intro,
    });
  }

  const catalog: KpCatalogRow[] = (
    await prisma.performer.findMany({
      where: { type: "SOLO" },
      select: { id: true, name: true, realName: true, alsoKnownAs: true, links: { select: { url: true } } },
    })
  ).map((r) => ({
    id: r.id,
    name: r.name,
    realName: r.realName,
    alsoKnownAs: r.alsoKnownAs,
    instagram: r.links
      .map((l) => l.url.match(/instagram\.com\/@?([^/?#]+)/i)?.[1]?.toLowerCase())
      .filter((h): h is string => !!h),
  }));

  const people: KpPerson[] = [];
  const stats = new Map<string, number>();
  const ambiguous: string[] = [];
  const unmatched: string[] = [];
  for (const p of byKey.values()) {
    const n = normalizeKpProfile(p);
    const m = matchKpToCatalog(n, catalog);
    stats.set(m.via, (stats.get(m.via) ?? 0) + 1);
    const label = `${n.stageName ?? ""} ${n.birthName ?? ""}`.trim();
    if (m.performerId === null && m.via === "ambiguous") ambiguous.push(`${label}  [${m.candidates.join(", ")}]`);
    if (m.performerId === null && m.via === "none") {
      unmatched.push(m.candidates.length ? `${label}  ~ похоже на: ${m.candidates.join("; ")}` : label);
    }
    people.push({ ...n, performerId: m.performerId, match: m.via, candidates: "candidates" in m ? m.candidates : [] });
  }
  writeFileSync(OUT, JSON.stringify(people, null, 1));

  console.log(`сырых профилей ${raw.length} → тайских ${thai.length} → людей ${people.length}, фактов ${people.reduce((s, p) => s + p.facts.length, 0)}`);
  console.log("сопоставление:", [...stats].map(([k, v]) => `${k} ${v}`).join(", "));
  if (ambiguous.length) {
    console.log(`\nнеоднозначные (${ambiguous.length}) — разбирать руками, в импорт не идут:`);
    for (const a of ambiguous) console.log("  ·", a);
  }
  console.log(`\nне нашлись (${unmatched.length}) — новая карточка; у кого есть «похоже на», сначала глянуть глазами:`);
  for (const u of unmatched) console.log("  ·", u);
  console.log(`\n→ ${OUT}`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
