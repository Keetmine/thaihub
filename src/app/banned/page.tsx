import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FeedbackForm from "@/components/FeedbackForm";
import Logo from "@/components/Logo";
import { getBannedViewer } from "@/lib/userAuth";
import { logout } from "@/app/(public)/login/actions";
import { getT, localeHref } from "@/lib/i18n";

/**
 * Экран «вы заблокированы».
 *
 * Лежит ВНЕ группы (public) намеренно: её layout зовёт
 * assertNotBanned(), и страница внутри группы зациклила бы редирект на
 * саму себя. Заодно это честнее по смыслу — шапка с «моими поездками» и
 * колокольчиком человеку, которого сюда привели, ни к чему.
 *
 * Причину блокировки не показываем (решение владельца): она служебная,
 * для админа. Человек видит факт и форму обращения — без неё блокировка
 * выглядела бы как поломка сайта, и писать было бы некуда: /help лежит
 * в группе (public), и заблокированного с неё увело бы сюда же.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t.auth.banned.metaTitle,
    // Служебная страница одного человека — в выдаче ей делать нечего.
    robots: { index: false, follow: false },
  };
}

export default async function BannedPage() {
  const { t, locale } = await getT();
  // Страница адресная: кто не заблокирован (или вовсе не залогинен) —
  // на главную. Иначе адрес /banned пугал бы случайных людей.
  const banned = await getBannedViewer();
  if (!banned) redirect(localeHref("/", locale));

  return (
    <main className="container py-5" style={{ maxWidth: "38rem" }}>
      <div className="mb-4">
        <Logo />
      </div>

      <span className="eyebrow">{t.auth.banned.eyebrow}</span>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        {t.auth.banned.title}
      </h1>
      <p className="text-secondary">{t.auth.banned.lead}</p>

      <div className="surface p-3 p-md-4 mt-4">
        <h2 className="h6 fw-semibold mb-2">{t.auth.banned.contactTitle}</h2>
        <p className="small text-secondary">{t.auth.banned.contactLead}</p>
        {/* Обычная форма обращения (/admin/feedback + Telegram админам).
            Экшен видит заблокированного как анонима — getCurrentUser
            для него null, — поэтому почта обязательна; подставляем ту,
            что на аккаунте, чтобы обращение можно было сопоставить. */}
        <FeedbackForm
          context="Обращение с экрана блокировки"
          defaultEmail={banned.email ?? ""}
          emailRequired
          compact
        />
      </div>

      <form action={logout} className="mt-4">
        <button type="submit" className="btn btn-ghost btn-sm">
          {t.auth.banned.logout}
        </button>
      </form>
    </main>
  );
}
