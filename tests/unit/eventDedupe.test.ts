import assert from "node:assert/strict";
import {
  normalizeEventTitle,
  titleSimilarity,
  candidateSearchTokens,
  draftDateKeys,
  matchAgainstCandidates,
  STRONG_TITLE_SIMILARITY,
  type CatalogEventCandidate,
} from "../../src/lib/eventDedupe";

// Матчинг «спарсенное TTM-событие ↔ Event каталога» (дубли краулера
// афиши, docs/features/ttm-crawl.md). Только чистые функции — без сети
// и без БД (findCatalogDuplicate подгружает Prisma лениво). Запуск:
//
//   npx tsx tests/unit/eventDedupe.test.ts

// --- normalizeEventTitle ---

assert.equal(
  normalizeEventTitle("SOTUS Teniversary Concert"),
  "sotus teniversary concert",
  "casefold",
);
assert.equal(
  normalizeEventTitle("  SOTUS   “TENIVERSARY”: CONCERT!!! "),
  "sotus teniversary concert",
  "пробелы схлопнуты, пунктуация и типографские кавычки убраны",
);
assert.equal(
  normalizeEventTitle("BE:FIRST WORLD SHOWCASE 2026 &#39;&#39;WATCH ME&#39;&#39;"),
  "be first world showcase 2026 watch me",
  "HTML-мнемоники раскодированы, «#39» не становится токеном",
);
assert.equal(
  normalizeEventTitle("POND PHUWIN Space Soul-dyssey CONCERT"),
  "pond phuwin space soul dyssey concert",
);
assert.equal(
  normalizeEventTitle("ชาตรี อิน คอนเสิร์ต โลกมายา"),
  normalizeEventTitle("ชาตรี   อิน คอนเสิร์ต โลกมายา"),
  "тайские названия нормализуются одинаково",
);
// Слова типа CONCERT НЕ выкидываются: «X CONCERT» и «X FAN MEETING» —
// разные события одного артиста.
assert.notEqual(
  normalizeEventTitle("PERTH SANTA CONCERT"),
  normalizeEventTitle("PERTH SANTA FAN MEETING"),
);

// --- titleSimilarity ---

const sim = (a: string, b: string) =>
  titleSimilarity(normalizeEventTitle(a), normalizeEventTitle(b));

assert.equal(sim("SOTUS TENIVERSARY CONCERT", "SOTUS Teniversary Concert"), 1);
assert.ok(
  sim("SOTUS TENIVERSARY CONCERT", "SOTUS TENIVERSARY CONCERT 2026") >= STRONG_TITLE_SIMILARITY,
  "хвост-год — высокая похожесть",
);
assert.ok(
  sim("POND PHUWIN Space Soul-dyssey CONCERT", "AIS presents POND PHUWIN Space Soul-dyssey CONCERT") <
    1,
  "спонсорская голова — не равенство…",
);
assert.ok(
  sim("SOTUS TENIVERSARY CONCERT", "SOTUS TENIVERSARY CONCERT PRESENTED BY GMMTV") >=
    STRONG_TITLE_SIMILARITY,
  "…а спонсорский хвост по границе слова — высокая (префикс-надбавка)",
);
assert.ok(
  sim("PERTH SANTA CONCERT", "PERTH SANTA FAN MEETING") < STRONG_TITLE_SIMILARITY,
  "«X CONCERT» и «X FAN MEETING» не выглядят одним событием",
);
assert.ok(sim("MILLI JAA EHH! ASIA TOUR 2026", "wave to earth - the pieces tour") < 0.4);

// --- draftDateKeys ---

assert.deepEqual(
  draftDateKeys({ title: "x", date: "2026-08-30", extraDates: ["2026-08-29", "2026-08-30"] }),
  ["2026-08-29", "2026-08-30"],
  "даты уникальны и по возрастанию",
);
assert.deepEqual(draftDateKeys({ title: "x", date: null }), []);

// --- candidateSearchTokens ---

