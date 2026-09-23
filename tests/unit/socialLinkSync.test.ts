import assert from "node:assert/strict";
import { __planLinks } from "../../src/lib/socialLinkSync";
import { socialLinkLabel } from "../../src/lib/socialLinks";

// Правило «долить импортированные соцсети» (docs/features/tpop-fandom-import.md).
// Чистая часть, без базы. Запуск:
//
//   npx tsx tests/unit/socialLinkSync.test.ts

// 1. Пустая карточка — берём всё, что пришло.
{
  const r = __planLinks([], [
    "https://www.instagram.com/nnutdan/",
    "https://www.tiktok.com/@nnutdan",
    "https://twitter.com/nnutdan",
  ]);
  assert.equal(r.toAdd.length, 3);
  assert.equal(r.conflicts, 0);
}

// 2. Тот же профиль в другой записи адреса — не дубль.
{
  const r = __planLinks(
    [{ url: "https://instagram.com/nnutdan" }],
    ["https://www.instagram.com/nnutdan/"],
  );
  assert.deepEqual(r.toAdd, [], "www и хвостовой слеш — тот же профиль");
  assert.equal(r.conflicts, 0, "это не конфликт, а просто уже есть");
}

// 3. twitter.com и x.com — один аккаунт.
{
  const r = __planLinks([{ url: "https://twitter.com/nnutdan" }], ["https://x.com/nnutdan"]);
  assert.deepEqual(r.toAdd, []);
}

// 4. ДРУГОЙ аккаунт в занятой сети — конфликт, решает человек.
{
  const r = __planLinks(
    [{ url: "https://www.instagram.com/old_handle/" }],
    ["https://www.instagram.com/new_handle/"],
  );
  assert.deepEqual(r.toAdd, [], "второй инстаграм сам не доливаем");
  assert.equal(r.conflicts, 1);
}

// 5. У YouTube и музыкальных площадок несколько страниц законны.
{
  const r = __planLinks(
    [{ url: "https://www.youtube.com/@LYKN.Official" }],
    ["https://www.youtube.com/@LYKNmusic", "https://open.spotify.com/artist/x"],
  );
  assert.equal(r.toAdd.length, 2, "второй канал и стриминг добавляются");
  assert.equal(r.conflicts, 0);
}

// 6. Две одинаковые ссылки в одной пачке — одна запись.
{
  const r = __planLinks([], [
    "https://www.tiktok.com/@nnutdan",
    "https://www.tiktok.com/@nnutdan/",
  ]);
  assert.equal(r.toAdd.length, 1);
}

// --- подписи ---
assert.equal(socialLinkLabel("https://www.instagram.com/x/"), "Instagram");
assert.equal(socialLinkLabel("https://twitter.com/x"), "X", "как уже лежит в базе после MDL");
assert.equal(socialLinkLabel("https://x.com/x"), "X");
assert.equal(socialLinkLabel("https://example.com/x"), "Ссылка");

console.log("socialLinkSync: все проверки прошли");
