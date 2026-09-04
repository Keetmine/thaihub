import type { Prisma } from "@/generated/prisma/client";
import { dateKey, parseDateKey } from "@/lib/dates";

// Матчинг «спарсенное TTM-событие ↔ существующий Event каталога» для
// краулера афиши (docs/features/ttm-crawl.md, раздел «Дубли и бэкфилл
// источника»). Нужен потому, что дедуп по Event.sourceUrl слеп к
// событиям, импортированным ДО того, как ссылка-источник начала
// сохраняться (roadmap Э1.8: бэкфилл невозможен — URL не хранился), и
// краулер предлагал владельцу черновики того, что в каталоге уже есть.
//
// Два уровня уверенности:
//  - СИЛЬНОЕ — краулер/скрипт закрывают вопрос сами (черновик не
//    создаётся, sourceUrl бэкфилится);
//  - СЛАБОЕ — черновик создаётся, но с пометкой «возможный дубль», и
//    решает владелец.
// Чисто строковые функции вынесены отдельно от БД-поиска — юнит-тесты
// (tests/unit/eventDedupe.test.ts) гоняют их без базы.

/** Порог «высокой» похожести названий: выше — при общей дате считаем
 *  событием тем же самым. Подобран по живым названиям TTM: хвосты
 *  спонсоров/года дают 0.83–0.95, а «X CONCERT» против «X FAN MEETING»
 *  даже при длинном общем X остаётся ниже (см. юнит-тест). */
export const STRONG_TITLE_SIMILARITY = 0.82;
/** Порог «частичного» совпадения: ниже него даже общая дата — совпадение
 *  случайное (в один вечер в Бангкоке идёт десяток концертов). */
export const WEAK_TITLE_SIMILARITY = 0.55;
/** Окно поиска кандидатов вокруг дат черновика: даты у TTM и в каталоге
 *  расходятся максимум на перенос/добавленный день, не на месяц. */
export const CANDIDATE_WINDOW_DAYS = 14;

/** Пометка «похоже на существующее событие» в payload черновика —
 *  дополнительный ключ рядом с полями TtmEvent, миграции не требует.
 *  Название дублируем в пометке нарочно: чип в очереди рисуется без
 *  лишнего запроса, а удалённое событие не роняет карточку. */
export type PossibleDuplicate = { eventId: string; eventTitle: string };

/** Кандидат каталога в чистом матчинге: даты — ключи "YYYY-MM-DD". */
export type CatalogEventCandidate = {
  id: string;
  title: string;
  sourceUrl: string | null;
  dates: string[];
};

/** То, что матчингу нужно от черновика/распарса (подмножество TtmEvent). */
export type DraftLikeEvent = {
  title: string;
  date?: string | null;
  extraDates?: string[] | null;
};

export type DedupeMatch = {
  strength: "strong" | "weak";
  eventId: string;
  eventTitle: string;
  eventSourceUrl: string | null;
  similarity: number;
  sharedDates: string[];
};

// ------------------------------------------------------------- нормализация

// Названия в payload бывают с HTML-мнемониками (&#39; из JSON-LD) — без
// раскодирования «#39» пережил бы чистку пунктуации и стал бы токеном.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Нормализация названия для сравнения: casefold, юникод-совместимая
 * форма (полноширинные символы и т.п.), вся пунктуация/кавычки/тире —
 * в пробелы, пробелы схлопнуты. Слова НЕ выкидываются: «X CONCERT» и
 * «X FAN MEETING» — разные события одного артиста, и «шумовые» слова
 * здесь как раз несут смысл.
 */
export function normalizeEventTitle(raw: string): string {
  return decodeHtmlEntities(raw)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// -------------------------------------------------------------- похожесть

/** Классический Левенштейн в две строки — названия короткие, внешняя
 *  либа не нужна. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr.slice();
  }
  return prev[b.length];
}

/**
 * Похожесть двух УЖЕ нормализованных названий, 0..1.
 *
 * База — единица минус расстояние Левенштейна, делённое на длину более
 * длинного названия. Поверх — префикс-надбавка: если короткое название
 * целиком стоит в начале длинного по границе слова (типичные хвосты TTM:
 * спонсор, «...IN BANGKOK», год), похожесть не даём упасть ниже
 * 0.6 + 0.4·(len короткого / len длинного). Надбавка требует от общего
 * куска ≥2 слов и ≥10 символов — совпадение одного лишь имени артиста
 * («X» в «X CONCERT» и «X FAN MEETING») надбавки не получает.
 */
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  let sim = 1 - levenshtein(a, b) / longer.length;
  if (
    shorter.length >= 10 &&
    shorter.includes(" ") &&
    longer.startsWith(shorter + " ")
  ) {
    sim = Math.max(sim, 0.6 + 0.4 * (shorter.length / longer.length));
  }
  return sim;
}

// ---------------------------------------------------------------- матчинг

/** Все даты черновика ("YYYY-MM-DD"), уникальные и по возрастанию. */
export function draftDateKeys(draft: DraftLikeEvent): string[] {
  const all = [draft.date, ...(draft.extraDates ?? [])].filter(
    (d): d is string => Boolean(d) && /^\d{4}-\d{2}-\d{2}$/.test(d!),
  );
  return [...new Set(all)].sort();
}

