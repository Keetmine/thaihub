import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { DRAMA_TITLE_SELECT, dramaTitleForLocale } from "@/lib/dramaLocale";
import { dramaHref } from "@/lib/dramaSlug";
import type { Locale } from "@/lib/i18n/config";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Мини-игра «Угадай сериал по постеру» (/game): сборка раунда и
 * проверка ответа. Логика лежит в lib, а не в actions.ts, потому что
 * первый раунд рисует серверная страница — ей экшен не нужен.
 *
 * Главное правило: правильный ответ НЕ уезжает на клиент в открытую.
 * Раунд несёт четыре варианта без пометки и «ключ» — id правильного
 * сериала, зашифрованный серверным ключом. Проверка — второй вызов
 * экшена: он расшифровывает ключ и сравнивает. Иначе достаточно
 * открыть devtools, и игра обесценивается.
 */

// Ключ шифрования — на процесс, не из env: у проекта нет общего
// секрета для подписи (ADMIN_SESSION_SECRET в коде не используется),
// а заводить обязательную переменную ради игры — лишняя жёсткость.
// Цена: рестарт сервера (или пересборка модуля в dev) обрывает
// начатые раунды — клиент получает status: "expired" и берёт новый.
const ROUND_KEY = randomBytes(32);

/** Вариант ответа: название уже на языке зрителя. */
export type GameOption = { id: string; title: string };

export type GameRound = {
  posterUrl: string;
  /** Зашифрованный id правильного сериала — вернуть в answerGameRound. */
  token: string;
  options: GameOption[];
};

export type GameAnswer =
  | { status: "expired" }
  | {
      status: "answered";
      correct: boolean;
      /** Каким вариантом был правильный — клиент подсвечивает кнопку. */
      correctId: string;
      /** Ссылка на страницу сериала под расфокусированным постером. */
      drama: { title: string; href: string; year: number | null };
    };

/** В раунде всегда четыре варианта: 1 правильный + 3 ложных. */
const DECOY_COUNT = 3;

function encryptRoundToken(dramaId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ROUND_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(dramaId, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decryptRoundToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", ROUND_KEY, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    // Побитый или чужой токен, либо ключ сменился после рестарта —
    // раунд просто «истёк», клиент возьмёт новый.
    return null;
  }
}

/** Сколько лет назад сериал ещё «свежий» для игры. */
const GAME_YEARS = 5;

/**
 * Из чего играем (правка владельца 2026-09-10): ТОЛЬКО тайские сериалы
 * последних пяти лет.
 *
 * Каталог у нас куда шире (корейское, японское, тайваньское, старое), но
 * игра — витрина сайта про лакорны, и угадывать японский фильм 2009-го
 * тут не про что. Заодно узкий пул делает раунд честнее: варианты
 * похожи друг на друга, и правильный не выдаёт себя одной строкой.
 *
 * Постер — только НАШ: внешние ссылки бывают битыми (аудит 2026-09), а
 * /uploads раздаётся с диска.
 */
function gamePool(): Prisma.DramaWhereInput {
  // Год считаем при каждом раунде, а не при старте процесса: сервер
  // живёт месяцами, и «последние пять лет» не должны застыть.
  return {
    posterUrl: { startsWith: "/uploads" },
    country: "Thailand",
    year: { gte: new Date().getUTCFullYear() - GAME_YEARS },
  };
}

const OPTION_SELECT = { id: true, ...DRAMA_TITLE_SELECT } as const;

