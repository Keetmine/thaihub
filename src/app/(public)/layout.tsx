import { telegramBotUsername } from "@/lib/telegram";
import TelegramPrompt from "@/components/TelegramPrompt";
import { Fragment } from "react";
import Link from "@/components/AppLink";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import { PUBLIC_NAV_ITEMS } from "@/components/publicNavItems";
import {
  MobileNavProvider,
  MobileMenuButton,
  MobileDrawer,
  MobileTabBar,
} from "@/components/MobileNav";
import ProfileMenu from "@/components/ProfileMenu";
import { TimezoneProvider } from "@/components/TimezoneProvider";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import NavDepthTracker from "@/components/NavDepthTracker";
import ScrollTopButton from "@/components/ScrollTopButton";
import SiteFooter from "@/components/SiteFooter";
import { assertNotBanned, getCurrentUser } from "@/lib/userAuth";
import { CalendarIcon, GridIcon, HeartIcon, InfoIcon, SearchIcon } from "@/components/icons";
import NotificationBell, { NotificationBellProvider } from "@/components/NotificationBell";
import { unreadNotificationCount } from "@/lib/notifications";
import MobileProfileSection, { MobileProfileHead } from "@/components/MobileProfileSection";
import ProductTour from "@/components/ProductTour";
import { getT, type Dict } from "@/lib/i18n";
import SearchOverlay from "@/components/SearchOverlay";

// Общий список ссылок для десктопного ряда и мобильной шторки —
// источник один (publicNavItems), рендер в двух местах. В шторке —
// с иконками и только каталог: «Поездки» (requiresUser) там живут в
// личной группе (MobileProfileSection), а не вперемешку с каталогом.
function MainNavLinks({
  loggedIn,
  t,
  drawer = false,
}: {
  loggedIn: boolean;
  t: Dict;
  drawer?: boolean;
}) {
  const items = PUBLIC_NAV_ITEMS.filter((item) =>
    drawer ? !item.requiresUser : !item.requiresUser || loggedIn,
  );
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const link = (
          <NavLink href={item.href} matchPrefixes={item.matchPrefixes}>
            {drawer ? (
              <>
                <Icon />
                <span>{t.nav[item.labelKey]}</span>
              </>
            ) : (
              t.nav[item.labelKey]
            )}
          </NavLink>
        );
        return item.tourId ? (
          <span key={item.href} data-tour={item.tourId}>
            {link}
          </span>
        ) : (
          <Fragment key={item.href}>{link}</Fragment>
        );
      })}
    </>
  );
}

/**
 * Показывать ли предложение привязать Telegram:
 *
 * - человек зарегистрирован ПОЧТОЙ и телеграма у него нет (у пришедших
 *   через Telegram он есть по определению);
 * - мы ещё не спрашивали: попап показывается один раз, отказ помним;
 * - тур уже пройден или закрыт: два окна разом — это не забота, а
 *   осада (поймано на проверке: тур перекрывал попап собой).
 *
 * Возраста аккаунта в условиях нет (правка владельца 2026-09-06):
 * предложить можно и новичку — важно не «сколько дней назад он
 * зарегистрировался», а что он прямо сейчас сидит на сайте. Это и
 * считает сам попап: пять минут ЖИВОГО времени на страницах, а не
 * таймер с момента загрузки.
 */
