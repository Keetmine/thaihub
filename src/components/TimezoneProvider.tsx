"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// Таймзона зрителя (User.timezone) — через контекст, чтобы не тянуть её
// пропсами сквозь каждую карточку события (EventCard/EventAgendaRow →
// TimeInfo). Провайдер ставит публичный layout.
const TimezoneContext = createContext<string>(DEFAULT_TIMEZONE);

export function TimezoneProvider({
  timezone,
  children,
}: {
  timezone: string;
  children: React.ReactNode;
}) {
  return <TimezoneContext.Provider value={timezone}>{children}</TimezoneContext.Provider>;
}

export function useViewerTimezone(): string {
  return useContext(TimezoneContext);
}
