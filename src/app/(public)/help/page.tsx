import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import FeedbackForm from "@/components/FeedbackForm";
import { getCurrentUser } from "@/lib/userAuth";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Помощь",
  description:
    "Как пользоваться MyBLHub и как написать нам, если чего-то не хватает.",
  path: "/help",
});


export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ fb?: string }>;
}) {
  // ?fb=<запрос> — переход из пустого поиска: подставляем контекст и
  // сразу выбираем «добавьте сериал/актёра».
  const { fb } = await searchParams;
  const user = await getCurrentUser();
  return (
    <div>
      <PageHeader eyebrow="Справка" title="Помощь" className="mb-5" />

      <div className="row g-4">
        <div className="col-12 col-lg-7 d-flex flex-column gap-3">
        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">Что это за сайт?</h2>
          <p className="text-secondary mb-0">
            MyBLHub — трекер концертов и фан-событий тайских BL-актёров: расписание
            событий, профили артистов и сериалов, избранное и статусы просмотра.
          </p>
        </div>

        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">Как добавить кого-то в избранное?</h2>
          <p className="text-secondary mb-0">
            Нажмите на иконку сердечка рядом с артистом, сериалом или событием.
            Всё избранное собирается в вашем{" "}
            <Link href="/account" className="link-body-emphasis">
              профиле
            </Link>
            .
          </p>
        </div>

        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">Как отметить, что я иду на событие?</h2>
          <p className="text-secondary mb-0">
            На странице события нажмите «Я пойду» — событие появится в разделе
            «Мои события» в профиле.
          </p>
        </div>

        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">Друзья</h2>
          <p className="text-secondary mb-0">
            В разделе{" "}
            <Link href="/friends" className="link-body-emphasis">
              «Друзья»
            </Link>{" "}
            можно найти других пользователей по имени или email и отправить заявку в друзья.
          </p>
        </div>

        </div>
        <div className="col-12 col-lg-5">
          <div className="surface p-4 position-sticky" id="feedback" style={{ top: "6.5rem" }}>
          <h2 className="h6 fw-semibold mb-2">Написать нам</h2>
          <p className="text-secondary small mb-3">
            Вопрос, идея или не хватает какого-то сериала/актёра — напишите, мы
            читаем все обращения.
          </p>
          <FeedbackForm
            defaultKind={fb ? "CONTENT_REQUEST" : "QUESTION"}
            context={fb ? `Поиск: «${fb}»` : ""}
            defaultEmail={user?.email ?? ""}
            emailRequired={!user}
          />
          </div>
        </div>
      </div>
    </div>
  );
}