/**
 * Прогоняет черновик по списку кандидатов и возвращает лучшее
 * совпадение (или null). Правила:
 *
 *  - нормализованные названия РАВНЫ → сильное. Исключение: у обеих
 *    сторон есть даты и ни одна не совпала — ежегодное событие с тем же
 *    названием (прошлогодний концерт в каталоге) считаем лишь слабым,
 *    иначе краулер навсегда пришил бы URL новой афиши к старому событию;
 *  - похожесть ≥ STRONG и есть общая дата → сильное (одна общая дата —
 *    уже сильный сигнал: день, площадка-сезон и почти то же название);
 *  - похожесть ≥ STRONG без общих дат → слабое;
 *  - похожесть ≥ WEAK и есть общая дата → слабое;
 *  - иначе не совпадение.
 *
 * Лучшее = сильное раньше слабого, затем большая похожесть, затем
 * больше общих дат.
 */
export function matchAgainstCandidates(
  draft: DraftLikeEvent,
  candidates: CatalogEventCandidate[],
): DedupeMatch | null {
  const normTitle = normalizeEventTitle(draft.title ?? "");
  if (!normTitle) return null;
  const dates = draftDateKeys(draft);

  let best: DedupeMatch | null = null;
  for (const c of candidates) {
    const candNorm = normalizeEventTitle(c.title);
    if (!candNorm) continue;
    const similarity = titleSimilarity(normTitle, candNorm);
    const sharedDates = dates.filter((d) => c.dates.includes(d));

    let strength: DedupeMatch["strength"] | null = null;
    if (normTitle === candNorm) {
      strength =
        dates.length > 0 && c.dates.length > 0 && sharedDates.length === 0
          ? "weak"
          : "strong";
    } else if (similarity >= STRONG_TITLE_SIMILARITY) {
      strength = sharedDates.length > 0 ? "strong" : "weak";
    } else if (similarity >= WEAK_TITLE_SIMILARITY && sharedDates.length > 0) {
      strength = "weak";
    }
    if (!strength) continue;

    const match: DedupeMatch = {
      strength,
      eventId: c.id,
      eventTitle: c.title,
      eventSourceUrl: c.sourceUrl,
      similarity,
      sharedDates,
    };
    if (
      !best ||
      (best.strength === "weak" && strength === "strong") ||
      (best.strength === strength &&
        (similarity > best.similarity ||
          (similarity === best.similarity && sharedDates.length > best.sharedDates.length)))
    ) {
      best = match;
    }
  }
  return best;
}

// ------------------------------------------------------- поиск кандидатов

/** Слова, слишком частые в афише, чтобы искать по ним кандидатов
 *  (в САМОМ матчинге они остаются — см. normalizeEventTitle). */
const SEARCH_STOPWORDS = new Set([
  "concert", "meeting", "fanmeeting", "fancon", "fanmeet", "presents",
  "the", "and", "live", "tour", "world", "asia", "bangkok", "thailand",
  "show", "final", "encore", "2024", "2025", "2026", "2027", "with",
]);

/** До трёх самых длинных «содержательных» токенов названия — по ним
 *  ищутся кандидаты подстрокой (contains, регистронезависимо). */
export function candidateSearchTokens(normalizedTitle: string): string[] {
  const tokens = normalizedTitle.split(" ").filter(Boolean);
  const meaningful = tokens.filter((t) => t.length >= 4 && !SEARCH_STOPWORDS.has(t));
  const pool = meaningful.length > 0 ? meaningful : tokens.filter((t) => t.length >= 2);
  return [...new Set(pool)].sort((a, b) => b.length - a.length).slice(0, 3);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

/**
 * Ищет дубль черновика в каталоге. Кандидаты выбираются недорого, без
 * полного скана: события с occurrence'ами в окне дат черновика
 * ±CANDIDATE_WINDOW_DAYS плюс события с токенами названия подстрокой;
 * потолок выборки — на случай слишком общего токена. Дальше — чистый
 * matchAgainstCandidates.
 */
export async function findCatalogDuplicate(
  draft: DraftLikeEvent,
): Promise<DedupeMatch | null> {
  const normTitle = normalizeEventTitle(draft.title ?? "");
  if (!normTitle) return null;
  const dates = draftDateKeys(draft);

  const or: Prisma.EventWhereInput[] = [];
  if (dates.length > 0) {
    or.push({
      occurrences: {
        some: {
          startsAt: {
            gte: addDays(parseDateKey(dates[0]), -CANDIDATE_WINDOW_DAYS),
            lt: addDays(parseDateKey(dates[dates.length - 1]), CANDIDATE_WINDOW_DAYS + 1),
          },
        },
      },
    });
  }
  for (const token of candidateSearchTokens(normTitle)) {
    or.push({ title: { contains: token, mode: "insensitive" } });
  }
  if (or.length === 0) return null;

  // Ленивый импорт: строковые функции модуля гоняются юнит-тестом без
  // базы, и клиент Prisma не должен создаваться от одного лишь импорта.
  const { prisma } = await import("@/lib/prisma");
  const events = await prisma.event.findMany({
    where: { OR: or },
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      occurrences: { select: { startsAt: true } },
    },
    take: 300,
  });

  return matchAgainstCandidates(
    draft,
    events.map((e) => ({
      id: e.id,
      title: e.title,
      sourceUrl: e.sourceUrl,
      // startsAt хранит тайское настенное время «как UTC» — дата
      // достаётся UTC-компонентами (dateKey), как во всём проекте.
      dates: [...new Set(e.occurrences.map((o) => dateKey(o.startsAt)))],
    })),
  );
}
