import "dotenv/config";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";
import { downloadRemoteImage } from "../src/lib/localImage";
import { kpPersonKey, kpSocialUrl } from "../src/lib/kprofiles";
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from "../src/lib/socialLinks";
import type { KpPerson } from "./kprofiles-match";

/**
 * Шаг 4 разового импорта с kprofiles.com: кладёт в базу поля карточки и
 * пересказанные факты (см. docs/features/kprofiles-import.md).
 *
 * Правила — те же, что у остальных импортёров каталога:
 *  - **поля только в пустое**: дата рождения, рост, вес, группа крови,
 *    MBTI, место рождения, тайские написания, фото, автограф — если у
 *    карточки уже что-то стоит, не трогаем (там могла быть правка
 *    руками или MDL, который точнее);
 *  - **соцссылки — только недостающие платформы** (как у синка с MDL);
 *  - **факты — с сохранением оригинала**: прежние trivia и русский
 *    список уходят в TextRewrite (entity «performer», field «trivia»,
 *    original — JSON обоих списков), откат — запись их назад;
 *  - **новые карточки** заводятся только тем, у кого performerId пуст
 *    и нет похожих в каталоге (`candidates` пуст) — спорных решает
 *    владелец на странице дублей, а не скрипт;
 *  - картинки качаются к нам (`downloadRemoteImage`): фото — в
 *    /uploads/kprofiles, автограф — в /uploads/signatures; ссылок на
 *    чужой хост в базе не остаётся;
 *  - `kprofilesUrl` пишется всем тронутым — это отметка «карточка
 *    прошла через этот импорт» и точка возобновления.
 *
 * Факты берутся из tmp/kprofiles/facts/out/*.json — результата
 * подагентов. Без файла с фактами человек всё равно импортируется
 * (поля, ссылки, картинки), факты можно докатить вторым прогоном.
 *
 *   npx tsx -r dotenv/config scripts/kprofiles-import.ts            # сухой прогон
 *   npx tsx -r dotenv/config scripts/kprofiles-import.ts --apply
 *   … --only-facts     # только факты (поля уже накатили)
 *   … --rollback       # вернуть прежние факты из TextRewrite
 */

const PEOPLE = "tmp/kprofiles/people.json";
const FACTS_OUT = "tmp/kprofiles/facts/out";
const FACTS_DONE = "tmp/kprofiles/facts/done";
const MODEL = "haiku-4.5";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ONLY_FACTS = argv.includes("--only-facts");

type FactsItem = { id: string; en: string[]; ru: string[] };

/** Проверки на входе — как у text-import.ts: пустое, кривое и «ответ
 *  модели вместо текста» в базу не идёт. */
function badFacts(item: FactsItem): string | null {
  if (!Array.isArray(item.en) || !Array.isArray(item.ru)) return "нет списков";
  if (item.en.length === 0) return "пустой список";
  if (item.en.length !== item.ru.length) return `en ${item.en.length} ≠ ru ${item.ru.length}`;
  for (const f of [...item.en, ...item.ru]) {
    if (typeof f !== "string" || f.trim().length < 5) return "слишком короткий факт";
    if (/^(вот|here|переписанн|rewritten|факты:)/i.test(f.trim())) return "похоже на ответ модели";
    if (/kprofiles|copy-paste|скопируй/i.test(f)) return "служебный текст сайта";
  }
  if (item.ru.some((f) => /дорам/i.test(f.replace(/коридорам/gi, "")))) return "«дорама» в тексте";
  return null;
}

function loadFacts(): Map<string, FactsItem> {
  const out = new Map<string, FactsItem>();
  if (!existsSync(FACTS_OUT)) return out;
  for (const f of readdirSync(FACTS_OUT).filter((n) => n.endsWith(".json"))) {
    let data: { items?: FactsItem[] };
    try {
      data = JSON.parse(readFileSync(`${FACTS_OUT}/${f}`, "utf8"));
    } catch {
      console.log(`  [битый JSON] ${f}`);
      continue;
    }
    for (const it of data.items ?? []) out.set(it.id, it);
  }
  return out;
}

