import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import { prisma } from "@/lib/prisma";
import { suggestUsername } from "@/lib/userProfile";
import { pageMetadata } from "@/lib/seo";
import ProfileSetupForm from "./ProfileSetupForm";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Немного о себе",
  description:
    "Первый шаг после регистрации: выбираем ник — он же адрес профиля — и по желанию рассказываем о себе. Поменять можно когда угодно.",
  path: "/welcome/profile",
  noIndex: true,
});

// Шаг после регистрации: ник (обязателен, он же адрес профиля) и
// необязательные поля. Ник предзаполняем из Telegram-username или почты —
// человек не должен застревать на форме, чтобы попасть в приложение.
export default async function ProfileSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Ник уже задан — шаг пройден, идём дальше.
  if (user.username) redirect("/welcome");

  const seed = user.telegramUsername || user.email || user.name || "user";
  let suggestion = suggestUsername(seed);

  // Предложение должно быть свободным, иначе человек сразу упрётся в
  // «ник занят» на автоподставленном значении. Суффикс подбираем
  // перебором, а не случайным числом: рендер должен быть предсказуемым
  // (и правило react «никакой Math.random в рендере» — про это же).
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? suggestion : `${suggestion}${i + 1}`;
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) {
      suggestion = candidate;
      break;
    }
  }

  return (
    <div style={{ maxWidth: "44rem" }} className="mx-auto">
      <span className="eyebrow">Шаг 1 из 2</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2rem" }}>
        Немного о себе
      </h1>
      <p className="text-secondary mb-4">
        Ник нужен для ссылки на профиль — по ней вас добавят в друзья.
        Остальное по желанию.
      </p>
      <ProfileSetupForm suggestedUsername={suggestion} defaultName={user.name ?? ""} />
    </div>
  );
}
