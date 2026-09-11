import assert from "node:assert/strict";
import { formatEpisodeNumbers } from "../../src/lib/episodeNumbers";

// Номера серий одной подписью для плашки «ближайшая серия»
// (docs/features/catalog.md). Без базы:
//
//   npx tsx tests/unit/episodeNumbers.test.ts

// Одна серия — просто номер.
assert.equal(formatEpisodeNumbers([5]), "5");

// Двойная премьера: подряд идущие сжимаются в диапазон через тире.
assert.equal(formatEpisodeNumbers([5, 6]), "5–6");
assert.equal(formatEpisodeNumbers([5, 6, 7]), "5–7");

// Порядок входа не важен, дубли схлопываются.
assert.equal(formatEpisodeNumbers([6, 5]), "5–6");
assert.equal(formatEpisodeNumbers([5, 5, 6]), "5–6");

// Разрыв — перечисление через запятую, а не один диапазон: 16-я и 18-я
// вышли в один день, 17-я неделей раньше.
assert.equal(formatEpisodeNumbers([16, 18]), "16, 18");
assert.equal(formatEpisodeNumbers([16, 17, 19, 20]), "16–17, 19–20");
assert.equal(formatEpisodeNumbers([1, 3, 5]), "1, 3, 5");

// Пусто — пустая строка, а не «undefined» в разметке.
assert.equal(formatEpisodeNumbers([]), "");

console.log("episodeNumbers: все проверки прошли");
