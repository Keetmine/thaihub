import { redirect } from "next/navigation";
import AppLink from "@/components/AppLink";
import { getCurrentUser } from "@/lib/userAuth";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref } from "@/lib/i18n";
import { getMdlListRunState } from "@/lib/mdlListImport";
import MdlImportSection from "@/app/(public)/account/settings/MdlImportSection";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.onboardingImport.metaTitle,
    description: t.onboardingImport.metaDescription,
    path: "/welcome/import",
    noIndex: true,
    locale,
  });
}

/**
 * Шаг онбординга между профилем и выбором артистов: «уже ведёте список
 * на MyDramaList — перенесите статусы». Момент выбран нарочно: сразу
 * после регистрации человек ещё помнит про свой старый список, а пустой
 * каталог «смотрю/посмотрел» — главная причина не вернуться.
 *
 * Шаг ничем не обязывает: «Пропустить» — обычная ссылка на следующий
 * шаг, никакой отметки «пройдено» в базе нет. Существующие пользователи
 * сюда не попадают: единственный вход — переход с /welcome/profile
 * после сохранения ника, а тот же импорт всегда доступен в настройках.
 *
 * Секция импорта — та же, что в настройках (прямой импорт компонента).
 * Кнопка «Продолжить» появляется после завершения прогона без своего
 * поллинга: секция по завершении зовёт router.refresh(), страница
 * перерендеривается и видит state === "done" в том же in-memory
 * состоянии, из которого поллит сама секция.
 */
export default async function WelcomeImportPage() {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  // Без ника сюда рано: сначала обязательный шаг профиля.
  if (!user.username) redirect(localeHref("/welcome/profile", locale));

  const done = getMdlListRunState(user.id)?.state === "done";

  return (
    <div style={{ maxWidth: "44rem" }} className="mx-auto">
      <span className="eyebrow">{t.onboardingImport.eyebrow}</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2rem" }}>
        {t.onboardingImport.title}
      </h1>
      <p className="text-secondary mb-4">{t.onboardingImport.lead}</p>

      <MdlImportSection />

      <div className="d-flex flex-wrap align-items-center gap-3 mt-4">
        {done ? (
          <>
            <AppLink href="/welcome" className="btn btn-primary">
              {t.onboardingImport.continueBtn}
            </AppLink>
            <span className="small text-secondary">{t.onboardingImport.doneHint}</span>
          </>
        ) : (
          <AppLink href="/welcome" className="btn btn-outline-secondary">
            {t.onboardingImport.skip}
          </AppLink>
        )}
      </div>
    </div>
  );
}
