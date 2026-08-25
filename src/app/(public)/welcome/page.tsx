import { redirect } from "next/navigation";
import AppLink from "@/components/AppLink";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref } from "@/lib/i18n";
import WelcomePicker from "./WelcomePicker";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.auth.welcome.metaTitle,
    description: t.auth.welcome.metaDescription,
    path: "/welcome",
    noIndex: true,
    locale,
  });
}

export const dynamic = "force-dynamic";

// Онбординг после регистрации: сразу выбрать любимых артистов, чтобы
// «Мои артисты», уведомления и избранное заработали с первого дня.
export default async function WelcomePage() {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  // Ник — обязательная часть регистрации: без него профиль недоступен
  // по ссылке, а просить его позже человек уже не станет.
  if (!user.username) redirect(localeHref("/welcome/profile", locale));

  // Стартовые варианты — самые «событийные» артисты (у них точно есть
  // что показать), остальных доищут через поиск.
  // Популярность меряем избранным: «много событий» — это про наш
  // каталог, а не про то, кого любят. Новичку показываем тех, кого чаще
  // всего добавляют себе.
  const popular = await prisma.performer.findMany({
    where: { type: "SOLO", photoUrl: { not: null } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: [{ favoritedBy: { _count: "desc" } }, { events: { _count: "desc" } }],
    take: 18,
  });

  return (
    <div style={{ maxWidth: "44rem" }} className="mx-auto">
      <span className="eyebrow">{t.auth.welcome.eyebrow}</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2.25rem" }}>
        {t.auth.welcome.title}
      </h1>
      <p className="text-secondary mb-4">{t.auth.welcome.lead}</p>
      <WelcomePicker popular={popular} />
      <p className="small text-secondary mt-3">
        <AppLink href="/" className="link-body-emphasis">
          {t.auth.welcome.skip}
        </AppLink>
      </p>
    </div>
  );
}
