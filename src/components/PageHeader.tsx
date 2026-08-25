import Link from "@/components/AppLink";

/** Разделитель имён внутри ряда-подложки. */
const NAME_SEPARATOR = " · ";

/** Рядов ровно четыре, и все четыре видны целиком — так в макете
 *  владельца. Число завязано на CSS: модификаторы .row-1…row-4 и сдвиг
 *  блока вниз в globals.css. */
const NAME_ROW_COUNT = 4;

/** Условная «ёмкость» ряда в символах. Ряд намеренно длиннее колонки
 *  контента: слева его срезает overflow контейнера, справа он тает под
 *  маской, поэтому бюджет — это запас, а сколько имён видно на самом
 *  деле, задаёт ширина колонки. */
const NAME_ROW_BUDGET = 110;

/** Сколько имён имеет смысл запрашивать странице: больше четырёх рядов
 *  подложка не рисует, а лишние имена только утяжеляют выборку. Четыре
 *  ряда — это ~440 знаков; на коротких именах вроде «MAX · AOU · DEW»
 *  их набирается около 70, отсюда и запас. */
export const WATERMARK_NAME_LIMIT = 72;

/** Длина, после которой имя в подложке обрезается. Названия сериалов
 *  бывают в полстроки — один такой съедал бы весь ряд. */
const NAME_MAX_LENGTH = 18;

function shortenName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ").toUpperCase();
  if (name.length <= NAME_MAX_LENGTH) return name;
  const cut = name.slice(0, NAME_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  // Режем по слову, если от него остаётся хоть что-то узнаваемое, и
  // подчищаем висящий хвост пунктуации («SLÔLÊ CAFÉ &», «ONLY FRIENDS:»).
  return (lastSpace >= 6 ? cut.slice(0, lastSpace) : cut).replace(/[\s\-–—:;,./&+|]+$/, "");
}

/** Раскладывает имена по рядам: самые популярные — в первые ряды, они
 *  ярче всего. Ряд набирается до «бюджета» символов и заведомо не
 *  влезает в колонку — хвост срезает контейнер и растворяет маска.
 *
 *  Имён может не хватить на все ряды (маскоты, новеллы) — тогда список
 *  идёт по кругу, а не откатывается на одно контурное слово. Начало
 *  каждого ряда при этом сдвигается на следующее неиспользованное имя,
 *  иначе повтор встал бы ровными вертикальными столбцами. */
function buildNameRows(names: string[]): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of names) {
    const name = shortenName(raw ?? "");
    // Однобуквенные записи каталога («A», «3RD») в подложке читаются как
    // мусор — пропускаем.
    if (name.length < 2 || seen.has(name)) continue;
    seen.add(name);
    items.push(name);
  }

  if (items.length === 0) return [];

  const at = (index: number) => items[index % items.length];
  const rows: string[] = [];
  // Курсор сквозной: пока имён хватает, ряды набираются подряд по
  // убыванию популярности — как и раньше; дальше он уходит на второй круг.
  let cursor = 0;
  const usedStarts = new Set<number>();
  for (let r = 0; r < NAME_ROW_COUNT; r++) {
    // Пропускаем имена, с которых уже начинался какой-то ряд. Ограничение
    // по длине списка — на случай, когда имён меньше, чем рядов: там
    // одинаковых стартов не избежать, ряды разводит сдвиг в CSS.
    let skipped = 0;
    while (skipped < items.length && usedStarts.has(cursor % items.length)) {
      cursor++;
      skipped++;
    }
    usedStarts.add(cursor % items.length);
    let row = at(cursor++);
    while (row.length + NAME_SEPARATOR.length + at(cursor).length <= NAME_ROW_BUDGET) {
      row += NAME_SEPARATOR + at(cursor++);
    }
    rows.push(row);
  }
  return rows;
}

/** Единая шапка страницы: eyebrow + заголовок (+ действия справа).
 *  Заменяет 17+ рукописных копий «eyebrow + display-1-tight с инлайновым
 *  размером» — размеры теперь только здесь. backHref превращает eyebrow
 *  в ссылку «← назад» (паттерн детальных страниц). */
export default function PageHeader({
  eyebrow,
  backHref,
  title,
  action,
  size = "md",
  className,
  watermark,
  watermarkNames,
  gapOnTitle,
}: {
  eyebrow: string;
  backHref?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  /** md — списки/кабинет (2.25rem), lg — витринные страницы (2.5rem). */
  size?: "md" | "lg";
  className?: string;
  /** Гигантский контурный текст-подложка за шапкой (латиницей).
   *  Используется, когда имён для подложки нет (пустая база, кабинетные
   *  разделы вроде поездок). */
  watermark?: string;
  /** Реальные имена/названия раздела для подложки — в порядке убывания
   *  популярности: первые попадают в верхние, самые заметные ряды. */
  watermarkNames?: string[];
  /** Отступ до контента висит на самом заголовке, а не на обёртке (и
   *  тогда обёртке класс отступа не нужен). Нужен, когда справа стоит
   *  подпись: она прижата к низу шапки и за счёт этого опускается к
   *  строке поиска, а не висит на уровне заголовка. */
  gapOnTitle?: boolean;
}) {
  const fontSize = size === "lg" ? "2.5rem" : "2.25rem";
  // Bootstrap mb-5 = 3rem; подложке из имён нужно знать этот отступ, она
  // прижата к низу шапки и иначе уехала бы вниз вместе с ним.
  const titleGap = gapOnTitle ? "3rem" : "0px";
  const nameRows = watermarkNames?.length ? buildNameRows(watermarkNames) : [];
  return (
    <div
      className={`page-header-wrap d-flex flex-wrap align-items-end justify-content-between gap-3 ${className ?? (gapOnTitle ? "" : "mb-4")}`}
      // Кегль подложки считается от кегля заголовка (см. globals.css).
      style={{ "--ph-title": fontSize, "--ph-gap": titleGap } as React.CSSProperties}
    >
      {nameRows.length > 0 ? (
        <span className="page-header-names" aria-hidden>
          {nameRows.map((row, i) => (
            <span key={i} className={`page-header-names-row row-${i + 1}`}>
              {row}
            </span>
          ))}
        </span>
      ) : (
        watermark && (
          <span className="page-watermark" aria-hidden>
            {watermark}
          </span>
        )
      )}
      <div>
        {backHref ? (
          <Link href={backHref} className="eyebrow text-decoration-none">
            ← {eyebrow}
          </Link>
        ) : (
          <span className="eyebrow">{eyebrow}</span>
        )}
        <h1
          className={`display-1-tight mt-2 ${gapOnTitle ? "mb-5" : "mb-0"}`}
          style={{ fontSize }}
        >
          {title}
        </h1>
      </div>
      {action && <div className="d-flex flex-wrap align-items-center gap-2">{action}</div>}
    </div>
  );
}
