import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Условия использования",
  description:
    "Условия использования MyBLHub: что даёт подписка, как она оплачивается, возврат и правила сервиса.",
  path: "/terms",
});

// Условия и оферта. Требуется Telegram для ботов, принимающих Stars
// (Live Checklist в core.telegram.org/bots/payments-stars) — бот
// отвечает на /terms ссылкой сюда.
export default function TermsPage() {
  return (
    <div className="container-narrow py-4">
      <span className="eyebrow">Документы</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Условия использования
      </h1>

      <div className="surface p-4 d-flex flex-column gap-4">
        <section>
          <h2 className="section-heading mb-2">Что такое MyBLHub</h2>
          <p className="mb-0 text-secondary">
            MyBLHub — сервис для поклонников тайских BL-сериалов: афиша концертов и
            фанмитов, каталог актёров и сериалов, места съёмок, планирование поездок
            и напоминания в Telegram. Часть каталога открыта всем, афиша событий и
            личные разделы доступны по подписке.
          </p>
        </section>

        <section>
          <h2 className="section-heading mb-2">Подписка и оплата</h2>
          <ul className="text-secondary mb-0 d-flex flex-column gap-2">
            <li>
              Подписка открывает афишу событий, календарь, поездки, списки мест и
              уведомления на 30 дней с момента оплаты.
            </li>
            <li>
              Оплата разовая. Автоматического продления нет — по истечении срока
              подписка просто заканчивается, деньги повторно не списываются.
            </li>
            <li>
              Сейчас подписка подключается по промокоду или по договорённости —
              напишите нам со страницы подписки. Если включена оплата внутри
              Telegram (Telegram Stars), она проходит целиком на стороне
              Telegram: мы не получаем и не храним данные банковских карт.
            </li>
            <li>
              Промокод, если он у вас есть, активируется на странице подписки и
              добавляет соответствующее число месяцев.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="section-heading mb-2">Возврат</h2>
          <p className="mb-0 text-secondary">
            Если подписка была оплачена, а сервис не работает так, как обещано,
            напишите нам в течение 14 дней после оплаты — вернём оплату
            полностью. Возврат Telegram Stars оформляется средствами Telegram
            на тот же аккаунт, с которого была оплата; подписка при этом
            прекращается.
          </p>
        </section>

        <section>
          <h2 className="section-heading mb-2">Содержимое каталога</h2>
          <p className="mb-0 text-secondary">
            Данные о сериалах, актёрах и событиях собраны из открытых источников,
            которые указаны на страницах записей в блоке «Источники». Если вы
            правообладатель и хотите, чтобы материал был убран или дополнен
            указанием авторства, напишите нам через форму обращения — ответим и
            поправим в течение семи дней.
          </p>
        </section>

        <section>
          <h2 className="section-heading mb-2">Правила пользования</h2>
          <ul className="text-secondary mb-0 d-flex flex-column gap-2">
            <li>Не публикуйте оскорбления, спам и чужие персональные данные.</li>
            <li>
              Не выдавайте себя за других людей — ни за актёров, ни за других
              пользователей.
            </li>
            <li>
              Аккаунты, нарушающие эти правила, могут быть ограничены без возврата
              оплаты за оставшийся срок.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="section-heading mb-2">Данные</h2>
          <p className="mb-0 text-secondary">
            Мы храним то, что нужно для работы сервиса: аккаунт (почта, Google
            или Telegram), избранное, отметки «иду», поездки и заметки.
            Настройки приватности в профиле управляют тем, что видят другие
            пользователи. Какие данные мы собираем, какие сервисы их получают
            (аналитика, отчёты об ошибках, Telegram) и как удалить аккаунт —
            в{" "}
            <Link href="/privacy" className="link-body-emphasis">
              политике конфиденциальности
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="section-heading mb-2">Связь</h2>
          <p className="mb-0 text-secondary">
            Вопросы, возвраты и жалобы — через{" "}
            <Link href="/help" className="link-body-emphasis">
              форму обращения
            </Link>{" "}
            или командой <code>/support</code> в боте.
          </p>
        </section>
      </div>
    </div>
  );
}
