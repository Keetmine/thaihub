import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import WelcomePicker from "./WelcomePicker";

export const dynamic = "force-dynamic";

// Онбординг после регистрации: сразу выбрать любимых артистов, чтобы
// «Мои артисты», уведомления и избранное заработали с первого дня.
export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Ник — обязательная часть регистрации: без него профиль недоступен
  // по ссылке, а просить его позже человек уже не станет.
  if (!user.username) redirect("/welcome/profile");

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
      <span className="eyebrow">Добро пожаловать</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2.25rem" }}>
        Кого вы любите?
      </h1>
      <p className="text-secondary mb-4">
        Выберите любимых артистов — их события появятся во вкладке «Мои
        артисты», а избранное соберётся с первого дня. Это можно поменять в
        любой момент.
      </p>
      <WelcomePicker popular={popular} />
      <p className="small text-secondary mt-3">
        <Link href="/" className="link-body-emphasis">
          Пропустить и перейти к афише →
        </Link>
      </p>
    </div>
  );
}
