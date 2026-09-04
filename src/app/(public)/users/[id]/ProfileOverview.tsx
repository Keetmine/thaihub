"use client";

import AppLink from "@/components/AppLink";
import { useT } from "@/components/LocaleProvider";

/** Чипы-ссылки своего «Обзора» (иду, избранное, друзья…): навигация в
 *  разделы, не достижения — потому остаются и у бесплатного аккаунта.
 *  Hero-плитки статистики отсюда уехали во вкладку «Статистика»
 *  (правка владельца п.8: обзор своего и чужая статистика должны
 *  показывать одинаковые блоки — см. StatsHero.tsx). Нулевые чипы не
 *  показываем: ряд «0 иду · 0 в избранном…» у нового аккаунта — жалоба
 *  владельца. */
export default function ProfileOverview({
  nav,
}: {
  nav: {
    going: number;
    favoriteEvents: number;
    favoritePerformers: number;
    dramas: number;
    friends: number;
    trips: number;
    locations: number;
  };
}) {
  const t = useT();
  const o = t.account.overview;

  const chips: { label: string; value: number; href?: string }[] = [
    { label: o.chipGoing, value: nav.going, href: "/events?filter=going" },
    { label: o.chipFavoriteEvents, value: nav.favoriteEvents, href: "/events?filter=favorited" },
    {
      label: o.chipPerformers(nav.favoritePerformers),
      value: nav.favoritePerformers,
      href: "/artists",
    },
    {
      label: o.chipDramas(nav.dramas),
      value: nav.dramas,
      href: "/dramas",
    },
    { label: o.chipFriends(nav.friends), value: nav.friends, href: "/friends" },
    { label: o.chipTrips(nav.trips), value: nav.trips, href: "/trips" },
    // Площадок (venues) в счётчиках больше нет — правка владельца:
    // информация о площадках из статистики профиля убрана целиком.
    {
      label: o.chipLocations(nav.locations),
      value: nav.locations,
      href: "/locations",
    },
  ];

  const visible = chips.filter((c) => c.value > 0);
  if (visible.length === 0) return null;

  return (
    <div className="d-flex flex-wrap gap-2 mb-4">
      {visible.map((c) => {
        const inner = (
          <>
            <span className="nav-chip-value">{c.value}</span>
            <span className="nav-chip-label">{c.label}</span>
          </>
        );
        return c.href ? (
          <AppLink
            key={c.label}
            href={c.href}
            className="nav-chip nav-chip-link text-decoration-none"
          >
            {inner}
          </AppLink>
        ) : (
          <span key={c.label} className="nav-chip">
            {inner}
          </span>
        );
      })}
    </div>
  );
}
