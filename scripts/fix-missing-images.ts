import "dotenv/config";
import { stat } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { downloadRemoteImage } from "../src/lib/localImage";
import { scrapeTtmEvent } from "../src/lib/thaiticketmajor";

/**
 * Битые локальные картинки: в базе лежит путь `/uploads/…`, а файла на
 * диске нет. В проде такой путь отдаёт Caddy и честный 404 (см.
 * Caddyfile), а вот `next dev` промахивается мимо public/ и роняет
 * запрос в catch-all `(public)/[...missing]` — браузер на каждый показ
 * качает ~66 КБ HTML и рисует битую картинку.
 *
 * Скрипт проходит по шести полям-картинкам (Event.posterUrl,
 * Location.photoUrl, Performer.photoUrl, Drama.posterUrl,
 * Album.coverUrl, Novel.coverUrl), находит записи без файла и пытается
 * скачать оригинал заново. Имя локального файла — это последний сегмент
 * исходной ссылки (так его назвал downloadRemoteImage), поэтому по папке
 * и имени восстанавливается адрес источника:
 *
 *   /uploads/tmdb/<id>.webp      → https://image.tmdb.org/t/p/w500/<id>.jpg
 *   /uploads/albums/<id>=w….webp → https://lh3.googleusercontent.com/<id>=w…
 *   /uploads/posters/<slug>-<hex>-l.webp
 *                                → страница события на ThaiTicketMajor
 *                                  (или Event.sourceUrl, если он проставлен),
 *                                  оттуда берётся постер из JSON-LD
 *
 * Чего восстановить неоткуда (ручные загрузки `/uploads/<uuid>.webp`,
 * картинки из mdl/performers/novels) — тем поле обнуляется: карточка
 * нарисует буквенную заглушку, это штатное поведение.
 *
 * Осторожность с обнулением: поле чистится, только когда источника нет
 * вовсе или источник ответил 4xx (пропал насовсем). Сетевой сбой или
 * 5xx — запись не трогаем и пишем в итог отдельной строкой, чтобы
 * отвалившийся вайфай не стёр полсотни живых обложек.
 *
 * Меняются только эти шесть полей и только у записей, где файла реально
 * нет. Ничего не удаляется. Безопасно перезапускать.
 *
 * Запуск:
 *   npx tsx --env-file=.env scripts/fix-missing-images.ts          # показать
 *   npx tsx --env-file=.env scripts/fix-missing-images.ts --apply  # починить
 *
 * TMDB-картинки бывают недоступны без прокси (см. «Proxy caveat» в
 * docs/features/tmdb-import.md) — тогда запускать с NODE_USE_ENV_PROXY=1.
 */
const apply = process.argv.includes("--apply");

const PUBLIC_DIR = path.join(process.cwd(), "public");
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const GOOGLE_IMAGE_HOST = "https://lh3.googleusercontent.com";
const TTM_CONCERT_BASE = "https://www.thaiticketmajor.com/concert";

type Row = {
  id: string;
  /** Человекочитаемое имя записи — только для вывода. */
  label: string;
  url: string;
  /** Подсказка со страницей-источником, если у модели такое поле есть. */
  sourceUrl?: string | null;
};

type Field = {
  name: string;
  load: () => Promise<Row[]>;
  save: (id: string, url: string | null) => Promise<unknown>;
};

const FIELDS: Field[] = [
  {
    name: "Event.posterUrl",
    load: async () =>
      (
        await prisma.event.findMany({
          where: { posterUrl: { startsWith: "/uploads/" } },
          select: { id: true, title: true, posterUrl: true, sourceUrl: true },
        })
      ).map((r) => ({ id: r.id, label: r.title, url: r.posterUrl!, sourceUrl: r.sourceUrl })),
    save: (id, url) => prisma.event.update({ where: { id }, data: { posterUrl: url } }),
  },
  {
    name: "Location.photoUrl",
    load: async () =>
      (
        await prisma.location.findMany({
          where: { photoUrl: { startsWith: "/uploads/" } },
          select: { id: true, name: true, photoUrl: true },
        })
      ).map((r) => ({ id: r.id, label: r.name, url: r.photoUrl! })),
    save: (id, url) => prisma.location.update({ where: { id }, data: { photoUrl: url } }),
  },
  {
    name: "Performer.photoUrl",
    load: async () =>
      (
        await prisma.performer.findMany({
          where: { photoUrl: { startsWith: "/uploads/" } },
          select: { id: true, name: true, photoUrl: true },
        })
      ).map((r) => ({ id: r.id, label: r.name, url: r.photoUrl! })),
    save: (id, url) => prisma.performer.update({ where: { id }, data: { photoUrl: url } }),
  },
  {
    name: "Drama.posterUrl",
    load: async () =>
      (
        await prisma.drama.findMany({
          where: { posterUrl: { startsWith: "/uploads/" } },
          select: { id: true, title: true, posterUrl: true },
        })
      ).map((r) => ({ id: r.id, label: r.title, url: r.posterUrl! })),
    save: (id, url) => prisma.drama.update({ where: { id }, data: { posterUrl: url } }),
  },
  {
    name: "Album.coverUrl",
    load: async () =>
      (
        await prisma.album.findMany({
          where: { coverUrl: { startsWith: "/uploads/" } },
          select: { id: true, title: true, coverUrl: true },
        })
      ).map((r) => ({ id: r.id, label: r.title, url: r.coverUrl! })),
    save: (id, url) => prisma.album.update({ where: { id }, data: { coverUrl: url } }),
  },
  {
    name: "Novel.coverUrl",
    load: async () =>
      (
        await prisma.novel.findMany({
          where: { coverUrl: { startsWith: "/uploads/" } },
          select: { id: true, title: true, coverUrl: true },
        })
      ).map((r) => ({ id: r.id, label: r.title, url: r.coverUrl! })),
    save: (id, url) => prisma.novel.update({ where: { id }, data: { coverUrl: url } }),
  },
];

