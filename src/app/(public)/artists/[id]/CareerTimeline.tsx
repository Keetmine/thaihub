import AppLink from "@/components/AppLink";
import { getT } from "@/lib/i18n";
import {
  TvIcon,
  CalendarIcon,
  MusicNoteIcon,
  TrophyIcon,
} from "@/components/icons";

/** Один пункт «Пути артиста». Собирается на странице артиста из УЖЕ
 *  загруженных данных (фильмография, события, альбомы, awards) — своих
 *  запросов у таймлайна нет. */
export type CareerItem = {
  key: string;
  /** Год группы. Пункты без внятного года на страницу не попадают. */
  year: number;
  /** Мс для сортировки внутри года: у событий настоящая дата, у
   *  остальных — 1 января своего года. */
  time: number;
  kind: "series" | "movie" | "show" | "event" | "album" | "ep" | "single" | "award";
  title: string;
  subtitle?: string | null;
  /** Внутренняя ссылка (сериал, событие). */
  href?: string;
  /** Внешняя ссылка (альбом на площадке) — у релизов своей страницы нет. */
  url?: string;
  /** Событие для гостя/без подписки: настоящих данных в пункте нет —
   *  только дата, как в EventCardLocked. */
  locked?: boolean;
};

const KIND_ICON = {
  series: TvIcon,
  movie: TvIcon,
  show: TvIcon,
  event: CalendarIcon,
  album: MusicNoteIcon,
  ep: MusicNoteIcon,
  single: MusicNoteIcon,
  award: TrophyIcon,
} as const;

// Порядок внутри года при равном времени (у всех «год-только» пунктов
// time одинаковый): сериалы, потом релизы, потом награды.
const KIND_ORDER: Record<CareerItem["kind"], number> = {
  series: 0,
  movie: 0,
  show: 0,
  event: 1,
  album: 2,
  ep: 2,
  single: 2,
  award: 3,
};

/**
 * «Путь артиста» — вертикальная хроника по годам: сериалы, прошедшие
 * события, музыкальные релизы и награды одной лентой, свежие годы
 * сверху. Блок, а не вкладка: у страницы артиста нет верхнего ряда
 * вкладок — SubTabs живут ВНУТРИ секций (фильмография), и совать туда
 * события с наградами значило бы прятать их под заголовком «Сериалы».
 *
 * Меньше двух пунктов — блока нет: хроника из одного сериала ничего не
 * добавляет к карточке этого же сериала выше (решение аудита, п.7).
 */
export default async function CareerTimeline({ items }: { items: CareerItem[] }) {
  if (items.length < 2) return null;
  const { t } = await getT();

  // Год без пунктов не рисуется сам собой: группы создаются только из
  // реальных пунктов, «пустых лет» в Map не бывает.
  const byYear = new Map<number, CareerItem[]>();
  for (const item of items) {
    const group = byYear.get(item.year);
    if (group) group.push(item);
    else byYear.set(item.year, [item]);
  }
  const years = [...byYear.entries()].sort(([a], [b]) => b - a);
  for (const [, group] of years) {
    group.sort((a, b) => b.time - a.time || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  }

  return (
    <div className="mb-4">
      <h2 className="section-heading mb-3">{t.catalog.artist.careerPath}</h2>
      <div className="career-path">
        {years.map(([year, group]) => (
          <section key={year} className="career-year">
            <h3 className="career-year-label">{year}</h3>
            <ul className="career-year-items list-unstyled mb-0">
              {group.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <li
                    key={item.key}
                    className={`career-item${item.locked ? " opacity-50" : ""}`}
                  >
                    <span className="career-kind">
                      <Icon className="icon-inline" />
                      {t.catalog.artist.careerKind[item.kind]}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      {item.href ? (
                        <AppLink href={item.href} className="link-body-emphasis">
                          {item.title}
                        </AppLink>
                      ) : item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-body-emphasis"
                        >
                          {item.title} ↗
                        </a>
                      ) : (
                        <span className={item.locked ? "text-secondary" : "text-white"}>
                          {item.title}
                        </span>
                      )}
                      {item.subtitle && (
                        <span className="small text-secondary"> · {item.subtitle}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