assert.deepEqual(
  candidateSearchTokens(normalizeEventTitle("SOTUS TENIVERSARY CONCERT")),
  ["teniversary", "sotus"],
  "стоп-слова афиши (concert) не участвуют в поиске кандидатов",
);
assert.ok(
  candidateSearchTokens(normalizeEventTitle("The Concert 2026")).length > 0,
  "из одних стоп-слов всё равно что-то выбирается",
);

// --- matchAgainstCandidates ---

const catalog = (over: Partial<CatalogEventCandidate>): CatalogEventCandidate => ({
  id: "evt1",
  title: "SOTUS TENIVERSARY CONCERT",
  sourceUrl: null,
  dates: ["2026-08-29", "2026-08-30"],
  ...over,
});

// Точное совпадение названий (регистронезависимо) + общая дата = сильное.
{
  const m = matchAgainstCandidates(
    { title: "SOTUS Teniversary Concert", date: "2026-08-29", extraDates: ["2026-08-30"] },
    [catalog({})],
  );
  assert.equal(m?.strength, "strong", "SOTUS: разный регистр — сильное");
  assert.equal(m?.eventId, "evt1");
  assert.deepEqual(m?.sharedDates, ["2026-08-29", "2026-08-30"]);
}

// Точное совпадение, дат у каталожного события нет вовсе — всё равно
// сильное (равные названия сильны сами по себе).
{
  const m = matchAgainstCandidates(
    { title: "SOTUS TENIVERSARY CONCERT", date: "2026-08-29" },
    [catalog({ dates: [] })],
  );
  assert.equal(m?.strength, "strong");
}

// …но равные названия при ЗАВЕДОМО разных датах обеих сторон — лишь
// слабое: ежегодное событие с тем же названием, решает владелец.
{
  const m = matchAgainstCandidates(
    { title: "SOTUS TENIVERSARY CONCERT", date: "2027-08-28" },
    [catalog({})],
  );
  assert.equal(m?.strength, "weak", "то же название, другой год — не закрываем сами");
}

// «X CONCERT» vs «X FAN MEETING» — НЕ сильное даже при общей дате.
{
  const m = matchAgainstCandidates(
    { title: "PERTH SANTA CONCERT", date: "2026-08-29" },
    [catalog({ title: "PERTH SANTA FAN MEETING" })],
  );
  assert.notEqual(m?.strength, "strong", "концерт и фанмит — разные события");
}

// Общая дата + похожее (не равное) название = сильное.
{
  const m = matchAgainstCandidates(
    { title: "SOTUS TENIVERSARY CONCERT 2026", date: "2026-08-29" },
    [catalog({})],
  );
  assert.equal(m?.strength, "strong", "похожее название + общая дата — сильное");
}

// Похожее название БЕЗ общих дат = слабое.
{
  const m = matchAgainstCandidates(
    { title: "SOTUS TENIVERSARY CONCERT 2026", date: "2026-11-01" },
    [catalog({})],
  );
  assert.equal(m?.strength, "weak", "похожесть без дат — только пометка");
}

// Непохожее название — не совпадение, даже в тот же день.
{
  const m = matchAgainstCandidates(
    { title: "MILLI JAA EHH! ASIA TOUR 2026", date: "2026-08-29" },
    [catalog({})],
  );
  assert.equal(m, null);
}

// Из нескольких кандидатов побеждает сильный / более похожий.
{
  const m = matchAgainstCandidates(
    { title: "SOTUS TENIVERSARY CONCERT", date: "2026-08-29" },
    [
      catalog({ id: "other", title: "SOTUS TENIVERSARY FAN MEETING" }),
      catalog({ id: "exact" }),
    ],
  );
  assert.equal(m?.eventId, "exact");
  assert.equal(m?.strength, "strong");
}

// Пустое название — матчинга нет.
assert.equal(matchAgainstCandidates({ title: "" }, [catalog({})]), null);

console.log("eventDedupe.test.ts: все проверки прошли");
