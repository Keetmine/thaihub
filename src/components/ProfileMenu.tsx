"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/app/(public)/login/actions";
import { UserIcon } from "./icons";

export type ProfileMenuUser = {
  id: string;
  name: string | null;
  email: string;
  photoUrl: string | null;
};

export default function ProfileMenu({ user }: { user: ProfileMenuUser }) {
  const [open, setOpen] = useState(false);
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
        aria-label={user.name || "Профиль"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {user.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoUrl} alt="" className="profile-menu-avatar" />
        ) : (
          <UserIcon />
        )}
      </button>

      {open && (
        <div className="profile-menu-panel">
          <Link
            href="/account"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            Мой профиль
          </Link>
          <Link
            href="/friends"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            Друзья
          </Link>
          <Link
            href="/account?tab=events"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            Мои события
          </Link>
          <Link
            href="/account/settings"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            Настройки
          </Link>
          <div className="profile-menu-divider" />
          <Link
            href="/help"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            Помощь
          </Link>
          <form action={logout}>
            <button type="submit" className="profile-menu-item profile-menu-logout">
              Выйти
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