/** `/uploads/albums/xyz=w226-….webp` → {folder: "albums", base: "xyz=w226-…"} */
function splitLocalUrl(url: string): { folder: string; base: string } {
  const rel = url.replace(/^\/+uploads\/+/, "");
  const slash = rel.lastIndexOf("/");
  return {
    folder: slash === -1 ? "" : rel.slice(0, slash),
    base: stripExt(rel.slice(slash + 1)),
  };
}

const stripExt = (name: string) => name.replace(/\.[a-zA-Z0-9]+$/, "");

/** Последний сегмент ссылки без расширения — то самое, из чего
 *  downloadRemoteImage складывает локальное имя. */
function remoteBase(url: string): string | null {
  try {
    return stripExt(decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "")) || null;
  } catch {
    return null;
  }
}

async function fileExists(localUrl: string): Promise<boolean> {
  try {
    await stat(path.join(PUBLIC_DIR, localUrl.replace(/^\//, "")));
    return true;
  } catch {
    return false;
  }
}

type ProbeResult = { status: number; bytes: number; error?: string };

/** Жив ли источник. Спрашиваем один байт: HEAD на thaiticketmajor.com
 *  отдаёт 403, а Range отвечает 206 и полным размером в content-range. */
async function probe(url: string): Promise<ProbeResult> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const total = res.headers.get("content-range")?.split("/")[1];
    const bytes = total ? Number(total) : Number(res.headers.get("content-length") ?? 0);
    return { status: res.status, bytes: Number.isFinite(bytes) ? bytes : 0 };
  } catch (err) {
    return { status: 0, bytes: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 4xx (кроме 429) — источника больше нет, обнуляем. Сеть/5xx/429 —
 *  временное, запись не трогаем. */
const goneForGood = (p: ProbeResult) => p.status >= 400 && p.status < 500 && p.status !== 429;

/**
 * Постеры TTM лежат как `<слаг-события>-<13 hex>-l.<ext>`, а слаг —
 * это же имя страницы: `weirdo-101-the-first-gravity-6a67330fea432-l.png`
 * ← /concert/weirdo-101-the-first-gravity.html. Так восстанавливается
 * источник у событий, импортированных до появления Event.sourceUrl.
 */
function ttmPageFromPoster(base: string): string | null {
  const slug = base.replace(/-[0-9a-f]{10,16}-l$/i, "");
  if (slug === base || !slug) return null;
  return `${TTM_CONCERT_BASE}/${slug}.html`;
}

const normalizeTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Адрес постера со страницы TTM. Берём картинку, только если это
 *  ровно тот файл, которого не хватает, — или если совпало название
 *  события (тогда постер на сайте просто заменили на новый). */
async function ttmPoster(pageUrl: string, wantBase: string, title: string): Promise<string | null> {
  const event = await scrapeTtmEvent(pageUrl);
  if (!event.posterUrl) return null;
  const gotBase = remoteBase(event.posterUrl);
  if (gotBase && gotBase.toLowerCase() === wantBase.toLowerCase()) return event.posterUrl;
  if (event.title && normalizeTitle(event.title) === normalizeTitle(title)) return event.posterUrl;
  return null;
}

type Plan =
  | { kind: "download"; remoteUrl: string; folder: string; why: string }
  | { kind: "clear"; why: string };

/** Откуда качать заново — по папке, в которую складывал импорт. */
async function planFor(row: Row): Promise<Plan> {
  const { folder, base } = splitLocalUrl(row.url);
  if (!base) return { kind: "clear", why: "непонятный путь" };

  if (folder === "tmdb") {
    return { kind: "download", remoteUrl: `${TMDB_IMAGE_BASE}/${base}.jpg`, folder, why: "TMDB" };
  }

  // Обложки из YouTube Music: имя целиком повторяет сегмент ссылки
  // вместе с суффиксом размера (`…=w226-h226-l90-rj`).
  if (folder === "albums" && /=w\d+-h\d+/.test(base)) {
    return { kind: "download", remoteUrl: `${GOOGLE_IMAGE_HOST}/${base}`, folder, why: "YouTube Music" };
  }

  if (folder === "posters") {
    const pageUrl = row.sourceUrl ?? ttmPageFromPoster(base);
    if (!pageUrl) return { kind: "clear", why: "постер не похож на импорт с TTM" };
    try {
      const posterUrl = await ttmPoster(pageUrl, base, row.label);
      if (!posterUrl) return { kind: "clear", why: `на ${pageUrl} нет подходящего постера` };
      return { kind: "download", remoteUrl: posterUrl, folder, why: `TTM, ${pageUrl}` };
    } catch (err) {
      return { kind: "clear", why: `страница TTM не открылась: ${err instanceof Error ? err.message : err}` };
    }
  }

  return { kind: "clear", why: "источник неизвестен (ручная загрузка)" };
}

type Outcome = "восстановлено" | "обнулено" | "пропущено";

async function fixRow(field: Field, row: Row): Promise<Outcome> {
  const plan = await planFor(row);

  if (plan.kind === "clear") {
    if (!apply) {
      console.log(`  ${field.name}  ${row.label}\n    ${row.url}\n    → обнулить (${plan.why})`);
      return "обнулено";
    }
    await field.save(row.id, null);
    console.log(`  ${field.name}  ${row.label} — обнулено (${plan.why})`);
    return "обнулено";
  }

  if (!apply) {
    const p = await probe(plan.remoteUrl);
    const alive = p.status >= 200 && p.status < 400;
    console.log(
      `  ${field.name}  ${row.label}\n    ${row.url}\n` +
        `    → ${alive ? "перекачать" : "обнулить"} (${plan.why}: ${plan.remoteUrl}` +
        ` — ${p.error ?? `HTTP ${p.status}${p.bytes ? `, ${(p.bytes / 1024).toFixed(1)} КБ` : ""}`})`,
    );
    return alive ? "восстановлено" : goneForGood(p) ? "обнулено" : "пропущено";
  }

  const local = await downloadRemoteImage(plan.remoteUrl, plan.folder);
  if (local?.startsWith("/uploads/") && (await fileExists(local))) {
    // Обычно имя совпадает с тем, что уже в базе, — тогда строку не
    // трогаем вовсе, файл на диске и так починил картинку.
    if (local !== row.url) await field.save(row.id, local);
    console.log(`  ${field.name}  ${row.label} — скачано (${plan.why})${local === row.url ? "" : `\n    → ${local}`}`);
    return "восстановлено";
  }

  const p = await probe(plan.remoteUrl);
  if (goneForGood(p)) {
    await field.save(row.id, null);
    console.log(`  ${field.name}  ${row.label} — обнулено (источник отдал HTTP ${p.status})`);
    return "обнулено";
  }

  console.log(
    `  ${field.name}  ${row.label} — ПРОПУЩЕНО, поле не тронуто` +
      ` (не скачалось: ${p.error ?? `HTTP ${p.status}`}) — попробуйте позже`,
  );
  return "пропущено";
}

async function main() {
  const totals = { checked: 0, missing: 0, восстановлено: 0, обнулено: 0, пропущено: 0, ошибок: 0 };

  for (const field of FIELDS) {
    const rows = await field.load();
    const broken: Row[] = [];
    for (const row of rows) {
      if (!(await fileExists(row.url))) broken.push(row);
    }
    totals.checked += rows.length;
    totals.missing += broken.length;

    console.log(`${field.name}: локальных картинок ${rows.length}, без файла ${broken.length}`);
    for (const row of broken) {
      try {
        totals[await fixRow(field, row)] += 1;
      } catch (err) {
        // Одна запись не должна ронять весь проход.
        totals.ошибок += 1;
        console.log(`  ${field.name}  ${row.label} — ОШИБКА: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log(
    `\nПроверено записей: ${totals.checked}, без файла на диске: ${totals.missing}` +
      `\n  перекачано: ${totals.восстановлено}` +
      `\n  обнулено:   ${totals.обнулено}` +
      `\n  пропущено:  ${totals.пропущено}` +
      (totals.ошибок ? `\n  ошибок:     ${totals.ошибок}` : ""),
  );
  if (!apply) console.log("Это черновой прогон, в базе ничего не менялось — добавьте --apply.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
