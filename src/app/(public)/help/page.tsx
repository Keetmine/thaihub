import Link from "next/link";

export default function HelpPage() {
  return (
    <div>
      <span className="eyebrow">Справка</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Помощь
      </h1>

      <div className="d-flex flex-column gap-3" style={{ maxWidth: "40rem" }}>
        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">Что это за сайт?</h2>
          <p className="text-secondary mb-0">
            ThaiHub — трекер концертов и фан-событий тайских BL-актёров: расписание
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

        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">Что-то не работает</h2>
          <p className="text-secondary mb-0">
            Напишите администратору сайта напрямую — обратной связи через форму пока нет.
          </p>
        </div>
      </div>
    </div>
  );
}
