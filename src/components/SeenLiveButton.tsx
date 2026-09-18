"use client";

import { useState, useTransition } from "react";
import Modal from "./Modal";
import AppLink from "./AppLink";
import { EyeIcon } from "@/components/icons";
import { useLocale, useT } from "@/components/LocaleProvider";
import { formatShortDate } from "@/lib/dates";
import { tripHref } from "@/lib/slugHelpers";

export type SeenPersonalRow = {
  id: string;
  title: string;
  date: string;
  trip: { id: string; slug: string | null; title: string };
};

export type SeenEventRow = {
  id: string;
  slug: string | null;
  title: string;
  /** ISO — считает сервер, рисуем на языке зрителя. */
  date: string;
  seen: boolean;
};

/**
 * «Видела вживую» на странице артиста — глазик со СЧЁТЧИКОМ и списком
 * за ним (правка владельца 2026-09-15). Раньше это была одна кнопка на
 * артиста, и снять её значило «не видела нигде»: Jeff Satur на пяти
 * концертах и одном фестивале, где его не застали, — минус все шесть.
 *
 * Теперь по клику открывается список посещённых событий, где артист был
 * в составе, и у каждого свой глазик: снять с фестиваля — снять именно
 * там. Плюс «видели вне афиши» — отметка на артиста без события
 * (концерт до регистрации, встреча, которой у нас нет), и личные
 * события поездок — они считаются, но правятся в самой поездке.
 */
export default function SeenLiveButton({
  performerId,
  events,
  outside,
  personalEvents,
  toggleEvent,
  toggleOutside,
}: {
  performerId: string;
  events: SeenEventRow[];
  outside: boolean;
  /** Личные события поездок с этим артистом — списком со ссылкой на
   *  поездку (правка владельца 2026-09-18); правятся в самой поездке. */
  personalEvents: SeenPersonalRow[];
  toggleEvent: (eventId: string, performerId: string) => Promise<{ seen: boolean }>;
  toggleOutside: (performerId: string) => Promise<{ seen: boolean }>;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(events);
  const [isOutside, setIsOutside] = useState(outside);
  const [isPending, startTransition] = useTransition();

  const count = rows.filter((r) => r.seen).length + (isOutside ? 1 : 0) + personalEvents.length;
  const seen = count > 0;

  const flipEvent = (eventId: string) =>
    startTransition(async () => {
      setRows((prev) => prev.map((r) => (r.id === eventId ? { ...r, seen: !r.seen } : r)));
      const result = await toggleEvent(eventId, performerId).catch(() => null);
      if (result) {
        setRows((prev) => prev.map((r) => (r.id === eventId ? { ...r, seen: result.seen } : r)));
      }
    });

  const flipOutside = () =>
    startTransition(async () => {
      setIsOutside((prev) => !prev);
      const result = await toggleOutside(performerId).catch(() => null);
      if (result) setIsOutside(result.seen);
    });

  return (
    <>
      <button
        type="button"
        className={`icon-btn seen-live-btn ${seen ? "is-active" : ""}`}
        aria-label={t.widgets.seenLive.open}
        title={seen ? t.widgets.seenLive.count(count) : t.widgets.seenLive.short}
        aria-pressed={seen}
        onClick={() => setOpen(true)}
      >
        <EyeIcon filled={seen} />
        {count > 0 && <span className="seen-live-count">{count}</span>}
      </button>

      <Modal open={open} title={t.widgets.seenLive.short} onClose={() => setOpen(false)}>
        <p className="small text-secondary mb-3">{t.widgets.seenLive.hint}</p>
        {rows.length === 0 && personalEvents.length === 0 && (
          <p className="small text-secondary mb-3">{t.widgets.seenLive.noEvents}</p>
        )}
        <div className="d-flex flex-column gap-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="surface d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <span style={{ minWidth: 0 }}>
                <AppLink
                  href={`/event/${r.slug ?? r.id}`}
                  className="link-body-emphasis d-block text-truncate"
                >
                  {r.title}
                </AppLink>
                <span className="small text-secondary">{formatShortDate(new Date(r.date), locale)}</span>
              </span>
              <button
                type="button"
                className={`icon-btn ${r.seen ? "is-active" : ""}`}
                aria-label={r.seen ? t.widgets.seenLive.unmarkHere : t.widgets.seenLive.markHere}
                title={r.seen ? t.widgets.seenLive.unmarkHere : t.widgets.seenLive.markHere}
                aria-pressed={r.seen}
                disabled={isPending}
                onClick={() => flipEvent(r.id)}
              >
                <EyeIcon filled={r.seen} />
              </button>
            </div>
          ))}
          {personalEvents.length > 0 && (
            <>
              <p className="small text-secondary mt-2 mb-0">{t.widgets.seenLive.personalTitle}</p>
              {personalEvents.map((pe) => (
                <div
                  key={pe.id}
                  className="surface d-flex align-items-center justify-content-between gap-3 p-3"
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="text-white d-block text-truncate">{pe.title}</span>
                    <span className="small text-secondary d-block text-truncate">
                      {formatShortDate(new Date(pe.date), locale)} ·{" "}
                      <AppLink href={tripHref(pe.trip)} className="link-body-emphasis">
                        {pe.trip.title}
                      </AppLink>
                    </span>
                  </span>
                  <span className="small text-secondary flex-shrink-0">{t.widgets.seenLive.personalHint}</span>
                </div>
              ))}
            </>
          )}
          <div className="surface d-flex align-items-center justify-content-between gap-3 p-3">
            <span style={{ minWidth: 0 }}>
              <span className="text-white d-block">{t.widgets.seenLive.outside}</span>
              <span className="small text-secondary">{t.widgets.seenLive.outsideHint}</span>
            </span>
            <button
              type="button"
              className={`icon-btn ${isOutside ? "is-active" : ""}`}
              aria-label={isOutside ? t.widgets.seenLive.unmark : t.widgets.seenLive.mark}
              title={isOutside ? t.widgets.seenLive.unmark : t.widgets.seenLive.mark}
              aria-pressed={isOutside}
              disabled={isPending}
              onClick={flipOutside}
            >
              <EyeIcon filled={isOutside} />
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