async function rollback() {
  const rows = await prisma.textRewrite.findMany({ where: { entity: "performer", field: "trivia" } });
  console.log(`откат фактов: ${rows.length} карточек${APPLY ? "" : " (сухой прогон)"}`);
  if (!APPLY) return;
  for (const r of rows) {
    const orig = r.original ? (JSON.parse(r.original) as { en: string[]; ru: string[] }) : { en: [], ru: [] };
    const p = await prisma.performer.findUnique({ where: { id: r.entityId }, select: { translations: true } });
    const tr = (p?.translations as Record<string, Record<string, unknown>> | null) ?? {};
    const ru = { ...(tr.ru ?? {}) };
    if (orig.ru.length) ru.trivia = orig.ru;
    else delete ru.trivia;
    await prisma.performer.update({
      where: { id: r.entityId },
      data: { trivia: orig.en, translations: { ...tr, ru } as Prisma.InputJsonValue },
    });
  }
  await prisma.textRewrite.deleteMany({ where: { entity: "performer", field: "trivia" } });
  console.log("прежние факты возвращены");
}

async function main() {
  if (argv.includes("--rollback")) return rollback();

  const people = JSON.parse(readFileSync(PEOPLE, "utf8")) as KpPerson[];
  const facts = loadFacts();
  mkdirSync(FACTS_DONE, { recursive: true });
  console.log(`людей ${people.length}, результатов с фактами ${facts.size}${APPLY ? "" : " — сухой прогон"}`);

  // Агентства — по названию, без сети: «GMMTV», «Domundi TV».
  const agencies = await prisma.agency.findMany({ select: { id: true, name: true } });
  const agencyByName = new Map(agencies.map((a) => [a.name.toLowerCase().replace(/\s+/g, " ").trim(), a.id]));
  const findAgency = (company: string | null) => {
    if (!company) return null;
    const c = company.toLowerCase().replace(/\s+/g, " ").trim();
    return agencyByName.get(c) ?? agencyByName.get(c.replace(/\s*(tv|entertainment|studio)$/i, "")) ?? null;
  };

  // Построчный отчёт для владельца (просьба 2026-09-26: «прислать
  // список актёров, которым меняем инфу: ник, полное имя, что добавили»).
  type ReportRow = { nick: string; realName: string; isNew: boolean; added: string[]; skipped?: string };
  const report: ReportRow[] = [];
  const FIELD_RU: Record<string, string> = {
    realName: "полное имя", birthDate: "дата рождения", height: "рост", weight: "вес",
    bloodType: "группа крови", mbti: "MBTI", placeOfBirth: "место рождения",
    nationality: "гражданство", alsoKnownAs: "тайское написание", photoUrl: "фото",
    signatureUrl: "автограф",
  };

  const stat = { updated: 0, created: 0, skipped: 0, factsWritten: 0, factsRejected: 0, fields: 0, links: 0, photos: 0, signatures: 0, agencies: 0 };

  for (const p of people) {
    const key = kpPersonKey(p);
    if (p.match === "ambiguous") {
      stat.skipped++;
      report.push({ nick: p.stageName ?? "", realName: p.birthName ?? "", isNew: false, added: [], skipped: `спорное: ${p.candidates.join(", ")}` });
      continue;
    }
    let id = p.performerId;

    // --- новая карточка ---
    if (!id) {
      // Обрывок профиля без полного имени («Peck Palitchoke» рядом с
      // «Peck», «PP Krit» рядом с «PP», «mindfreakkk» с одним фото) —
      // вторая страница того же человека или вовсе не человек. Новую
      // карточку по нему не заводим, если фактов нет или его ник уже
      // занят кем-то из списка.
      const firstWord = (s: string | null) => (s ?? "").toLowerCase().split(/\s+/)[0];
      const fragment =
        !p.birthName &&
        (p.facts.length === 0 ||
          people.some((o) => o !== p && firstWord(o.stageName) === firstWord(p.stageName)));
      if (fragment) {
        stat.skipped++;
        report.push({ nick: p.stageName ?? "", realName: "", isNew: true, added: [], skipped: "обрывок профиля без полного имени — дубль или не человек" });
        continue;
      }
      if (p.candidates.length > 0 || !p.stageName) {
        stat.skipped++;
        report.push({ nick: p.stageName ?? "", realName: p.birthName ?? "", isNew: true, added: [], skipped: `похож на: ${p.candidates.join("; ")}` });
        continue;
      }
      if (ONLY_FACTS) continue;
      if (APPLY) {
        const created = await prisma.performer.create({
          data: { name: p.stageName, type: "SOLO", realName: p.birthName, kprofilesUrl: p.sourceUrl },
          select: { id: true },
        });
        id = created.id;
      } else {
        id = `new:${key}`;
      }
      stat.created++;
      console.log(`  + ${p.stageName} (${p.birthName ?? "—"})`);
    }

    const existing = APPLY || !id.startsWith("new:")
      ? await prisma.performer.findUnique({
          where: { id },
          select: {
            id: true, name: true, realName: true, alsoKnownAs: true, birthDate: true, height: true, weight: true,
            bloodType: true, mbti: true, placeOfBirth: true, nationality: true, photoUrl: true, signatureUrl: true,
            trivia: true, translations: true, agencies: { select: { agencyId: true } }, links: { select: { url: true } },
          },
        })
      : null;

    const added: string[] = [];
    // --- поля: только в пустое ---
    if (!ONLY_FACTS) {
      const data: Record<string, unknown> = {};
      const e = existing;
      const setIf = (field: string, empty: boolean, value: unknown) => {
        if (empty && value != null && value !== "") { data[field] = value; stat.fields++; added.push(FIELD_RU[field] ?? field); }
      };
      setIf("realName", !e?.realName, p.birthName);
      setIf("birthDate", !e?.birthDate, p.birthDate ? new Date(`${p.birthDate}T00:00:00Z`) : null);
      setIf("height", !e?.height, p.height);
      setIf("weight", !e?.weight, p.weight);
      setIf("bloodType", !e?.bloodType, p.bloodType);
      setIf("mbti", !e?.mbti, p.mbti);
      setIf("placeOfBirth", !e?.placeOfBirth, p.placeOfBirth);
      setIf("nationality", !e?.nationality, p.nationality);
      // Тайские написания — в alsoKnownAs, если оно пустое: своего поля
      // под них нет, а фанатам они нужны для поиска.
      const thai = [p.stageNameThai, p.birthNameThai].filter(Boolean).join(" · ");
      setIf("alsoKnownAs", !e?.alsoKnownAs, thai || null);
      if (APPLY) {
        if (!e?.photoUrl && p.photoUrl) {
          const local = await downloadRemoteImage(p.photoUrl, "kprofiles");
          if (local && !/^https?:/i.test(local)) { data.photoUrl = local; stat.photos++; added.push("фото"); }
        }
        if (!e?.signatureUrl && p.signatureUrl) {
          const local = await downloadRemoteImage(p.signatureUrl, "signatures");
          if (local && !/^https?:/i.test(local)) { data.signatureUrl = local; stat.signatures++; added.push("автограф"); }
        }
      } else {
        if (!e?.photoUrl && p.photoUrl) { stat.photos++; added.push("фото"); }
        if (!e?.signatureUrl && p.signatureUrl) { stat.signatures++; added.push("автограф"); }
      }
      data.kprofilesUrl = p.sourceUrl;
      if (APPLY) await prisma.performer.update({ where: { id }, data });

      // --- соцссылки: недостающие платформы ---
      const have = new Set((e?.links ?? []).map((l) => detectSocialPlatform(l.url)).filter(Boolean));
      for (const s of p.socials) {
        const url = kpSocialUrl(s);
        const platform = detectSocialPlatform(url);
        if (!platform || have.has(platform)) continue;
        have.add(platform);
        if (APPLY) await prisma.performerLink.create({ data: { performerId: id, label: SOCIAL_PLATFORM_LABELS[platform], url } });
        stat.links++;
        added.push(SOCIAL_PLATFORM_LABELS[platform]);
      }

      // --- агентство: только если у карточки ни одного ---
      const agencyId = findAgency(p.company);
      if (agencyId && (e?.agencies.length ?? 0) === 0) {
        if (APPLY) await prisma.performerAgency.create({ data: { performerId: id, agencyId } });
        stat.agencies++;
        added.push("агентство");
      }
    }

    // --- факты ---
    const item = facts.get(key);
    if (item) {
      const bad = badFacts(item);
      if (bad) {
        stat.factsRejected++;
        console.log(`  [факты не приняты] ${p.stageName}: ${bad}`);
      } else {
        const already = existing ? await prisma.textRewrite.findUnique({ where: { entity_entityId_field: { entity: "performer", entityId: existing.id, field: "trivia" } } }) : null;
        if (already) {
          // уже импортировано — не перезаписываем
        } else {
          if (APPLY) {
            const tr = (existing?.translations as Record<string, Record<string, unknown>> | null) ?? {};
            const original = JSON.stringify({ en: existing?.trivia ?? [], ru: (tr.ru?.trivia as string[] | undefined) ?? [] });
            await prisma.performer.update({
              where: { id },
              data: {
                trivia: item.en,
                translations: { ...tr, ru: { ...(tr.ru ?? {}), trivia: item.ru } } as Prisma.InputJsonValue,
              },
            });
            await prisma.textRewrite.create({
              data: { entity: "performer", entityId: id, field: "trivia", original, rewritten: JSON.stringify(item), model: MODEL },
            });
            writeFileSync(`${FACTS_DONE}/${encodeURIComponent(key)}.json`, JSON.stringify(item));
          }
          stat.factsWritten++;
          added.push(`факты: ${item.en.length}${(existing?.trivia.length ?? 0) > 0 ? ` (слиты с нашими ${existing!.trivia.length})` : ""}`);
        }
      }
    }
    if (existing || APPLY) stat.updated++;
    report.push({ nick: p.stageName ?? "", realName: p.birthName ?? "", isNew: !p.performerId, added });
  }

  // Отчёт — markdown-таблица: новые, обновлённые, отложенные.
  const cell = (v: string) => v.replace(/\|/g, "/");
  const lines = [
    `# kprofiles: что меняется у артистов${APPLY ? "" : " (сухой прогон)"}`,
    "",
    `Обновлено ${report.filter((r) => !r.isNew && !r.skipped && r.added.length).length}, заведено ${report.filter((r) => r.isNew && !r.skipped).length}, отложено ${report.filter((r) => r.skipped).length}, без изменений ${report.filter((r) => !r.skipped && !r.added.length).length}.`,
    "",
    "| Ник | Полное имя | Карточка | Что добавляется |",
    "|---|---|---|---|",
    ...report
      .filter((r) => r.skipped || r.added.length)
      .sort((a, b) => Number(!!a.skipped) - Number(!!b.skipped) || Number(b.isNew) - Number(a.isNew) || a.nick.localeCompare(b.nick))
      .map((r) => `| ${cell(r.nick)} | ${cell(r.realName)} | ${r.skipped ? "отложена" : r.isNew ? "новая" : "есть"} | ${cell(r.skipped ?? [...new Set(r.added)].join(", "))} |`),
  ];
  writeFileSync("tmp/kprofiles/report.md", lines.join("\n") + "\n");
  console.log("\nотчёт по артистам → tmp/kprofiles/report.md");

  console.log(
    `\nобновлено карточек ${stat.updated}, заведено ${stat.created}, пропущено (спорные) ${stat.skipped}\n` +
      `полей заполнено ${stat.fields}, ссылок +${stat.links}, агентств +${stat.agencies}, фото ${stat.photos}, автографов ${stat.signatures}\n` +
      `фактов: записано у ${stat.factsWritten}, не принято ${stat.factsRejected}` +
      (APPLY ? "" : "\nсухой прогон — добавьте --apply"),
  );
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
