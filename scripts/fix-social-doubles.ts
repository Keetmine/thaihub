import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { oneProfilePlatformOf } from "../src/lib/socialLinks";

/**
 * Чистка задвоенных соцсетей КОМАНДОЙ (просьба владельца): у артиста
 * две+ ссылки на одну сеть «один профиль» (Instagram/TikTok/Twitter).
 * Это либо переименованный аккаунт (кейс Sea), либо ссылки тёзки,
 * приехавшие импортом на чужую карточку.
 *
 * MDL для сверки больше не годится — соцссылки со страниц людей они
 * убрали (проверено 2026-08-29: страница парсится целиком, соцссылок
 * ноль). Решаем по двум сигналам, кластером на артиста (у пары хэндлов
 * обычно задвоены сразу все сети):
 *
 *  1) ЖИВОСТЬ TIKTOK: у обоих кластеров есть тикток — пробуем оба.
 *     Живой профиль отдаёт в HTML `"uniqueId":"<хэндл>"`, снесённый —
 *     нет (и statusCode 10221). Ровно один жив — оставляем его кластер
 *     целиком (переименование: старый хэндл мёртв).
 *  2) ИМЯ В СЛАГЕ MDL: оба живы или тиктока нет — тёзки. Карточка
 *     принадлежит человеку из mydramalistUrl, а слаг MDL содержит его
 *     полное имя (nut-supanut-lohachala). Хэндл, совпавший с токеном
 *     слага (и только один), — хэндл хозяина карточки.
 *
 * Не решилось — НИЧЕГО не удаляем, в отчёт: угадывать между
 * переименованием и тёзкой опаснее, чем оставить дубль. Удаляются
 * только строки ЗАДВОЕННЫХ сетей проигравшего кластера — одиночные
 * ссылки (youtube и т.п.) не трогаем.
 *
 *   docker compose exec app npx tsx scripts/fix-social-doubles.ts           # черновой
 *   docker compose exec app npx tsx scripts/fix-social-doubles.ts --apply
 */
const apply = process.argv.includes("--apply");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36";

/** «Ядро» хэндла из ссылки: первый сегмент пути без @ и не-букв, в
 *  нижнем регистре — им ссылки одного аккаунта сцепляются между
 *  сетями (mark.pakin и markpakin — одно ядро). */
function handleCore(url: string): string | null {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
    const core = seg.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return core || null;
  } catch {
    return null;
  }
}

/** Самая длинная общая подстрока — мера «это один и тот же человек с
 *  чуть разными хэндлами» (mmarkpkk и markpakin делят «markp»). */
function longestCommonSubstring(a: string, b: string): number {
  let best = 0;
  const dp = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag + 1 : 0;
      if (dp[j] > best) best = dp[j];
      prevDiag = tmp;
    }
  }
  return best;
}