function shuffle<T>(items: T[]): T[] {
  // Fisher–Yates; Math.random достаточно — это игра, не криптография.
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Случайный срез кандидатов: count + случайный skip вместо ORDER BY
 *  random() — остаёмся в типизированном Prisma и не сканируем таблицу. */
async function randomSlice(where: Prisma.DramaWhereInput, take: number) {
  const count = await prisma.drama.count({ where });
  if (count === 0) return [];
  const skip = count > take ? Math.floor(Math.random() * (count - take + 1)) : 0;
  return prisma.drama.findMany({
    where,
    select: OPTION_SELECT,
    // Стабильный порядок обязателен: skip без orderBy отдаёт что попало.
    orderBy: { id: "asc" },
    skip,
    take,
  });
}

/**
 * Три ложных варианта. Ярусы от узкого к широкому: тот же тип и та же
 * страна (чтобы тайский сериал не выдавали три японских фильма — так
 * слишком легко), потом только страна, потом кто угодно. Постер ложным
 * вариантам не нужен — от них требуется лишь название.
 */
async function pickDecoys(
  target: { id: string; type: string | null; country: string | null },
  correctTitle: string,
  locale: Locale,
): Promise<GameOption[]> {
  // Ярусы внутри ИГРОВОГО пула: сначала тот же тип (сериал к сериалу,
  // фильм к фильму), потом весь пул. Страну в ярусы больше не кладём —
  // она в пуле и так одна (см. gamePool).
  const pool = gamePool();
  const tiers: Prisma.DramaWhereInput[] = [];
  if (target.type) tiers.push({ ...pool, type: target.type });
  tiers.push(pool);

  const picked: GameOption[] = [];
  // Названия сравниваем на языке зрителя: у дубликатов и переизданий
  // они совпадают, и два одинаковых варианта в раунде — подсказка.
  const usedTitles = new Set([correctTitle.toLowerCase()]);
  const usedIds = new Set([target.id]);

  for (const tier of tiers) {
    if (picked.length >= DECOY_COUNT) break;
    const pool = await randomSlice(
      { ...tier, id: { notIn: [...usedIds] } },
      // Срез с запасом: часть кандидатов отсеется по совпавшим названиям.
      40,
    );
    for (const d of shuffle(pool)) {
      if (picked.length >= DECOY_COUNT) break;
      const title = dramaTitleForLocale(d, locale);
      if (usedTitles.has(title.toLowerCase())) continue;
      usedTitles.add(title.toLowerCase());
      usedIds.add(d.id);
      picked.push({ id: d.id, title });
    }
  }
  return picked;
}

/** Собрать раунд. null — играть не из чего (нет постеров или в базе
 *  меньше четырёх различимых названий) — страница покажет пустое
 *  состояние. */
export async function buildGameRound(locale: Locale): Promise<GameRound | null> {
  const pool = gamePool();
  const count = await prisma.drama.count({ where: pool });
  if (count === 0) return null;

  const target = await prisma.drama.findFirst({
    where: pool,
    select: { ...OPTION_SELECT, posterUrl: true, type: true, country: true },
    orderBy: { id: "asc" },
    skip: Math.floor(Math.random() * count),
  });
  if (!target?.posterUrl) return null;

  const correctTitle = dramaTitleForLocale(target, locale);
  const decoys = await pickDecoys(target, correctTitle, locale);
  if (decoys.length < DECOY_COUNT) return null;

  return {
    posterUrl: target.posterUrl,
    token: encryptRoundToken(target.id),
    options: shuffle([{ id: target.id, title: correctTitle }, ...decoys]),
  };
}

/** Проверить ответ раунда по его токену. */
export async function resolveGameAnswer(
  token: string,
  chosenId: string,
  locale: Locale,
): Promise<GameAnswer> {
  const correctId = decryptRoundToken(token);
  if (!correctId) return { status: "expired" };

  const drama = await prisma.drama.findUnique({
    where: { id: correctId },
    select: { id: true, slug: true, year: true, ...DRAMA_TITLE_SELECT },
  });
  // Сериал успели удалить, пока человек думал, — раунд не засчитываем.
  if (!drama) return { status: "expired" };

  return {
    status: "answered",
    correct: chosenId === correctId,
    correctId,
    drama: {
      title: dramaTitleForLocale(drama, locale),
      href: dramaHref(drama),
      year: drama.year,
    },
  };
}
