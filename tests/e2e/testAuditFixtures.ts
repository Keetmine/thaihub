/**
 * Константы фикстур для трёх смоук-спек, дописанных после аудита:
 * event-photos.spec.ts (Ж9), episode-notifications.spec.ts (З1) и
 * doramaland-ru.spec.ts (русские тексты с dorama.land).
 *
 * Файл БЕЗ единого импорта — по той же причине, что testDramas.ts и
 * testSmokeFixtures.ts: спеки тянут отсюда константы, а Prisma
 * ESM-only, и любой файл, через который она попадёт в граф спеки,
 * роняет прогон с «Cannot use import.meta outside a module». Сами
 * записи заводит отдельный tsx-процесс (create-audit-fixtures.ts).
 *
 * Все слаги с префиксом e2e- и названия с «E2E» — на локальной базе
 * разработчика это копия боевой, и фикстуру надо отличать от настоящей
 * записи и глазом, и запросом.
 */

/**
 * Событие с фото «для покупающих билеты» (Ж9). Картинки — реальные
 * файлы из public/ (а не выдуманные пути): миниатюра должна ЗАГРУЗИТЬСЯ,
 * иначе спека проверяла бы только разметку сломанных картинок. Именно
 * PNG, а не svg из той же папки: у тех только viewBox, и natural-размер
 * картинки, по которому спека судит о загрузке, у них нулевой.
 * Ровно три — столько же, сколько принимает форма админки.
 */
export const PHOTO_EVENT = {
  slug: "e2e-photo-event",
  title: "E2E Photo Event",
  venue: "E2E Photo Venue",
  photos: ["/icons/icon-192.png", "/apple-touch-icon.png", "/icons/icon-512.png"],
} as const;

/**
 * Сериал для уведомления о новой серии (З1). Серия ВЧЕРАШНЯЯ, а не
 * сегодняшняя: sendEpisodeNotifications до 22:00 по Бангкоку берёт
 * только прошедшие дни (окно — три дня назад от последнего «вышедшего»
 * дня), и вчерашняя попадает в него в любой час прогона.
 */
export const EPISODE_DRAMA = {
  slug: "e2e-episode-notify",
  title: "E2E Episode Notify Drama",
  episodes: 10,
  episodeNumber: 5,
} as const;

/**
 * Пара сериалов под dorama.land: один с русскими полями и ссылкой на
 * источник, второй без перевода вовсе — на нём проверяется админский
 * фильтр «Нет ру перевода» (это просто `titleRu IS NULL`).
 * Названия начинаются одинаково — один поиск по «E2E Doramaland»
 * достаёт обоих, и фильтр видно на срезе из двух записей, а не на
 * сотнях непереведённых с настоящей базы.
 */
export const DL_TRANSLATED = {
  slug: "e2e-dl-with-ru",
  title: "E2E Doramaland With Ru",
  titleRu: "Е2Е Дорамаленд Переведённый",
  synopsisRu: "Русское описание с dorama.land: проверяем показ на /ru.",
  doramalandUrl: "https://dorama.land/e2e-doramaland-with-ru",
} as const;

/** Названия нарочно не «Translated»/«Untranslated»: второе содержало бы
 *  первое подстрокой, и проверка «переведённого в списке больше нет»
 *  молча проходила бы мимо смысла. */
export const DL_UNTRANSLATED = {
  slug: "e2e-dl-no-ru",
  title: "E2E Doramaland No Ru",
} as const;

/** Общее начало названий обоих — строка поиска в админке. */
export const DL_QUERY = "E2E Doramaland";

/** Фиктивный telegramId, которым спека «привязывает» бота админу:
 *  переключатели рассылки видны только у привязанного аккаунта. Ничего
 *  никуда не уходит — тест только сохраняет форму, а сам номер снимается
 *  в finally (и на всякий случай в delete-audit-fixtures.ts). */
export const FAKE_TELEGRAM_ID = "900000001";
