"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { LOCALE_COOKIE, localeHref, stripLocale, type Locale } from "@/lib/i18n/config";

/**
 * Переключатель языка. Кладёт выбор в куку на год — иначе на следующем
 * заходе автоопределение по браузеру снова увело бы человека туда,
 * откуда он только что ушёл, — и переводит на тот же адрес в другом
 * языке.
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
