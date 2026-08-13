"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  User,
  Event,
  EventAttendance,
  FavoritePerformer,
  Performer,
  FavoriteDrama,
  Drama,
  FavoriteEvent,
  DramaWatchStatus,
} from "@/generated/prisma/client";
import { logout } from "../login/actions";
import FavoriteButton from "@/components/FavoriteButton";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import { formatHumanDate, formatTime } from "@/lib/dates";
import { PinIcon } from "@/components/icons";
import { WATCH_STATUS_LABELS, WATCH_STATUS_ORDER } from "@/lib/watchStatus";

export type AccountTab = "profile" | "events" | "performers" | "dramas";

const sectionHeadingStyle = { letterSpacing: "0.08em" } as const;

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`mode-toggle-option ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EventRow({ event }: { event: Event }) {
  return (
    <Link
      href={`/event/${event.id}`}
      className="surface surface-hover text-decoration-none d-flex align-items-baseline justify-content-between gap-3 p-3"
    >
      <div>
        <p className="font-display fw-medium text-white mb-0">{event.title}</p>
        <p className="small text-secondary mb-0">
          <PinIcon /> {event.venue}
        </p>
      </div>
      <span className="small text-secondary text-end flex-shrink-0">
        {formatHumanDate(event.startsAt)}
        <br />
        {formatTime(event.startsAt)}
      </span>
    </Link>
  );
}

export default function AccountTabs({
  initialTab,
  user,
  upcomingAttendances,
  pastAttendances,
  favoritePerformers,
  favoriteDramas,
  favoriteEvents,
  dramaWatchStatuses,
}: {
  initialTab: AccountTab;
  user: User;
  upcomingAttendances: (EventAttendance & { event: Event })[];
  pastAttendances: (EventAttendance & { event: Event })[];
  favoritePerformers: (FavoritePerformer & { performer: Performer })[];
  favoriteDramas: (FavoriteDrama & { drama: Drama })[];
  favoriteEvents: (FavoriteEvent & { event: Event })[];
  dramaWatchStatuses: (DramaWatchStatus & { drama: Drama })[];
}) {
  const [activeTab, setActiveTab] = useState<AccountTab>(initialTab);

  const watchStatusGroups = WATCH_STATUS_ORDER.map((status) => ({
    status,
    items: dramaWatchStatuses.filter((d) => d.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <div>
      <div className="mode-toggle mb-4">
        <TabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")}>
          Профиль
        </TabButton>
        <TabButton active={activeTab === "events"} onClick={() => setActiveTab("events")}>
          События
        </TabButton>
        <TabButton active={activeTab === "performers"} onClick={() => setActiveTab("performers")}>
          Избранные актёры
        </TabButton>
        <TabButton active={activeTab === "dramas"} onClick={() => setActiveTab("dramas")}>
          Сериалы
        </TabButton>
      </div>

      {/* Every tab stays mounted (display:none when inactive) so state isn't
          lost when switching tabs, consistent with PerformerForm's pattern. */}
      <div style={{ display: activeTab === "profile" ? undefined : "none" }}>
        <div className="surface p-4 mb-4" style={{ maxWidth: "40rem" }}>
          <h1 className="h4 mb-1">{user.name || user.email}</h1>
          <p className="text-secondary small mb-4">{user.email}</p>
          <form action={logout}>
            <button type="submit" className="btn btn-outline-secondary btn-sm">
              Выйти
            </button>
          </form>
        </div>
      </div>

      <div style={{ display: activeTab === "events" ? undefined : "none" }}>
        <h2
          className="small text-secondary text-uppercase mb-2"
          style={sectionHeadingStyle}
        >
          Мои события — предстоящие
        </h2>
        {upcomingAttendances.length === 0 ? (
          <p className="small text-secondary mb-4">Нет предстоящих событий.</p>
        ) : (
          <div className="d-flex flex-column gap-2 mb-4">
            {upcomingAttendances.map((a) => (
              <EventRow key={a.eventId} event={a.event} />
            ))}
          </div>
        )}

        {pastAttendances.length > 0 && (
          <>
            <h2
              className="small text-secondary text-uppercase mb-2"
              style={sectionHeadingStyle}
            >
              Мои события — прошедшие
            </h2>
            <div className="d-flex flex-column gap-2 opacity-50 mb-4">
              {pastAttendances.map((a) => (
                <EventRow key={a.eventId} event={a.event} />
              ))}
            </div>
          </>
        )}

        <h2
          className="small text-secondary text-uppercase mb-2 mt-4"
          style={sectionHeadingStyle}
        >
          Избранные события
        </h2>
        {favoriteEvents.length === 0 ? (
          <p className="small text-secondary mb-4">Нет избранных событий.</p>
        ) : (
          <div className="d-flex flex-column gap-2 mb-4">
            {favoriteEvents.map((f) => (
              <div
                key={f.eventId}
                className="surface d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <Link href={`/event/${f.event.id}`} className="text-decoration-none">
                  <p className="font-display fw-medium text-white mb-0">{f.event.title}</p>
                  <p className="small text-secondary mb-0">
                    {formatHumanDate(f.event.startsAt)} · {formatTime(f.event.startsAt)}
                  </p>
                </Link>
                <FavoriteButton kind="event" id={f.event.id} isFavorited={true} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: activeTab === "performers" ? undefined : "none" }}>
        <h2
          className="small text-secondary text-uppercase mb-2"
          style={sectionHeadingStyle}
        >
          Избранные исполнители
        </h2>
        {favoritePerformers.length === 0 ? (
          <p className="small text-secondary mb-4">Нет избранных исполнителей.</p>
        ) : (
          <div className="d-flex flex-column gap-2 mb-4">
            {favoritePerformers.map((f) => (
              <div
                key={f.performerId}
                className="surface d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <Link
                  href={`/performers/${f.performer.id}`}
                  className="text-decoration-none font-display fw-medium text-white"
                >
                  {f.performer.name}
                </Link>
                <FavoriteButton kind="performer" id={f.performer.id} isFavorited={true} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: activeTab === "dramas" ? undefined : "none" }}>
        {watchStatusGroups.length === 0 ? (
          <p className="small text-secondary mb-4">Нет сериалов со статусом просмотра.</p>
        ) : (
          watchStatusGroups.map((group) => (
            <div key={group.status}>
              <h2
                className="small text-secondary text-uppercase mb-2"
                style={sectionHeadingStyle}
              >
                {WATCH_STATUS_LABELS[group.status]}
              </h2>
              <div className="d-flex flex-column gap-2 mb-4">
                {group.items.map((d) => (
                  <div
                    key={d.dramaId}
                    className="surface d-flex align-items-center justify-content-between gap-3 p-3"
                  >
                    <Link
                      href={`/dramas/${d.drama.id}`}
                      className="text-decoration-none font-display fw-medium text-white"
                    >
                      {d.drama.title}
                    </Link>
                    <WatchStatusSelect dramaId={d.dramaId} status={d.status} />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        <h2
          className="small text-secondary text-uppercase mb-2 mt-4"
          style={sectionHeadingStyle}
        >
          Избранные сериалы
        </h2>
        {favoriteDramas.length === 0 ? (
          <p className="small text-secondary mb-4">Нет избранных сериалов.</p>
        ) : (
          <div className="d-flex flex-column gap-2 mb-4">
            {favoriteDramas.map((f) => (
              <div
                key={f.dramaId}
                className="surface d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <Link
                  href={`/dramas/${f.drama.id}`}
                  className="text-decoration-none font-display fw-medium text-white"
                >
                  {f.drama.title}
                </Link>
                <FavoriteButton kind="drama" id={f.drama.id} isFavorited={true} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
