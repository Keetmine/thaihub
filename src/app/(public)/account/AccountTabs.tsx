"use client";

import { useState } from "react";
import Link from "next/link";
import { eventHref } from "@/lib/eventSlug";
import { logout } from "../login/actions";
import FavoriteButton from "@/components/FavoriteButton";
import MskTimeInfo from "@/components/MskTimeInfo";
import { formatCombinedDateList, formatHumanDate, formatShortDate, formatTime } from "@/lib/dates";
import { PinIcon } from "@/components/icons";
import StatsTab, { type AchievementForTab, type StatsForTab } from "./StatsTab";
import StatTile from "@/components/StatTile";

export type AccountTab = "profile" | "events";

/** Одно событие кабинета целиком, со всеми его датами — многодневный
 *  концерт здесь одна строка, а не строка на дату. */
export type AccountEventEntry = {
  id: string;
  title: string;
  slug: string | null;
  venue: string;
  occurrences: { startsAt: Date; endsAt: Date | null }[];
};

function entryDatesLine(e: AccountEventEntry): string {
  const dates = e.occurrences.map((o) => o.startsAt);
  if (dates.length === 0) return "";
  if (dates.length === 1) return formatHumanDate(dates[0]);
  return formatCombinedDateList(dates);
}

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
      className={`tab-bar-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EventRow({ event }: { event: AccountEventEntry }) {
  const first = event.occurrences[0];
  return (
    <Link
      href={eventHref(event)}
      className="surface surface-hover text-decoration-none d-flex align-items-baseline justify-content-between gap-3 p-3"
    >
      <div>
        <p className="font-display fw-medium text-white mb-0">{event.title}</p>
        <p className="small text-secondary mb-0">
          <PinIcon /> {event.venue}
        </p>
      </div>
      <span className="small text-secondary text-end flex-shrink-0 d-flex flex-column align-items-end">
        <span className="text-capitalize">{entryDatesLine(event)}</span>
        {first && (
          <span className="d-inline-flex align-items-center gap-1">
            {formatTime(first.startsAt)}
            <MskTimeInfo startsAt={first.startsAt} endsAt={first.endsAt} />
          </span>
        )}
      </span>
    </Link>
  );
}

export default function AccountTabs({
  initialTab,
  user,
  stats,
  statsData,
  achievements,
  upcomingAttendances,
  pastAttendances,
  favoriteEvents,
  eventsLocked = false,
}: {
  statsData: StatsForTab;
  achievements: AchievementForTab[];
  initialTab: AccountTab;
  user: {
    name: string | null;
    email: string | null;
    telegramUsername?: string | null;
    photoUrl: string | null;
    isPremium: boolean;
    createdAt: Date;
  };
  stats: {
    going: number;
    favoriteEvents: number;
    favoritePerformers: number;
    dramas: number;
    friends: number;
    trips: number;
  };
  upcomingAttendances: AccountEventEntry[];
  pastAttendances: AccountEventEntry[];
  favoriteEvents: AccountEventEntry[];
  /** true — события скрыты подпиской: серверная страница передала пустые
   *  массивы (данные до клиента не доходят), вкладка объясняет почему. */
  eventsLocked?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<AccountTab>(initialTab);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);

  // initialTab comes from the URL's ?tab= param. On a soft navigation to an
  // already-mounted /account (e.g. clicking "Мои события" in ProfileMenu
  // while already on this page), only the prop changes — resync local state
  // during render so the requested tab actually becomes active.
  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    setActiveTab(initialTab);
  }

  const memberSince = `${formatShortDate(user.createdAt)} ${user.createdAt.getFullYear()}`;

  return (
    <div>
      <div className="tab-bar-row">
        <div className="tab-bar">
          <TabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")}>
            Профиль
          </TabButton>
          <TabButton active={activeTab === "events"} onClick={() => setActiveTab("events")}>
            События
          </TabButton>
        </div>
      </div>

      {/* Every tab stays mounted (display:none when inactive) so state isn't
          lost when switching tabs, consistent with PerformerForm's pattern. */}
      <div style={{ display: activeTab === "profile" ? undefined : "none" }}>
        {/* Как публичный профиль (/users/[id]): шапка на всю ширину,
            без узкой карточки. */}
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div className="d-flex flex-wrap align-items-center gap-4">
            {user.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photoUrl}
                alt=""
                className="rounded-circle flex-shrink-0"
                style={{ width: "5.5rem", height: "5.5rem", objectFit: "cover" }}
              />
            ) : (
              <div
                className="rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center font-display fw-bold"
                style={{
                  width: "5.5rem",
                  height: "5.5rem",
                  fontSize: "2.2rem",
                  background: "var(--bs-primary-bg-subtle)",
                  color: "var(--bs-primary-text-emphasis)",
                }}
              >
                {(user.name || user.email || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <h2 className="display-1-tight mb-0" style={{ fontSize: "1.9rem" }}>
                  {user.name || user.email}
                </h2>
                {user.isPremium ? (
                  <span className="badge rounded-pill text-bg-warning" style={{ fontSize: "0.65rem" }}>
                    Подписка
                  </span>
                ) : (
                  <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.65rem" }}>
                    Базовый
                  </span>
                )}
              </div>
              <p className="text-secondary small mb-0">
                {user.email ||
                  (user.telegramUsername ? `Telegram: @${user.telegramUsername}` : "Вход через Telegram")}
                {" "}· На MyBLHub с {memberSince}
              </p>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Link href="/account/settings" className="btn btn-ghost btn-sm">
              Настройки
            </Link>
            <form action={logout}>
              <button type="submit" className="btn btn-outline-secondary btn-sm">
                Выйти
              </button>
            </form>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 mb-4">
          <StatTile value={stats.going} label="иду" />
          <StatTile value={stats.favoriteEvents} label="избранных событий" />
          <StatTile value={stats.favoritePerformers} label="любимых актёров" href="/artists" />
          <StatTile value={stats.dramas} label="сериалов" href="/dramas" />
          <StatTile value={stats.friends} label="друзей" href="/friends" />
          <StatTile value={stats.trips} label="поездок" href="/trips" />
        </div>

        <StatsTab stats={statsData} achievements={achievements} />
      </div>

      <div style={{ display: activeTab === "events" ? undefined : "none" }}>
        {eventsLocked && (
          <p className="small text-secondary mb-3">
            🔒 Списки событий доступны по подписке.
          </p>
        )}
        <h2
          className="section-heading mb-2"
        >
          Мои события — предстоящие
        </h2>
        {upcomingAttendances.length === 0 ? (
          <p className="small text-secondary mb-4">Нет предстоящих событий.</p>
        ) : (
          <div className="d-flex flex-column gap-2 mb-4">
            {upcomingAttendances.map((ev) => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </div>
        )}

        {pastAttendances.length > 0 && (
          <>
            <h2
              className="section-heading mb-2"
            >
              Мои события — прошедшие
            </h2>
            <div className="d-flex flex-column gap-2 opacity-50 mb-4">
              {pastAttendances.map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          </>
        )}

        <h2
          className="section-heading mb-2 mt-4"
        >
          Избранные события
        </h2>
        {favoriteEvents.length === 0 ? (
          <p className="small text-secondary mb-4">Нет избранных событий.</p>
        ) : (
          <div className="d-flex flex-column gap-2 mb-4">
            {favoriteEvents.map((ev) => {
              const first = ev.occurrences[0];
              return (
                <div
                  key={ev.id}
                  className="surface d-flex align-items-center justify-content-between gap-3 p-3"
                >
                  <Link href={eventHref(ev)} className="text-decoration-none">
                    <p className="font-display fw-medium text-white mb-0">{ev.title}</p>
                    <p className="small text-secondary mb-0 d-flex align-items-center gap-1 text-capitalize">
                      {entryDatesLine(ev)}
                      {first && (
                        <>
                          {" "}· {formatTime(first.startsAt)}
                          <MskTimeInfo startsAt={first.startsAt} endsAt={first.endsAt} />
                        </>
                      )}
                    </p>
                  </Link>
                  <FavoriteButton kind="event" id={ev.id} isFavorited={true} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
