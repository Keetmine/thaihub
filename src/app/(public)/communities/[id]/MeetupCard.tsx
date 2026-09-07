import EventCard from "@/components/EventCard";
import { UsersIcon } from "@/components/icons";
import { getT } from "@/lib/i18n";
import type { EventWithPerformers } from "@/lib/types";
import MeetupForm, { type MeetupFormValues } from "./MeetupForm";

/**
 * Строка встречи на вкладке «Встречи» — ТА ЖЕ карточка, что в афише
 * (просьба владельца 2026-09-08: «выводить их так же, как афиша»).
 *
 * Своей разметки у встречи больше нет намеренно. Раньше вкладка рисовала
 * собственную плашку — без картинки и без буквенной заглушки, — и
 * загруженная афиша нигде не показывалась: со стороны это выглядело
 * так, будто фото не загрузилось. Общий `EventCard` даёт и постер, и
 * фолбэк первой буквой (`.event-card-poster-fallback`), и «я иду», и
 * блок даты — ровно то, что человек уже видел в афише.
 *
 * Данные карточке нужны в виде `EventWithPerformers` — том же, что
 * собирает `flattenOccurrence` для афиши; готовит их вкладка.
 *
 * Под карточкой — тихая строка со своим: кто позвал, сколько идут и
 * кнопка правки. В афише этого нет и быть не может (там нет автора), а
 * тащить их внутрь общей карточки значило бы развести её с афишной.
 */
export default async function MeetupCard({
  communityId,
  event,
  values,
  isFavorited,
  isGoing,
  authorName,
  goingCount,
  canEdit,
}: {
  communityId: string;
  event: EventWithPerformers;
  /** Заготовка для формы правки — нужна только тем, кто вправе править. */
  values: MeetupFormValues;
  isFavorited: boolean;
  isGoing: boolean;
  authorName: string | null;
  goingCount: number;
  canEdit: boolean;
}) {
  const { t } = await getT();
  const s = t.communities.meetups;
  const hasFooter = canEdit || !!authorName || goingCount > 0;

  return (
    <div className="d-flex flex-column gap-1">
      <EventCard
        event={event}
        isFavorited={isFavorited}
        isGoing={isGoing}
      />
      {hasFooter && (
        <div className="small text-secondary d-flex flex-wrap align-items-center gap-3 ps-1">
          {authorName && <span>{s.author(authorName)}</span>}
          {goingCount > 0 && (
            <span>
              <UsersIcon className="icon-inline" /> {s.goingCount(goingCount)}
            </span>
          )}
          {canEdit && <MeetupForm communityId={communityId} meetup={values} canDelete />}
        </div>
      )}
    </div>
  );
}
