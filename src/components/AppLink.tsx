"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { localeHref } from "@/lib/i18n/config";

type Props = ComponentProps<typeof NextLink>;

/**
 * Внутренняя ссылка, которая сама держит язык.
 *
 * Русские страницы отдаются рерайтом с префикса `/ru`, поэтому обычная
 * ссылка `/events` со страницы `/ru/artists` увела бы человека на
 * английскую версию. Обёртка подставляет префикс по языку из контекста;
 * внешние адреса, якоря и mailto не трогает (см. localeHref).
 *
 * Используется вместо `next/link` во всей публичной части. В админке
 * смысла нет — она одноязычная.
 */
export default function AppLink({ href, ...rest }: Props) {
  const locale = useLocale();
  const localized = typeof href === "string" ? localeHref(href, locale) : href;
  return <NextLink href={localized} {...rest} />;
}
