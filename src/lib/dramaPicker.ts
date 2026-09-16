/**
 * «Подобрать сериал» — квиз в попапе каталога (правка владельца
 * 2026-09-16: «поднимаем попап с небольшим квизом, где даём выбор,
 * какой сериал он хочет посмотреть: настроение, жанр, посмотреть
 * что-то новое или пересмотреть, что-то что выходит или уже вышло»).
 *
 * Зачем он рядом с рулеткой. Рулетка отдаёт СЛУЧАЙНОЕ — это игра.
 * Квиз спрашивает, чего человек хочет сейчас, и это другой вопрос:
 * «хочу поплакать над чем-нибудь законченным» рулетка не понимает.
 *
 * Модуль чистый и без базы: те же описания нужны попапу (нарисовать
 * шаги), серверному действию (собрать запрос) и тесту.
 *
 * ГЛАВНОЕ ПРАВИЛО: квиз не имеет права вернуть пусто. Человек ответил
 * на четыре вопроса — получить «ничего не найдено» после этого обидно
 * вдвойне. Поэтому ответы разложены по СТУПЕНЯМ строгости, и подбор
 * снимает их по одной, пока не наберётся хоть что-то (см. `pickSteps`).
 */

/** Настроение — самый верхний вопрос: с него человек и начинает. */
export const MOODS = ["romance", "funny", "tense", "cry", "escape", "any"] as const;
export type Mood = (typeof MOODS)[number];

/** Жанры настроения. Значения СЫРЫЕ — по ним ищет каталог; подписи
 *  переводит словарь (правка владельца 2026-09-10 про фильтры). */
const MOOD_GENRES: Record<Mood, string[]> = {
  romance: ["Romance"],
  funny: ["Comedy", "Sitcom"],
  tense: ["Thriller", "Mystery", "Crime", "Psychological"],
  cry: ["Melodrama", "Drama"],
  escape: ["Fantasy", "Supernatural", "Sci-Fi", "Historical"],
  any: [],
};

/** Уточняющий жанр — второй вопрос. Нарочно короткий список: это не
 *  фильтр каталога (он есть рядом, в панели), а «ещё пожелание». */
export const PICK_GENRES = [
  "Youth",
  "Historical",
  "Fantasy",
  "Action",
  "Music",
  "Sports",
  "any",
] as const;
export type PickGenre = (typeof PICK_GENRES)[number];

/** Новое или пересмотреть. Вопрос есть только у залогиненных: у гостя
 *  отметок нет, и оба ответа означали бы одно и то же. */
export const SEEN_MODES = ["fresh", "rewatch", "any"] as const;
export type SeenMode = (typeof SEEN_MODES)[number];

/** Уже вышло целиком или ещё выходит. */
export const AIR_MODES = ["finished", "ongoing", "any"] as const;
export type AirMode = (typeof AIR_MODES)[number];

export type PickAnswers = {
  mood: Mood;
  genre: PickGenre;
  seen: SeenMode;
  air: AirMode;
};

export const DEFAULT_ANSWERS: PickAnswers = {
  mood: "any",
  genre: "any",
  seen: "any",
  air: "any",
};

/** Сколько вариантов показываем в конце. Шесть — ряд постеров: один
 *  вариант это приговор, двадцать — снова каталог. */
export const PICK_RESULTS = 6;

/** Из скольких кандидатов выбираем эти шесть. Берём с запасом и тасуем:
 *  иначе кнопка «показать другие» отдавала бы тот же список. */
export const PICK_POOL = 60;

/** Мусор из формы — это «неважно», а не ошибка: квиз не то место, где
 *  человеку показывают сообщение о неверном значении. */
export function parseAnswers(raw: Partial<Record<keyof PickAnswers, string>>): PickAnswers {
  const pick = <T extends readonly string[]>(list: T, v: string | undefined, fallback: T[number]) =>
    (list as readonly string[]).includes(v ?? "") ? (v as T[number]) : fallback;
  return {
    mood: pick(MOODS, raw.mood, "any"),
    genre: pick(PICK_GENRES, raw.genre, "any"),
    seen: pick(SEEN_MODES, raw.seen, "any"),
    air: pick(AIR_MODES, raw.air, "any"),
  };
}

/** Одно условие подбора: что искать и насколько жёстко за это держаться. */
export type PickStep = {
  /** Чем меньше, тем раньше условие снимут, если ничего не нашлось. */
  key: "genre" | "mood" | "air";
  /** `genres`-условие Prisma или статус выхода. */
  genres?: string[];
  status?: "ENDED" | "RETURNING_SERIES";
};

/**
 * Ступени строгости, от снимаемых первыми к последним.
 *
 * Порядок продуман: уточняющий жанр — это «ещё пожелание», его не жалко.
 * Настроение — то, ради чего квиз и открывали, оно держится дольше.
 * Статус выхода снимается последним из трёх: «хочу законченное» —
 * условие практическое, человек не хочет ждать серию неделю.
 *
 * Ответа про «новое/пересмотреть» здесь НЕТ намеренно: он про личный
 * список, а не про каталог, и снимать его нельзя — подсунуть
 * просмотренное тому, кто просил новое, хуже, чем не найти ничего.
 */
export function pickSteps(a: PickAnswers): PickStep[] {
  const steps: PickStep[] = [];
  if (a.genre !== "any") steps.push({ key: "genre", genres: [a.genre] });
  const mood = MOOD_GENRES[a.mood];
  if (mood.length > 0) steps.push({ key: "mood", genres: mood });
  if (a.air !== "any") {
    steps.push({ key: "air", status: a.air === "finished" ? "ENDED" : "RETURNING_SERIES" });
  }
  return steps;
}

/** Перемешать и отрезать. Fisher–Yates: `sort(() => Math.random() - 0.5)`
 *  даёт заметно неравномерную перестановку, и «другие варианты»
 *  показывали бы одни и те же лица чаще прочих. */
export function shuffleTake<T>(items: T[], count: number, random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
