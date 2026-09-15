"use client";

import { useState, useTransition } from "react";
import { toggleGoing, toggleMaybe } from "@/app/(public)/favorites/actions";
import { formatShortDate } from "@/lib/dates";
import { CheckIcon, HelpIcon, PlusIcon } from "@/components/icons";
import { useLocale, useT } from "@/components/LocaleProvider";

/** Переключатели «иду» по датам события: у многодневного концерта можно
 *  выбрать только свои дни — в списки/календарь/план поездки попадают
 *  именно они. */
export default function GoingDateChips({
  occurrences,
  goingIds,
  maybeIds,
}: {
  occurrences: { id: string; startsAt: Date }[];
  goingIds: string[];
  /** «Возможно пойду» по датам — кандидаты. Взаимоисключимы с «иду»:
   *  сервер снимает встречную отметку, здесь то же делает оптимистичный
   *  переключатель (правка владельца 2026-09-15). */
  maybeIds: string[];
}) {
  const t = useT();
  const locale = useLocale();
  const [going, setGoing] = useState(() => new Set(goingIds));
  const [maybe, setMaybe] = useState(() => new Set(maybeIds));
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    // Оптимистично: чип переключается сразу, при ошибке откатываем.
    const flip = () =>
      setGoing((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    flip();
    // Симметрично серверу: «иду» отменяет кандидата.
    if (!going.has(id)) {
      setMaybe((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    startTransition(async () => {
      try {
        // Ошибка приходит значением — откатываем оптимистичный чип.
        const result = await toggleGoing(id);
        if (!result.ok) flip();
      } catch {
        flip();
      }
    });
  }

  function toggleMaybeDate(id: string) {
    const wasMaybe = maybe.has(id);
    const wasGoing = going.has(id);
    const apply = (on: boolean) => {
      setMaybe((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
      // Ставим «возможно» — «иду» уходит: состояния взаимоисключимы.
      if (on && wasGoing) {
        setGoing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    };
    apply(!wasMaybe);
    startTransition(async () => {
      try {
        const result = await toggleMaybe(id);
        if (!result.ok) {
          apply(wasMaybe);
          if (wasGoing) setGoing((prev) => new Set(prev).add(id));
        }
      } catch {
        apply(wasMaybe);
        if (wasGoing) setGoing((prev) => new Set(prev).add(id));
      }
    });
  }

  const now = new Date();
  const allPast = occurrences.every((occ) => occ.startsAt < now);

  return (
    <div className="mb-0">
      <p className="small text-secondary mb-1">
        {allPast ? t.events.going.promptPast : t.events.going.promptFuture}
      </p>
      <p className="mb-0 d-flex flex-wrap align-items-center gap-2">
        {occurrences.map((occ) => {
          const active = going.has(occ.id);
          const isMaybe = maybe.has(occ.id);
          const isPast = occ.startsAt < now;
          return (
            <span key={occ.id} className="going-date-group">
            <button
              type="button"
              disabled={isPending}
              onClick={() => toggle(occ.id)}
              className={`btn btn-sm d-inline-flex align-items-center gap-1 ${
                active ? "btn-primary" : "btn-ghost"
              }`}
              aria-pressed={active}
              title={
                active
                  ? isPast
                    ? t.events.going.removePast
                    : t.events.going.removeFuture
                  : isPast
                    ? t.events.going.addPast
                    : t.events.going.addFuture
              }
            >
              {active ? <CheckIcon /> : <PlusIcon />}
              {formatShortDate(occ.startsAt, locale)}
            </button>
            {/* «Возможно пойду» — только у будущих дат: у прошедшей
                кандидат бессмыслен, там уже либо ходили, либо нет
                (правка владельца 2026-09-15). */}
            {!isPast && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => toggleMaybeDate(occ.id)}
                className={`btn btn-sm going-date-maybe ${isMaybe ? "btn-primary" : "btn-ghost"}`}
                aria-pressed={isMaybe}
                aria-label={isMaybe ? t.widgets.maybe.remove : t.widgets.maybe.add}
                title={isMaybe ? t.widgets.maybe.remove : t.widgets.maybe.add}
              >
                <HelpIcon />
              </button>
            )}
            </span>
          );
        })}
      </p>
    </div>
  );
}
