import Link from "next/link";
import FeedbackForm from "@/components/FeedbackForm";

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ fb?: string }>;
}) {
  // ?fb=<запрос> — переход из пустого поиска: подставляем контекст и
  // сразу выбираем «добавьте сериал/актёра».
  const { fb } = await searchParams;
  return (
    <div>
      <span className="eyebrow">Справка</span>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.25rem" }}>
        Помощь
      </h1>

      <div className="d-flex flex-column gap-3" style={{ maxWidth: "40rem" }}>
        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">Что это за сайт?</h2>
          <p className="text-secondary mb-0">
            MyBLHub — трекер концертов и фан-событий тайских BL-актёров: расписание
            событий, профили исполнителей и сериалов, избранное и статусы просмотра.
          </p>
        </div>

        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">Как добавить кого-то в избранное?</h2>
          <p className="text-secondary mb-0">
            Нажмите на иконку сердечка рядом с исполнителем, сериалом или событием.
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

        <div className="surface p-4" id="feedback">
          <h2 className="h6 fw-semibold mb-2">Написать нам</h2>
          <p className="text-secondary small mb-3">
            Вопрос, идея или не хватает какого-то сериала/актёра — напишите, мы
            читаем все обращения.
          </p>
          <FeedbackForm
            defaultKind={fb ? "CONTENT_REQUEST" : "QUESTION"}
            context={fb ? `Поиск: «${fb}»` : ""}
          />
        </div>
      </div>
    </div>
  );
}