/** Жив ли тикток-аккаунт. null — не удалось понять (сеть, блок). */
async function tiktokAlive(url: string): Promise<boolean | null> {
  const core = handleCore(url);
  if (!core) return null;
  try {
    const res = await fetch(`https://www.tiktok.com/@${core}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.toLowerCase().includes(`"uniqueid":"${core}"`)) return true;
    if (/statusCode":10221|Couldn.t find this account/i.test(html)) return false;
    return null;
  } catch {
    return null;
  }
}

/** Токены личности хозяина карточки: имя из слага MDL-страницы
 *  (/people/58119-sea-tawinan-anukoolprasert), реальное имя и «также
 *  известен как» из нашей же карточки. У тёзок именно реальное имя
 *  решает, чей хэндл (rain_issada → Rain с realName Issada …). */
function identityTokens(p: {
  name: string;
  mydramalistUrl: string | null;
  realName: string | null;
  alsoKnownAs: string | null;
}): string[] {
  // Сценическое имя — НЕ токен: оно есть в обоих хэндлах (vino_chavid
  // и itsss_me_vino оба содержат «vino»), и с ним всегда ничья.
  const stage = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  const slug = p.mydramalistUrl?.match(/\/people\/\d+-([a-z0-9-]+)/i)?.[1];
  for (const t of slug?.toLowerCase().split("-") ?? []) if (t.length >= 4) out.add(t);
  for (const field of [p.realName, p.alsoKnownAs]) {
    for (const w of (field ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 4) out.add(w);
    }
  }
  out.delete(stage);
  return [...out].filter((t) => !stage.includes(t));
}

async function main() {
  const links = await prisma.performerLink.findMany({
    select: {
      id: true,
      url: true,
      performer: {
        select: {
          id: true,
          name: true,
          slug: true,
          mydramalistUrl: true,
          realName: true,
          alsoKnownAs: true,
        },
      },
    },
  });

  // Артист → сеть → строки; интересны только задвоенные сети.
  type Row = { id: string; url: string; network: string; core: string | null };
  const byPerformer = new Map<
    string,
    { performer: (typeof links)[number]["performer"]; rows: Row[] }
  >();
  const perNetworkCount = new Map<string, number>();
  for (const l of links) {
    const network = oneProfilePlatformOf(l.url);
    if (!network) continue;
    perNetworkCount.set(
      `${l.performer.id}::${network}`,
      (perNetworkCount.get(`${l.performer.id}::${network}`) ?? 0) + 1,
    );
    const entry = byPerformer.get(l.performer.id) ?? { performer: l.performer, rows: [] };
    entry.rows.push({ id: l.id, url: l.url, network, core: handleCore(l.url) });
    byPerformer.set(l.performer.id, entry);
  }

  let resolved = 0;
  let deletedTotal = 0;
  const manual: string[] = [];

  for (const { performer: p, rows } of byPerformer.values()) {
    const doubledRows = rows.filter((r) => (perNetworkCount.get(`${p.id}::${r.network}`) ?? 0) > 1);
    if (doubledRows.length === 0) continue;
    const who = `${p.name} (/artists/${p.slug ?? "?"})`;

    // Кластеры по ядру хэндла; близкие ядра склеиваем — у одного
    // человека хэндлы по сетям чуть разные (supanut и supanut_l).
    // Сценическое имя перед сравнением ВЫРЕЗАЕМ: sea_ta_lay и
    // sea_tawinan делят «seata» только потому, что оба начинаются с
    // sea, — без выреза они склеились бы в один кластер. Ошибочная
    // склейка не удаляет лишнего: удаляются только ПРОИГРАВШИЕ
    // кластеры, а победителя выбирают сигналы ниже.
    const stageName = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const distinctive = (core: string) =>
      stageName.length >= 3 ? core.replace(stageName, "") : core;
    const similarCores = (a: string, b: string) =>
      a.includes(b) ||
      b.includes(a) ||
      longestCommonSubstring(distinctive(a), distinctive(b)) >= 4;
    const clusters = new Map<string, Row[]>();
    for (const r of doubledRows) {
      if (!r.core) continue;
      const similar = [...clusters.keys()].find((c) => similarCores(c, r.core!));
      const key = similar ?? r.core;
      clusters.set(key, [...(clusters.get(key) ?? []), r]);
    }
    if (clusters.size < 2) {
      manual.push(`${who}: хэндлы не разобрались на кластеры — ${doubledRows.map((r) => r.url).join(" · ")}`);
      continue;
    }

    const entries = [...clusters.entries()];
    let keepCore: string | null = null;
    let reason = "";

    // Сигнал 1: живость тиктока (только когда тикток есть у ВСЕХ кластеров).
    if (entries.every(([, rs]) => rs.some((r) => r.network === "tiktok"))) {
      const alive: (boolean | null)[] = [];
      for (const [, rs] of entries) {
        alive.push(await tiktokAlive(rs.find((r) => r.network === "tiktok")!.url));
        await sleep(500);
      }
      const aliveIdx = entries.map((_, i) => i).filter((i) => alive[i] === true);
      const deadIdx = entries.map((_, i) => i).filter((i) => alive[i] === false);
      if (aliveIdx.length === 1 && deadIdx.length === entries.length - 1) {
        keepCore = entries[aliveIdx[0]][0];
        reason = `тикток @${keepCore} жив, остальные снесены`;
      }
    }

    // Сигнал 2: личность хозяина карточки — имя из MDL-слага, реальное
    // имя, «также известен как» (тёзки: оба хэндла живы, но карточка
    // принадлежит одному из людей).
    if (!keepCore) {
      const tokens = identityTokens(p);
      // Победитель обязан покрывать ВСЕ задвоенные сети: если у него
      // нет инстаграма, удаление «проигравших» оставило бы карточку
      // вовсе без инстаграма — а это чаще признак, что кластеры
      // разрезаны неверно (у Mark tiktok mark.pakin и twitter mmarkpkk
      // могут быть одним человеком). Такое — руками.
      const doubledNetworks = new Set(doubledRows.map((r) => r.network));
      // Совпадение токена с ядром: вложение или общая подстрока ≥5 —
      // хэндлы режут имена (sonyasarann ← Saranphat), строгое
      // вложение такое не ловит.
      const tokenHitsCore = (t: string, core: string) =>
        core.includes(t) || t.includes(core) || longestCommonSubstring(t, core) >= 5;
      const hit = (rs: Row[], core: string) =>
        tokens.some((t) => tokenHitsCore(t, core)) ||
        rs.some((r) => r.core != null && tokens.some((t) => tokenHitsCore(t, r.core!)));
      const matching = entries.filter(([core, rs]) => hit(rs, core));
      const winnerCovers =
        matching.length === 1 &&
        [...doubledNetworks].every((n) => matching[0][1].some((r) => r.network === n));
      if (tokens.length > 0 && matching.length === 1 && winnerCovers) {
        keepCore = matching[0][0];
        reason = `хэндл совпал с именем карточки (${tokens.slice(0, 4).join(", ")}…)`;
      } else if (tokens.length > 0 && matching.length === 1) {
        manual.push(
          `${who}${p.realName ? ` [${p.realName}]` : ""}${p.mydramalistUrl ? ` [${p.mydramalistUrl}]` : ""}: похоже на «${matching[0][0]}» (совпал с именем), но он не покрывает все сети — руками`,
        );
        continue;
      }
    }

    if (!keepCore) {
      manual.push(
        `${who}${p.realName ? ` [${p.realName}]` : ""}${p.mydramalistUrl ? ` [${p.mydramalistUrl}]` : ""}: не решилось — ${entries.map(([c, rs]) => `${c} (${rs.map((r) => r.network).join(",")})`).join(" против ")}`,
      );
      continue;
    }

    const drop = entries.filter(([core]) => core !== keepCore).flatMap(([, rs]) => rs);
    console.log(`${who}: оставляем «${keepCore}» — ${reason}`);
    for (const d of drop) console.log(`   удаляем ${d.url}`);
    if (apply) {
      await prisma.performerLink.deleteMany({ where: { id: { in: drop.map((d) => d.id) } } });
    }
    resolved += 1;
    deletedTotal += drop.length;
  }

  console.log(
    `\nРешено: ${resolved} артист(ов), ссылок к удалению: ${deletedTotal}${apply ? " — УДАЛЕНО" : " (черновой прогон, добавьте --apply)"}; руками: ${manual.length}`,
  );
  for (const m of manual) console.log(`  [руками] ${m}`);
}

main()
  .catch((e) => { console.error("FATAL", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
