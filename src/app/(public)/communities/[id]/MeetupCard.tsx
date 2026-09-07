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
  // Всё это стоит ВНУТРИ карточки (правка владельца 2026-09-09): и
  // «Позвал(а) X · идут: N», и правка. Раньше строка висела под
  // карточкой отдельным рядом и читалась как чужой текст рядом с ней, а
  // «Изменить» подписанной кнопкой перетягивало на себя внимание с
  // самой встречи.
  const meta =
    authorName || goingCount > 0 ? (
      <>
        {authorName && <span>{s.author(authorName)}</span>}
        {goingCount > 0 && (
          <span>
            <UsersIcon className="icon-inline" /> {s.goingCount(goingCount)}
          </span>
        )}
      </>
    ) : null;

  return (
    <EventCard
      event={event}
      isFavorited={isFavorited}
      isGoing={isGoing}
      meta={meta}
      // Карандаш — слева от сердечка, в общем ряду значков карточки.
      // Удаление сюда не переехало: значок корзины рядом с сердечком
      // слишком легко нажать мимо, а встречу это уносит насовсем —
      // «Удалить» осталось внутри окна правки.
      actions={
        canEdit ? (
          <MeetupForm
            communityId={communityId}
            meetup={values}
            canDelete
            compact
          />
        ) : undefined
      }
    />
  );
}
