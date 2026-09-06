import AppLink from "@/components/AppLink";
import UploadImage from "@/components/UploadImage";

/** Один выход на сцену: кто, когда и куда ведёт карточка. */
export type LineupSlotCard = {
  id: string;
  href: string;
  name: string;
  photoUrl: string | null;
  /** Как на афише: «16:00-16:45». Пусто — время не объявлено. */
  timeText: string | null;
};

export type LineupDay = {
  id: string;
  /** Дата словами — считает страница, она знает язык. */
  dateLabel: string;
  /** Сколько выступлений в этот день, уже строкой со склонением. */
  countLabel: string;
  stages: { stage: string | null; items: LineupSlotCard[] }[];
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
export default function EventDayLineup({ days }: { days: LineupDay[] }) {
  return (
    <div className="lineup-days">
      {days.map((day) => (
        <section key={day.id} className="lineup-day">
          <header className="lineup-day-head">
            <h3 className="lineup-day-date">{day.dateLabel}</h3>
            <span className="lineup-day-count">{day.countLabel}</span>
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
                    <span className="cast-card-photo">
                      {item.photoUrl ? (
                        <UploadImage src={item.photoUrl} alt="" sizes="4rem" />
                      ) : (
                        <span className="cast-card-letter">
                          {item.name.charAt(0).toUpperCase()}
                        </span>
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
