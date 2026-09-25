"use client";

import Link from "@/components/AppLink";
import { logout } from "@/app/(public)/login/actions";
import { useT } from "@/components/LocaleProvider";
import type { Dict } from "@/lib/i18n/en";
import { userHref } from "@/lib/userProfile";
import type { ProfileMenuUser } from "./ProfileMenu";
import {
  BellIcon,
  PinIcon,
  PlaneIcon,
  SettingsIcon,
  TicketIcon,
  UsersIcon,
} from "./icons";

/**
 * Юзер-блок в самом верху мобильной шторки: аватар и имя — одна большая
 * ссылка на собственный профиль (/users/…, кабинет объединён с ним),
 * рядом отдельная кнопка настроек. Раньше блок висел в середине шторки
 * и никуда не вёл, а «Кабинет» лежал строчкой ниже вперемешку с
 * каталогом — «непонятное разделение на профиль и кабинет» (владелец).
 */
export function MobileProfileHead({ user }: { user: ProfileMenuUser }) {
  const t = useT();
  return (
    <div className="mobile-profile-head">
      <Link href={userHref(user)} className="mobile-profile-head-link">
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
          <span className="small text-secondary d-block text-truncate">{t.nav.myProfile} →</span>
        </span>
      </Link>
      <Link
        href="/account/settings"
        className="icon-btn flex-shrink-0"
        aria-label={t.nav.settings}
      >
        <SettingsIcon />
      </Link>
    </div>
  );
}

const PERSONAL_ITEMS: {
  href: string;
  labelKey: keyof Dict["nav"];
  icon: (props: { className?: string }) => React.ReactNode;
  /** Метка шага продуктового тура (дублирует tourId из publicNavItems —
   *  «Поездки» в шторке живут в личной группе, а не в каталоге). */
  tourId?: string;
}[] = [
  { href: "/notifications", labelKey: "notifications", icon: BellIcon },
  { href: "/friends", labelKey: "friends", icon: UsersIcon },
  { href: "/trips", labelKey: "myTrips", icon: PlaneIcon, tourId: "trips" },
  { href: "/lists", labelKey: "myPlaces", icon: PinIcon },
];

/**
 * Группа «Моё» в мобильной шторке: личные разделы с иконками под своим
 * подзаголовком, визуально отделённые от каталога. «Мои события» ведут
 * на вкладку собственного профиля — отдельной страницы больше нет.
 */
export default function MobileProfileSection({ user }: { user: ProfileMenuUser }) {
  const t = useT();
  return (
    <div className="mobile-profile drawer-group">
      <p className="drawer-group-label">{t.footer.personal}</p>
      <Link href={`${userHref(user)}?tab=events`} className="nav-link">
        <TicketIcon />
        <span>{t.nav.myEvents}</span>
      </Link>
      {PERSONAL_ITEMS.map(({ href, labelKey, icon: Icon, tourId }) => {
        const link = (
          <Link key={href} href={href} className="nav-link">
            <Icon />
            <span>{t.nav[labelKey]}</span>
          </Link>
        );
        return tourId ? (
          <span key={href} data-tour={tourId}>
            {link}
          </span>
        ) : (
          link
        );
      })}
      <form action={logout}>
        <button type="submit" className="nav-link mobile-profile-logout">
          {t.nav.signOut}
        </button>
      </form>
    </div>
  );
}
