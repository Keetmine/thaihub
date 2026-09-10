import type { Locale } from "@/lib/i18n/config";

/**
 * Словарь ПОВТОРЯЮЩИХСЯ значений из импорта: жанр, страна, тип сериала,
 * страна артиста, занятие, инструмент.
 *
 * Зачем отдельный механизм, а не строки в i18n-словарях: такие поля —
 * не уникальные тексты, а справочник. Жанров 33 на пять тысяч сериалов,
 * занятий 17 на десять тысяч артистов. Переводить их у каждой записи
 * бессмысленно: один перевод накрывает и весь каталог, и всё, что
 * импортируется завтра.
 *
 * Значения по умолчанию лежат ЗДЕСЬ, в коде, а правки владельца — в
 * таблице `ContentTranslation` (правка владельца 2026-09-10: «выведем в
 * настройки, чтобы я могла сама менять переводы»). Порядок разрешения:
 * правка владельца → значение по умолчанию → СЫРАЯ строка. Последнее
 * важно: незнакомый жанр из свежего импорта должен показаться
 * по-английски, а не исчезнуть.
 *
 * Модуль чистый — без обращений к базе: им пользуются и серверные
 * страницы, и клиентские компоненты (таблица каталога). Загрузка правок
 * живёт в `contentDictionary.server.ts`.
 */

export const CONTENT_DICT_KINDS = [
  "genre",
  "country",
  "dramaType",
  "performerCountry",
  "occupation",
  "instrument",
] as const;

export type ContentDictKind = (typeof CONTENT_DICT_KINDS)[number];

/** Правки владельца: вид → сырое значение (в нижнем регистре) → перевод. */
export type ContentOverrides = Partial<Record<ContentDictKind, Record<string, string>>>;

/** Подписи видов для админки. Админка одноязычная, русская. */
export const CONTENT_DICT_TITLES: Record<ContentDictKind, string> = {
  genre: "Жанры сериалов",
  country: "Страны производства",
  dramaType: "Типы записей",
  performerCountry: "Страны артистов",
  occupation: "Занятия",
  instrument: "Инструменты",
};

/**
 * Значения по умолчанию. Ключи — в НИЖНЕМ регистре: источники пишут
 * одно и то же вразнобой («Actor» и «actor», «Guitar» и «guitar»).
 *
 * Занятия — с родом, как в русском языке и принято (решение владельца
 * 2026-09-10: «делаем без нейтральных форм, не страшно»).
 */
export const CONTENT_DICT_DEFAULTS: Record<ContentDictKind, Record<string, string>> = {
  genre: {
    romance: "Романтика",
    drama: "Драма",
    comedy: "Комедия",
    mystery: "Детектив",
    youth: "Молодёжное",
    thriller: "Триллер",
    action: "Экшен",
    life: "О жизни",
    fantasy: "Фэнтези",
    supernatural: "Мистика",
    melodrama: "Мелодрама",
    historical: "Историческое",
    crime: "Криминал",
    family: "Семейное",
    horror: "Ужасы",
    music: "Музыка",
    business: "Бизнес",
    psychological: "Психологическое",
    "sci-fi": "Фантастика",
    food: "Еда",
    sports: "Спорт",
    medical: "Медицина",
    law: "Юридическое",
    political: "Политика",
    documentary: "Документальное",
    adventure: "Приключения",
    sitcom: "Ситком",
    wuxia: "Уся",
    mature: "Для взрослых",
    tokusatsu: "Токусацу",
    war: "Война",
    military: "Военное",
    "martial arts": "Боевые искусства",
  },
  country: {
    thailand: "Таиланд",
    "south korea": "Южная Корея",
    japan: "Япония",
    china: "Китай",
    taiwan: "Тайвань",
    "hong kong": "Гонконг",
    philippines: "Филиппины",
    singapore: "Сингапур",
    vietnam: "Вьетнам",
  },
  dramaType: {
    drama: "Сериал",
    movie: "Фильм",
    "tv show": "Шоу",
    "tv program": "Шоу",
    special: "Спешл",
  },
  // В базе поле зовётся `Performer.nationality` и хранит «Thai», но на
  // экране это СТРАНА (правка владельца 2026-09-10: национальность
  // убрали, оставили страну).
  performerCountry: {
    thai: "Таиланд",
    "south korean": "Южная Корея",
    japanese: "Япония",
    singaporean: "Сингапур",
    vietnamese: "Вьетнам",
    chinese: "Китай",
    taiwanese: "Тайвань",
    filipino: "Филиппины",
  },
  occupation: {
    actor: "актёр",
    actress: "актриса",
    singer: "певец",
    "singer-songwriter": "автор-исполнитель",
    rapper: "рэпер",
    model: "модель",
    producer: "продюсер",
    lyricist: "автор текстов",
    musician: "музыкант",
    trainee: "трейни",
    youtuber: "ютубер",
    "graphic designer": "графический дизайнер",
    businessman: "предприниматель",
    bussinesman: "предприниматель",
    dancer: "танцор",
    host: "ведущий",
  },
  instrument: {
    guitar: "гитара",
    drums: "барабаны",
    drum: "барабаны",
    piano: "фортепиано",
    bass: "бас-гитара",
    violin: "скрипка",
    phin: "пхин",
    keyboard: "клавишные",
    ukulele: "укулеле",
  },
};

/** Ключ словаря из сырого значения — одно правило на запись и на чтение. */
export function contentDictKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Готовый переводчик значений одного языка. */
export type ContentDict = Record<ContentDictKind, (raw: string) => string>;

/**
 * Английские подписи. Источники (MyDramaList, фандомные вики) и так
 * пишут по-английски, поэтому переводить почти нечего — кроме типа
 * записи: у MDL «Drama» значит «сериал», и на английской витрине это
 * называется Series, иначе читается как жанр.
 */
const CONTENT_DICT_DEFAULTS_EN: Partial<Record<ContentDictKind, Record<string, string>>> = {
  dramaType: {
    drama: "Series",
    "tv show": "Show",
    "tv program": "Show",
  },
};

/**
 * Собирает переводчик: правка владельца → значение по умолчанию →
 * сырая строка. Последнее важно: незнакомое значение из свежего импорта
 * должно показаться как есть, а не исчезнуть.
 *
 * Правки владельца сейчас только русские: админка одноязычная, и
 * английские подписи ей править негде.
 */
export function buildContentDict(locale: Locale, overrides: ContentOverrides): ContentDict {
  const make = (kind: ContentDictKind) => (raw: string) => {
    const key = contentDictKey(raw);
    if (locale !== "ru") return CONTENT_DICT_DEFAULTS_EN[kind]?.[key] ?? raw;
    return overrides[kind]?.[key] ?? CONTENT_DICT_DEFAULTS[kind][key] ?? raw;
  };
  return {
    genre: make("genre"),
    country: make("country"),
    dramaType: make("dramaType"),
    performerCountry: make("performerCountry"),
    occupation: make("occupation"),
    instrument: make("instrument"),
  };
}
