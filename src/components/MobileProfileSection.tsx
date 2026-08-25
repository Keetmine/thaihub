"use client";

import Link from "@/components/AppLink";
import { logout } from "@/app/(public)/login/actions";
import { useT } from "@/components/LocaleProvider";
import type { Dict } from "@/lib/i18n/en";
import type { ProfileMenuUser } from "./ProfileMenu";

const ITEMS: { href: string; labelKey: keyof Dict["nav"] }[] = [
  { href: "/account", labelKey: "account" },
  { href: "/notifications", labelKey: "notifications" },
  { href: "/events?filter=favorited", labelKey: "favorites" },
  { href: "/friends", labelKey: "friends" },
  { href: "/account?tab=events", labelKey: "myEvents" },
  { href: "/trips", labelKey: "myTrips" },
  { href: "/lists", labelKey: "myPlaces" },
  { href: "/account/settings", labelKey: "settings" },
  { href: "/help", labelKey: "help" },
];

/**
 * Профиль внутри мобильного меню — разделом со всеми пунктами сразу, а
 * не иконкой с ещё одним выпадающим списком: вложенное меню внутри
 * меню на телефоне неудобно, а иконки в общем ряду выглядели случайной
 * россыпью.
 */
export default function MobileProfileSection({ user }: { user: ProfileMenuUser }) {
  const t = useT();
  return (
    <div className="mobile-profile">
      <div className="mobile-profile-head">
        {user.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy"
            decoding="async"
            src={user.photoUrl}
            alt=""
            className="mobile-profile-avatar"
          />
        ) : (
          <span className="mobile-profile-avatar mobile-profile-avatar-letter">
            {(user.name || user.email || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <span style={{ minWidth: 0 }}>
          <span className="d-block text-white text-truncate">{user.name || t.nav.profile}</span>
          {user.email && (
            <span className="small text-secondary d-block text-truncate">{user.email}</span>
          )}
        </span>
      </div>

      {/* Публичный профиль — ссылка, которой делятся с друзьями. */}
      {user.username && (
        <Link href={`/users/${user.username}`} className="nav-link">
          {t.nav.myProfile}
        </Link>
      )}
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="nav-link">
          {t.nav[item.labelKey]}
        </Link>
      ))}

      <form action={logout}>
        <button type="submit" className="nav-link mobile-profile-logout">
          {t.nav.signOut}
        </button>
      </form>
    </div>
  );
}
