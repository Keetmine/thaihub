"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { LOCALE_COOKIE, localeHref, stripLocale, type Locale } from "@/lib/i18n/config";
import { rememberLocale } from "@/app/(public)/localeActions";

/**
 * Переключатель языка. Кладёт выбор в куку на год — иначе на следующем
 * заходе автоопределение по браузеру снова увело бы человека туда,
 * откуда он только что ушёл, — и переводит на тот же адрес в другом
 * языке.
 *
 * Залогиненным выбор дублируется в профиль: кука живёт в одном браузере,
 * а язык нужен ещё и уведомлениям в Telegram и календарной подписке, где
 * браузера рядом нет.
 */
export default function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    // usePathname на русской странице отдаёт путь БЕЗ префикса (её
    // рисует рерайт), поэтому строим адрес от «чистого» пути.
    const { path } = stripLocale(pathname);
    // Не ждём ответа: переключение языка не должно упираться в запрос к
    // серверу, а не сохранившийся профиль — потеря удобства, не данных
    // (кука уже стоит, и следующий переключатель попробует снова).
    void rememberLocale(next).catch(() => {});
    router.push(localeHref(path, next));
    router.refresh();
  }

  return (
    <span className={`lang-switch d-inline-flex align-items-center ${className ?? ""}`}>
      <button
        type="button"
        className={`lang-switch-option ${locale === "en" ? "is-active" : ""}`}
        aria-pressed={locale === "en"}
        onClick={() => switchTo("en")}
      >
        EN
      </button>
      <span className="lang-switch-sep" aria-hidden>
        ·
      </span>
      <button
        type="button"
        className={`lang-switch-option ${locale === "ru" ? "is-active" : ""}`}
        aria-pressed={locale === "ru"}
        onClick={() => switchTo("ru")}
      >
        RU
      </button>
    </span>
  );
}
