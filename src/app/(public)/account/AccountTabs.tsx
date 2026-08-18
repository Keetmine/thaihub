"use client";

import { useState } from "react";
import Link from "next/link";
import { eventHref } from "@/lib/eventSlug";
import { logout } from "../login/actions";
import { formatShortDate } from "@/lib/dates";
import { PinIcon } from "@/components/icons";
import StatsTab, { type AchievementForTab, type StatsForTab } from "./StatsTab";
import ProfileOverview from "./ProfileOverview";
import EventAgendaRow from "@/components/EventAgendaRow";
import type { EventWithPerformers } from "@/lib/types";

export type AccountTab = "profile" | "events";

/** Одно событие кабинета целиком, со всеми его датами — многодневный
 *  концерт здесь одна строка, а не строка на дату. */
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

export default function AccountTabs({
  initialTab,
  user,
  stats,
  statsData,
  achievements,
  artistLists,
  upcomingAttendances,
  pastAttendances,
  favoriteEvents,
  favoritedEventIds,
  goingOccurrenceIds,
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
  artistLists?: {
    id: string;
    slug: string | null;
    title: string;
    items: { id: string; slug: string | null; name: string; photoUrl: string | null }[];
  }[];
  upcomingAttendances: EventWithPerformers[];
  pastAttendances: EventWithPerformers[];
  favoriteEvents: { row: EventWithPerformers; extraDates: number }[];
  favoritedEventIds: string[];
  goingOccurrenceIds: string[];
  /** true — события скрыты подпиской: серверная страница передала пустые
   *  массивы (данные до клиента не доходят), вкладка объясняет почему. */
  eventsLocked?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<AccountTab>(initialTab);
  const favoritedSet = new Set(favoritedEventIds);
  const goingSet = new Set(goingOccurrenceIds);
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
        {/* Шапка — единая карточка с мягким акцентным фоном: раньше
            аватар, имя и кнопки «висели» на пустом фоне вразнобой. */}
        <div className="profile-hero d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
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

        <ProfileOverview stats={statsData} nav={stats} />

        <StatsTab stats={statsData} achievements={achievements} artistLists={artistLists} />

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
          <div className="d-flex flex-column gap-3 mb-5">
            {upcomingAttendances.map((ev) => (
              <EventAgendaRow
                key={ev.occurrenceId}
                event={ev}
                isFavorited={favoritedSet.has(ev.id)}
                isGoing={goingSet.has(ev.occurrenceId)}
                showDate
              />
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
            <div className="d-flex flex-column gap-3 opacity-50 mb-5">
              {pastAttendances.map((ev) => (
                <EventAgendaRow
                  key={ev.occurrenceId}
                  event={ev}
                  isFavorited={favoritedSet.has(ev.id)}
                  isGoing={goingSet.has(ev.occurrenceId)}
                  showDate
                />
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
          <div className="d-flex flex-column gap-3 mb-5">
            {favoriteEvents.map(({ row, extraDates }) => (
              <EventAgendaRow
                key={row.id}
                event={row}
                isFavorited={favoritedSet.has(row.id)}
                isGoing={goingSet.has(row.occurrenceId)}
                showDate
                extraDates={extraDates}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
