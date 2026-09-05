import "dotenv/config";
import assert from "node:assert/strict";
import {
  MdlListUnavailableError,
  parseMdlListDoc,
  parseMdlListInput,
  parseMdlListRows,
} from "../../src/lib/mdlListImport";

// Юнит-проверки разбора страницы /dramalist/<ник> на MyDramaList —
// чистые функции, без сети и базы. Запуск:
//
//   npx tsx tests/unit/mdlListImport.test.ts
//
// Разметка строк в фикстуре — дословный фрагмент живой страницы
// (сентябрь 2026): <tr id="ml<id>"> со ссылкой class="title" и
// счётчиком num-seen/num-total; конфиг — window.dramalist_json.

const ROW_RELATIVE = `<tr id="ml801612">  <td class="msv2-i-num msv2-item--pos">1</td>  <td class="msv2-i-title text-justify-left"> <div class="msv2-item-content">  <div class="msv2-item--cover"><img data-src="https://i.mydramalist.com/l0zJxx_4t.jpg" src="https://i.mydramalist.com/l0zJxx_4t.jpg" class="img-responsive lazy"></div>  <div class="msv2-item--title"><a title="Be My Player Two" class="title" data-info="title:801612" target="_blank" href="/801612-be-my-player-two"><span>Be My Player Two</span></a> <span class="airing">airing</span></div>  </div> </td>  <td class="msv2-i-status">Watching</td>   <td class="msv2-i-progress"> <div class="msv2-item--progress"> <div data-id="801612"> <div class="msv2-item--quickupdate"><span>−</span></div> <div><span class="num-seen episode-seen">7</span>/<span class="num-total">10</span></div> <div class="msv2-item--quickupdate"><span>+</span></div> </div> </div> </td> </tr>`;

// Абсолютный href, сущности в названии, счётчик отсутствует вовсе.
const ROW_ABSOLUTE = `<tr id="ml27681"><td class="msv2-i-title"><div class="msv2-item--title"><a title="&#39;Cause You&#39;re My Boy &amp; Co" class="title" href="https://mydramalist.com/27681-my-tee"><span>…</span></a></div></td></tr>`;

// Ссылка без числового id (служебная) — строка должна выпасть.
const ROW_JUNK = `<tr id="ml999"><td><a class="title" href="/profile/whoever">Not a title</a></td></tr>`;

const DOC = `<script> window.dramalist_json = {"username":"keetmine","vip":"0","layout":{"default_list":""},"filters":{"search":"","list":"2","country":"","type":"","category":"","tags":[],"genres":[]},"user_settings":[],"load_more":true,"can_save":false,"is_owner":false}; </script>
<table class="msv2-table table is-view-mode"><tbody>${ROW_RELATIVE}${ROW_ABSOLUTE}${ROW_JUNK}</tbody></table>`;

// ---------- parseMdlListRows ----------

{
  const rows = parseMdlListRows(DOC);
  assert.equal(rows.length, 2, "служебная ссылка без /<id>- не строка списка");

  assert.deepEqual(rows[0], {
    mdlPath: "/801612-be-my-player-two",
    title: "Be My Player Two",
    seen: 7,
  });

  // Абсолютная ссылка сводится к пути, сущности в названии decoded,
  // отсутствующий счётчик — null (а не 0: «не отмечал» ≠ «ноль серий»).
  assert.deepEqual(rows[1], {
    mdlPath: "/27681-my-tee",
    title: "'Cause You're My Boy & Co",
    seen: null,
  });
}

// ---------- parseMdlListDoc ----------

{
  const doc = parseMdlListDoc(DOC);
  assert.equal(doc.listId, "2", "код вкладки из filters.list, не из default_list");
  assert.equal(doc.loadMore, true);
  assert.equal(doc.rows.length, 2);

  // Страница без таблицы и конфига — приватный список или чужая
  // вёрстка: честная ошибка вместо тихого «0 строк».
  assert.throws(
    () => parseMdlListDoc("<html><body>This profile is private</body></html>"),
    MdlListUnavailableError,
  );

  // «Классический» вид списка (настройка профиля на MDL): таблица
  // mdl-style-table, без dramalist_json и подгрузки, прогресс в
  // episode-seen. Дословный фрагмент живой страницы (сентябрь 2026).
  const CLASSIC = `<html><body><table id="list_2" class="mdl-style-table table table-striped m-b-0"><tbody>
<tr id="ml809270"> <th class="mdl-style-col-num order hidden-sm-down" width="30" align="center">1</th> <td class="mdl-style-col-title sort1"> <a title="A Winter Sun Wakes the Wind in Spring Hills' Dream" class="title text-primary _600" data-info="title:809270" target="_blank" href="/809270-a-winter-sun-wakes-the-wind-in-spring-hills-dream"><span>A Winter Sun Wakes the Wind in Spring Hills' Dream</span></a> <div class="hidden-md-up text-muted">Chinese Drama</div> </td> <td class="mdl-style-col-country sort2 hidden-sm-down" abbr="2" width="90" align="center">China</td> <td class="mdl-style-col-year sort3 hidden-sm-down" abbr="2026" width="45" align="center">2026</td> <td class="mdl-style-col-type sort4 hidden-sm-down" abbr="68" width="50" align="center">Drama</td> <td class="mdl-style-col-score sort5" abbr="0" align="center"> <span class="rating"><span class="fill" style="width:0%;"></span></span> <span class="score">0.0</span></td> <td class="mdl-style-col-progress sort6" abbr="315" width="80" align="center"> <span class="episode-seen">7</span>/<span class="episode-total">16</span> </td> </tr>
</tbody></table></body></html>`;
  const classic = parseMdlListDoc(CLASSIC);
  assert.equal(classic.listId, null);
  assert.equal(classic.loadMore, false);
  assert.deepEqual(classic.rows, [
    {
      mdlPath: "/809270-a-winter-sun-wakes-the-wind-in-spring-hills-dream",
      title: "A Winter Sun Wakes the Wind in Spring Hills' Dream",
      seen: 7,
    },
  ]);
}

// ---------- parseMdlListInput ----------

{
  // Голый ник больше не принимаем — только ссылка (см. parseMdlListInput).
  assert.equal(parseMdlListInput("keetmine"), null);
  assert.equal(parseMdlListInput("  Kee_t-9  "), null);
  assert.equal(
    parseMdlListInput("https://mydramalist.com/dramalist/keetmine"),
    "keetmine",
  );
  assert.equal(
    parseMdlListInput("https://www.mydramalist.com/dramalist/keetmine/completed"),
    "keetmine",
  );
  assert.equal(parseMdlListInput("mydramalist.com/dramalist/keetmine"), "keetmine");

  // Никакого SSRF: чужой хост, не-dramalist путь, мусор — null.
  assert.equal(parseMdlListInput("https://evil.com/dramalist/x"), null);
  assert.equal(parseMdlListInput("https://mydramalist.com/801612-be-my-player-two"), null);
  assert.equal(parseMdlListInput("../../etc/passwd"), null);
  assert.equal(parseMdlListInput("ник"), null);
  assert.equal(parseMdlListInput(""), null);
}

console.log("mdlListImport.test.ts: ok");