function shouldPromptTelegram(user: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  if (!user || user.telegramId || user.telegramPromptedAt) return false;
  return Boolean(user.tourCompletedAt);
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  // Заблокированный не должен получать сайт «как гость» — молчаливое
  // исчезновение своего имени и своих поездок человек читает как поломку.
  // Layout рендерится перед КАЖДОЙ публичной страницей, так что одной
  // строки хватает на весь сайт (сам экран /banned лежит вне этой
  // группы — иначе редирект зациклился бы).
  await assertNotBanned();
  const fullUser = await getCurrentUser();
  const isAdmin = !!fullUser?.isAdmin;
  // Счётчик у колокольчика: приглашения в поездки и заявки в друзья
  // приходили молча, пока не появилась лента (features/notifications.md).
  // null у гостя — колокольчика нет, и опрашивать сервер незачем.
  const unreadNotifications = fullUser ? await unreadNotificationCount(fullUser.id) : null;
  // Тур ВЫКЛЮЧЕН (решение владельца 2026-09-10: «визуально не нравится,
  // переделать»). Код тура цел и работает — снят только автозапуск после
  // регистрации и кнопка в настройках; вернуть его — это поставить
  // сюда прежнее условие `!fullUser.tourCompletedAt`. Задача на
  // переделку записана в docs/roadmap.md.
  const showTour = false;
  // Предложение привязать Telegram — тем, кто зарегистрировался почтой
  // (правка владельца 2026-09-06). Условия нарочно строгие: попап в
  // лицо новичку — худшее, что можно сделать со свежим аккаунтом.
  const showTelegramPrompt = shouldPromptTelegram(fullUser);
  // Без настроенного бота привязывать нечем — виджета Telegram просто
  // нет, и попап был бы пустым окном.
  const botUsername = showTelegramPrompt ? telegramBotUsername() : null;
  // Only pass the fields ProfileMenu actually needs into the client
  // component — the full record (incl. passwordHash) would otherwise be
  // serialized into the page's RSC payload.
  const user = fullUser
    ? {
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        photoUrl: fullUser.photoUrl,
        username: fullUser.username,
        timezone: fullUser.timezone,
      }
    : null;

  return (
    <NotificationBellProvider unread={unreadNotifications}>
      <MobileNavProvider>
        <div className="d-flex flex-column min-vh-100">
          <NavDepthTracker />
          <div className="ambient-wash" />
          <div className="container pt-4 nav-sticky">
            <nav className="pill-nav d-flex flex-wrap align-items-center gap-2 px-3 px-sm-4 py-2">
              <Link href="/" prefetch={false} className="navbar-brand mb-0 text-decoration-none">
                <Logo />
              </Link>

              {/* На мобильном частые действия живут рядом с бургером, а не
                  внутри меню: раньше иконки набивались в панель вперемешку с
                  пунктами навигации и выглядели случайной россыпью. */}
              <div className="d-lg-none d-flex align-items-center gap-1 ms-auto order-1">
                {user && (
                  <span data-tour="notifications">
                    <NotificationBell />
                  </span>
                )}
                {isAdmin && (
                  <Link href="/admin" prefetch={false} className="icon-btn" aria-label={t.nav.admin}>
                    <GridIcon />
                  </Link>
                )}
              </div>

              <div className="d-lg-none order-1">
                <MobileMenuButton />
              </div>

              {/* Полный ряд ссылок — от lg: ниже он не помещался и
                  сваливался во вторую-третью строку (шапка на 600px
                  вырастала до 195px). Там теперь бургер-шторка. */}
              <div className="d-none d-lg-flex flex-wrap gap-1 ms-2">
                <MainNavLinks loggedIn={!!user} t={t} />
              </div>

              <div className="d-none d-lg-flex align-items-center gap-2 ms-auto">
                <SearchOverlay />
                {/* На узких ноутбуках (lg) поле поиска съедает ряд —
                    вместо него иконка-ссылка на страницу поиска;
                    переключение — .nav-search-icon в globals.css. */}
                <Link
                  href="/search"
                  prefetch={false}
                  className="icon-btn nav-search-icon"
                  aria-label={t.nav.search}
                  data-tooltip={t.nav.search}
                >
                  <SearchIcon />
                </Link>
                {user && (
                  <Link
                    href="/events?filter=favorited"
                    prefetch={false}
                    className="icon-btn"
                    aria-label={t.nav.favorites}
                    data-tooltip={t.nav.favorites}
                  >
                    <HeartIcon />
                  </Link>
                )}
                {/* Метка тура и на десктопном колокольчике: раньше она
                    была только в мобильном блоке, querySelector находил
                    скрытый элемент — и шаг «уведомления» на десктопе
                    молча пропускался. */}
                {user && (
                  <span data-tour="notifications">
                    <NotificationBell />
                  </span>
                )}
                {isAdmin && (
                  <Link
                    href="/admin"
                    prefetch={false}
                    className="icon-btn"
                    aria-label={t.nav.admin}
                    data-tooltip={t.nav.admin}
                  >
                    <GridIcon />
                  </Link>
                )}
                {user ? (
                  <span data-tour="profile">
                    <ProfileMenu user={user} />
                  </span>
                ) : (
                  <NavLink href="/login">{t.nav.signIn}</NavLink>
                )}
              </div>
            </nav>
          </div>
          <main className="flex-fill container py-3 py-md-4 public-main">
            <TimezoneProvider timezone={user?.timezone ?? DEFAULT_TIMEZONE}>
              {children}
            </TimezoneProvider>
          </main>
          <SiteFooter />

          {/* Мобильная шторка и таб-бар — вне .pill-nav: его backdrop-filter
              сделал бы position:fixed панелей относительным навбара. */}
          {/* Шторка: юзер-блок (или «Войти») наверху, ниже поиск и две
              группы с подзаголовками — каталог и «моё». Раньше всё это
              лежало одним плоским списком, где Account и Notifications
              шли вперемешку с разделами каталога. */}
          <MobileDrawer>
            {user ? (
              <MobileProfileHead user={user} />
            ) : (
              <Link href="/login" prefetch={false} className="btn btn-primary drawer-signin">
                {t.nav.signIn}
              </Link>
            )}
            <SearchOverlay variant="drawer" />
            <div className="drawer-group">
              <p className="drawer-group-label">{t.footer.catalogue}</p>
              <MainNavLinks loggedIn={!!user} t={t} drawer />
              {/* Календарь есть в таб-баре, но шторка — полное меню, и
                  без него каталог тут выглядел бы неполным (в футере он
                  тоже в каталоге). В десктопный ряд не добавляем — семь
                  ссылок туда не влезают (см. docs/design-system.md). */}
              <NavLink href="/calendar" matchPrefixes={["/day/"]}>
                <CalendarIcon />
                <span>{t.nav.calendar}</span>
              </NavLink>
            </div>
            {user && <MobileProfileSection user={user} />}
            <div className="drawer-group">
              <NavLink href="/help">
                <InfoIcon />
                <span>{t.nav.help}</span>
              </NavLink>
            </div>
          </MobileDrawer>
          <MobileTabBar />

          <ScrollTopButton />
          {/* Тур для новичков: показывается один раз после регистрации,
              перезапускается кнопкой в настройках. */}
          {user && <ProductTour autoStart={showTour} />}
          {showTelegramPrompt && botUsername && <TelegramPrompt botUsername={botUsername} />}
        </div>
      </MobileNavProvider>
    </NotificationBellProvider>
  );
}
