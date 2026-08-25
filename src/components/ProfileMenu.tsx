"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/AppLink";
import { logout } from "@/app/(public)/login/actions";
import { useT } from "@/components/LocaleProvider";
import { UserIcon } from "./icons";

export type ProfileMenuUser = {
  id: string;
  name: string | null;
  email: string | null;
  photoUrl: string | null;
  username: string | null;
};

export default function ProfileMenu({ user }: { user: ProfileMenuUser }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn profile-menu-trigger"
        aria-label={user.name || t.nav.profile}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {user.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
        loading="lazy"
        decoding="async" src={user.photoUrl} alt="" className="profile-menu-avatar" />
        ) : (
          <UserIcon />
        )}
      </button>

      {open && (
        <div className="profile-menu-panel">
          {/* Публичная страница — ссылкой на неё делятся с друзьями
              («добавь меня»), поэтому «Мой профиль» ведёт именно туда, а
              настройки и статистика живут в кабинете. */}
          <Link
            href={user.username ? `/users/${user.username}` : "/account"}
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            {t.nav.myProfile}
          </Link>
          <Link href="/account" className="profile-menu-item" onClick={() => setOpen(false)}>
            {t.nav.account}
          </Link>
          <Link
            href="/friends"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            {t.nav.friends}
          </Link>
          <Link
            href="/account?tab=events"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            {t.nav.myEvents}
          </Link>
          <Link
            href="/trips"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            {t.nav.myTrips}
          </Link>
          <Link
            href="/lists"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            {t.nav.myPlaces}
          </Link>
          <Link
            href="/account/settings"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            {t.nav.settings}
          </Link>
          <div className="profile-menu-divider" />
          <Link
            href="/help"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            {t.nav.help}
          </Link>
          <form action={logout}>
            <button type="submit" className="profile-menu-item profile-menu-logout">
              {t.nav.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
