import Link from "next/link";
import { performerHref } from "@/lib/performerSlug";
import { UserIcon } from "@/components/icons";
import type { EventWithPerformers } from "@/lib/types";

/** Сколько имён показываем в строке списка. Трёх хватает, чтобы узнать
 *  событие: фестивальные составы в 16 имён превращали строку в серую
 *  простыню и забивали название. Остальные — счётчиком «+N» (полный
 *  список — на странице события, он же в подсказке к счётчику). */
const CAST_LIMIT = 3;

/** Состав события отдельной, самой тихой строкой карточки — общая часть
 *  EventCard и EventAgendaRow. */
export default function EventRowCast({
  performers,
}: {
  performers: EventWithPerformers["performers"];
}) {
  if (performers.length === 0) return null;
  const shown = performers.slice(0, CAST_LIMIT);
  const rest = performers.slice(CAST_LIMIT);

  return (
    <p className="event-row-cast mb-0">
      {/* Инлайн-текст, не flex: gap контейнера отрывал запятые от имён
          («William , Lego»). */}
      <UserIcon className="icon-inline" />{" "}
      {shown.map(({ performer }, i) => (
        <span key={performer.id}>
          {i > 0 && ", "}
          <Link href={performerHref(performer)} className="agenda-performer-link">
            {performer.name}
          </Link>
        </span>
      ))}
      {rest.length > 0 && (
        <span
          className="event-row-cast-more"
          title={rest.map(({ performer }) => performer.name).join(", ")}
        >
          {" "}
          +{rest.length}
        </span>
      )}
    </p>
  );
}
