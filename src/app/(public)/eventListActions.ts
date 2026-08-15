"use server";

import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import {
  fetchEventListPage,
  type EventListFilters,
  type EventListPage,
  type EventListPhase,
} from "@/lib/eventList";

/** Подгрузка следующей страницы афиши для бесконечной прокрутки. */
export async function loadEventListPage(
  filters: EventListFilters,
  phase: EventListPhase,
  offset: number,
): Promise<EventListPage> {
  const user = await getCurrentUser();
  return fetchEventListPage(user?.id ?? null, isPremiumActive(user), filters, phase, offset);
}
