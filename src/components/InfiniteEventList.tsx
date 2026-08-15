"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EventCard from "@/components/EventCard";
import EventCardLocked from "@/components/EventCardLocked";
import { monthLabel } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import type { EventListFilters, EventListPage, FriendGoing } from "@/lib/eventList";
import { loadEventListPage } from "@/app/(public)/eventListActions";

// Месячные секции вместо дневных: заголовок на каждый день при 1–2
// событиях превращал список в лесенку из повторяющихся дат, а карточка
// и так несёт свою дату в date-блоке.
function groupByMonth(events: EventWithPerformers[]) {
  const groups: { key: string; events: EventWithPerformers[] }[] = [];
  for (const ev of events) {
    const key = `${ev.startsAt.getFullYear()}-${ev.startsAt.getMonth()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(ev);
    else groups.push({ key, events: [ev] });
  }
  return groups;
}

function monthHeading(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return monthLabel(year, month);
}

function MonthSections({
  events,
  favoritedIds,
  goingIds,
  friendsGoing,
  locked,
}: {
  events: EventWithPerformers[];
  favoritedIds: Set<string>;
  goingIds: Set<string>;
  friendsGoing: Map<string, FriendGoing[]>;
  locked: boolean;
}) {
  return (
    <div className="d-flex flex-column gap-4">
      {groupByMonth(events).map((group) => (
        <section key={group.key}>
          <h2 className="month-group-heading mb-2">{monthHeading(group.key)}</h2>
          <div className="d-flex flex-column gap-3 mt-2">
            {group.events.map((ev) =>
              locked ? (
                <EventCardLocked key={ev.occurrenceId} startsAt={ev.startsAt} />
              ) : (
                <EventCard
                  key={ev.occurrenceId}
                  event={ev}
                  isFavorited={favoritedIds.has(ev.id)}
                  isGoing={goingIds.has(ev.occurrenceId)}
                  friendsGoing={friendsGoing.get(ev.id) ?? []}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Бесконечная прокрутка афиши: первая страница приходит с сервера
 *  (SSR), дальше — по мере доскролла до сентинела, через server action
 *  loadEventListPage. Сначала догружается фаза «предстоящие», после её
 *  конца — архив (тем же списком, под своим заголовком). */
export default function InfiniteEventList({
  filters,
  initialPage,
  emptyMessage,
}: {
  filters: EventListFilters;
  initialPage: EventListPage;
  emptyMessage: string;
}) {
  // Первая страница всегда из фазы «предстоящие» (page.tsx грузит
  // phase=upcoming offset=0).
  const [upcoming, setUpcoming] = useState<EventWithPerformers[]>(initialPage.events);
  const [past, setPast] = useState<EventWithPerformers[]>([]);
  const [favoritedIds, setFavoritedIds] = useState(() => new Set(initialPage.favoritedIds));
  const [goingIds, setGoingIds] = useState(() => new Set(initialPage.goingIds));
  const [friendsGoing, setFriendsGoing] = useState(() => new Map(initialPage.friendsGoing));
  const [next, setNext] = useState(initialPage.next);
  const [isLoading, setIsLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seenOccurrenceIds = useRef(new Set(initialPage.events.map((e) => e.occurrenceId)));

  const loadMore = useCallback(async () => {
    if (!next || isLoading) return;
    setIsLoading(true);
    try {
      const page = await loadEventListPage(filters, next.phase, next.offset);
      // Страховка от гонок/сдвига данных между страницами: одну и ту же
      // дату события не рендерим дважды.
      const fresh = page.events.filter((e) => !seenOccurrenceIds.current.has(e.occurrenceId));
      for (const e of fresh) seenOccurrenceIds.current.add(e.occurrenceId);

      if (next.phase === "upcoming") setUpcoming((prev) => [...prev, ...fresh]);
      else setPast((prev) => [...prev, ...fresh]);

      setFavoritedIds((prev) => new Set([...prev, ...page.favoritedIds]));
      setGoingIds((prev) => new Set([...prev, ...page.goingIds]));
      setFriendsGoing((prev) => {
        const merged = new Map(prev);
        for (const [id, friends] of page.friendsGoing) merged.set(id, friends);
        return merged;
      });
      setNext(page.next);
    } finally {
      setIsLoading(false);
    }
  }, [filters, next, isLoading]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !next) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      // Начинаем грузить заранее, за ~полэкрана до конца списка.
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [next, loadMore]);

  if (upcoming.length === 0 && past.length === 0 && !next) {
    return <p className="text-secondary">{emptyMessage}</p>;
  }

  return (
    <div>
      <MonthSections
        events={upcoming}
        favoritedIds={favoritedIds}
        goingIds={goingIds}
        friendsGoing={friendsGoing}
        locked={initialPage.locked}
      />

      {past.length > 0 && (
        <div className="mt-4 pt-3">
          <h2
            className="section-heading mb-3"
          >
            Архив событий
          </h2>
          <div className="opacity-75">
            <MonthSections
              events={past}
              favoritedIds={favoritedIds}
              goingIds={goingIds}
              friendsGoing={friendsGoing}
              locked={initialPage.locked}
            />
          </div>
        </div>
      )}

      {next && (
        <div ref={sentinelRef} className="py-4 text-center">
          <span className="small text-secondary">{isLoading ? "Загрузка…" : ""}</span>
        </div>
      )}
    </div>
  );
}
