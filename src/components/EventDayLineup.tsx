import AppLink from "@/components/AppLink";
import UploadImage from "@/components/UploadImage";
import SeenToggle from "@/components/SeenToggle";
import SeenDayButton from "@/components/SeenDayButton";

/** Один выход на сцену: кто, когда и куда ведёт карточка. */
export type LineupSlotCard = {
  id: string;
  href: string;
  name: string;
  photoUrl: string | null;
  /** Как на афише: «16:00-16:45». Пусто — время не объявлено. */
  timeText: string | null;
  /** Видел ли зритель этого артиста на этом событии. undefined — глазик
   *  не рисуем (не залогинен, не ходил, или день ещё впереди). */
  seen?: boolean;
};

export type LineupDay = {
  id: string;
  /** Дата словами — считает страница, она знает язык. */
  dateLabel: string;
  /** Сколько выступлений в этот день, уже строкой со склонением. */
  countLabel: string;
  stages: { stage: string | null; items: LineupSlotCard[] }[];
  /** Можно ли отмечать увиденных в этот день: зритель на нём был.
   *  На фестивале с лайнапом по умолчанию не отмечен НИКТО, поэтому
   *  рядом с датой появляется «видела всех» (правка владельца
   *  2026-09-15). */
  canMark?: boolean;
};

/**
 * «Лайнап по дням» — расписание фестиваля афишей: день, внутри дня
 * сцены, внутри сцены выступления по времени. Начало выступления —
 * плашкой на фото (правка владельца 2026-09-06: раньше это был ровный
 * серый список имён с подписями, и читать его было нечем); полный слот
 * со временем окончания остаётся подсказкой карточки.
 *
 * Блок стоит НАД описанием и заменяет собой общий состав «Кто
 * выступает»: если расписание есть, оно и есть состав — второй список
 * тех же людей ниже был бы просто их повтором без времени.
 */
/**
 * Свой цвет каждому дню (правка владельца 2026-09-06): у двухдневного
 * фестиваля оба дня были оранжевыми, и глазу не за что зацепиться. Цвет
 * красит ВСЕ акцентные элементы дня — линию слева, точки сцен и плашки
 * времени, — поэтому день узнаётся по любой из них. Первый оставлен
 * фирменным оранжевым, дальше розовый, фиолетовый, бирюзовый, жёлтый;
 * шестой день пойдёт по кругу — фестивалей длиннее не бывает, а
 * повтор через пять честнее, чем блёклый шестой цвет.
 */
const DAY_COLORS = [
  "var(--accent-rgb)",
  "236, 72, 153",
  "167, 139, 250",
  "45, 212, 191",
  "250, 204, 21",
];

export default function EventDayLineup({
  days,
  eventId,
  toggleSeen,
  setDaySeen,
}: {
  days: LineupDay[];
  eventId: string;
  /** Server actions прокидывает страница: компонент серверный, а сами
   *  глазики — клиентские. */
  toggleSeen?: (eventId: string, performerId: string) => Promise<{ seen: boolean }>;
  setDaySeen?: (eventId: string, occurrenceId: string, seen: boolean) => Promise<{ ok: true }>;
}) {
  return (
    <div className="lineup-days">
      {days.map((day, i) => (
        <section
          key={day.id}
          className="lineup-day"
          style={{ "--lineup-day-rgb": DAY_COLORS[i % DAY_COLORS.length] } as React.CSSProperties}
        >
          <header className="lineup-day-head">
            <h3 className="lineup-day-date">{day.dateLabel}</h3>
            <span className="lineup-day-count">{day.countLabel}</span>
            {day.canMark && setDaySeen && (
              <SeenDayButton eventId={eventId} occurrenceId={day.id} action={setDaySeen} />
            )}
          </header>
          {day.stages.map((group) => (
            <div key={group.stage ?? ""} className="lineup-stage">
              {/* Безымянная группа заголовка не получает: это «все
                  остальные», а не ещё одна площадка фестиваля. */}
              {group.stage && (
                <p className="lineup-stage-name">
                  <span className="lineup-stage-dot" aria-hidden="true" />
                  {group.stage}
                </p>
              )}
              <div className="cast-grid">
                {group.items.map((item) => (
                  <AppLink
                    key={item.id}
                    href={item.href}
                    className="cast-card lineup-slot"
                    title={item.timeText ? `${item.name} — ${item.timeText}` : item.name}
                  >
                    {/* Обёртка ровно по ширине фото: глазик крепится к
                        КРУЖКУ, а не к карточке — карточка шире, и
                        абсолютная привязка к ней уводила иконку в
                        сторону. Внутрь самого фото её не положить:
                        там overflow:hidden с круглой рамкой. */}
                    <span className="cast-card-photo-wrap">
                      <span className="cast-card-photo">
                        {item.photoUrl ? (
                          <UploadImage src={item.photoUrl} alt="" sizes="4rem" />
                        ) : (
                          <span className="cast-card-letter">
                            {item.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      {/* Глазик «видела здесь» — у самого списка: ходить
                          ради этого на страницу каждого артиста было
                          невыносимо (правка владельца 2026-09-15). */}
                      {item.seen !== undefined && toggleSeen && (
                        <SeenToggle
                          eventId={eventId}
                          performerId={item.id}
                          initialSeen={item.seen}
                          toggle={toggleSeen}
                        />
                      )}
                    </span>
                    {/* Плашка со временем налезает на низ фото — она
                        соседка фото, а не его содержимое: внутри
                        круглой рамки с overflow:hidden ей срезало бы
                        углы. */}
                    {item.timeText && (
                      <span className="lineup-slot-time">{startOf(item.timeText)}</span>
                    )}
                    <span className="cast-card-name text-truncate">{item.name}</span>
                  </AppLink>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Только начало слота: «16:00-16:45» → «16:00». На плашке в 3 см
 *  диапазон целиком не читается, а конец выступления виден в подсказке
 *  карточки. Непонятную строку («TBA») показываем как есть. */
function startOf(timeText: string): string {
  const m = /\d{1,2}:\d{2}/.exec(timeText);
  return m ? m[0] : timeText;
}
