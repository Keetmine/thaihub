// One row in an event list — one EventOccurrence, flattened together
// with its parent Event's shared fields. `id` stays the Event id (so
// favorite/going toggles and the detail link keep working unchanged
// across every occurrence of the same event); `occurrenceId` is only for
// React list keys, since the same Event can legitimately appear more
// than once (a multi-day concert) and needs a key unique per date.
export type EventWithPerformers = {
  id: string;
  occurrenceId: string;
  title: string;
  slug: string | null;
  venue: string;
  /**
   * Онлайн-встреча сообщества (Event.isOnline): venue у неё хранится
   * пустым, и на месте площадки карточка рисует бейдж «Онлайн».
   * Необязательное — каталожные списки, где встреч не бывает, поле не
   * тянут (у каталожных событий оно всегда false).
   */
  isOnline?: boolean;
  description: string | null;
  startsAt: Date;
  /** false — время не указано (startsAt хранит 00:00). */
  hasTime?: boolean;
  /** Зона, в которой лежит время (Event.timezone). Каталожные списки
   *  поле не тянут — там всегда Бангкок; у встреч сообществ своя. */
  timezone?: string;
  endsAt: Date | null;
  posterUrl: string | null;
  performers: { performer: { id: string; name: string; slug: string | null } }[];
  /**
   * Сообщество-хозяин встречи (Event.communityId). У каталожных событий
   * там null, и поле остаётся пустым — карточка рисует его только для
   * встреч, чтобы в афише было видно, ЧЬЯ это встреча (жалоба владельца
   * 2026-09-08: «не видно, чьё событие»).
   *
   * Необязательное: списки, где встреч не бывает вовсе (локация,
   * сериал, артист), сообщество в запрос не тянут.
   */
  community?: { id: string; slug: string | null; title: string } | null;
};
