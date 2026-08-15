const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/**
 * Карточка события для пользователей без подписки: настоящая только
 * дата — вместо названия/площадки/состава рендерятся размытые серые
 * плашки. Ключевое свойство: реальные данные события в разметку НЕ
 * попадают вовсе (сервер их сюда просто не передаёт), поэтому «снять
 * блюр» через девтулзы невозможно — раскрывать нечего.
 */
export default function EventCardLocked({ startsAt }: { startsAt: Date }) {
  const monthShort = startsAt
    .toLocaleDateString("ru-RU", { month: "short" })
    .replace(/\.$/, "");

  return (
    <div className="event-card event-card-locked" aria-label="Событие доступно по подписке">
      <div className="event-card-date">
        <span className="event-card-day">{startsAt.getDate()}</span>
        <span className="event-card-month">{monthShort}</span>
        <span className="event-card-weekday">{WEEKDAYS_SHORT[startsAt.getDay()]}</span>
      </div>

      <div className="event-card-locked-poster" />

      <div className="event-card-body">
        <div className="locked-bar locked-bar-title" />
        <div className="locked-bar locked-bar-line" />
        <div className="locked-bar locked-bar-line locked-bar-short" />
      </div>

      <span className="event-card-locked-badge">По подписке</span>
    </div>
  );
}
