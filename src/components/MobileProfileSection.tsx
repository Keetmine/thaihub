"use client";

import Link from "next/link";
import { logout } from "@/app/(public)/login/actions";
import type { ProfileMenuUser } from "./ProfileMenu";

const ITEMS = [
  { href: "/account", label: "Кабинет" },
  { href: "/notifications", label: "Уведомления" },
  { href: "/events?filter=favorited", label: "Избранное" },
  { href: "/friends", label: "Друзья" },
  { href: "/account?tab=events", label: "Мои события" },
  { href: "/trips", label: "Мои поездки" },
  { href: "/lists", label: "Мои места" },
  { href: "/account/settings", label: "Настройки" },
  { href: "/help", label: "Помощь" },
];

/**
 * Профиль внутри мобильного меню — разделом со всеми пунктами сразу, а
 * не иконкой с ещё одним выпадающим списком: вложенное меню внутри
 * меню на телефоне неудобно, а иконки в общем ряду выглядели случайной
 * россыпью.
 */
export default function MobileProfileSection({ user }: { user: ProfileMenuUser }) {
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
          <span className="d-block text-white text-truncate">{user.name || "Профиль"}</span>
          {user.email && (
            <span className="small text-secondary d-block text-truncate">{user.email}</span>
          )}
        </span>
      </div>

      {/* Публичный профиль — ссылка, которой делятся с друзьями. */}
      {user.username && (
        <Link href={`/users/${user.username}`} className="nav-link">
          Мой профиль
        </Link>
      )}
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="nav-link">
          {item.label}
        </Link>
      ))}

      <form action={logout}>
        <button type="submit" className="nav-link mobile-profile-logout">
          Выйти
        </button>
      </form>
    </div>
  );
}
