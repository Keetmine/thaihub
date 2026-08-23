import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { eventHref } from "@/lib/eventSlug";
import PosterTile from "@/components/PosterTile";
import { formatShortDate } from "@/lib/dates";
import { CalendarIcon, HeartIcon, TvIcon } from "@/components/icons";

// Лендинг (он же /about). Живые данные вместо выдуманных: постеры и
// агенда — реальные ближайшие события, счётчики — реальный каталог.
export default async function LandingPage() {
  const now = new Date();
  const [upcomingRaw, upcomingEventsCount, performersCount, dramasCount, currentUser] =
    await Promise.all([
      prisma.eventOccurrence.findMany({
        where: { startsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        take: 12,
        include: {
          event: {
            select: {
              id: true,
              slug: true,
              title: true,
              venue: true,
              posterUrl: true,
              performers: {
                include: { performer: { select: { name: true } } },
                take: 3,
              },
            },
          },
        },
      }),
      prisma.event.count({ where: { occurrences: { some: { startsAt: { gte: now } } } } }),
      prisma.performer.count(),
      prisma.drama.count(),
      // Авторизованному незачем показывать «Зарегистрироваться / Войти» —
      // он уже внутри (страница /about открыта всем).
      getCurrentUser(),
    ]);

  // Многодневное событие показываем один раз — первой датой.
  const seenEvents = new Set<string>();
  const upcoming = upcomingRaw.filter(
    (occ) => !seenEvents.has(occ.eventId) && seenEvents.add(occ.eventId),
  );
  // Стена постеров hero: сперва события с постерами, добираем без них.
  const fanPool = [
    ...upcoming.filter((o) => o.event.posterUrl),
    ...upcoming.filter((o) => !o.event.posterUrl),
  ].slice(0, 3);
  const agenda = upcoming.slice(0, 3);

  const authCta = currentUser ? (
    <>
      <Link href="/events" className="btn btn-primary">
        Открыть афишу
      </Link>
      <Link href="/account" className="btn btn-ghost">
        Мой профиль
      </Link>
    </>
  ) : (
    <>
      <Link href="/signup" className="btn btn-primary">
        Создать аккаунт
      </Link>
      <Link href="/login" className="btn btn-ghost">
        Войти
      </Link>
    </>
  );

  return (
    <div className="d-flex flex-column gap-5">
      {/* ---------- Hero: текст слева, стена постеров справа ---------- */}
      <section className="py-3 py-md-4">
        <div className="row g-4 g-lg-5 align-items-center">
          <div className="col-12 col-lg-7">
            <span className="eyebrow d-inline-flex mb-3">
              Фан-трекер тайских BL-событий
            </span>
            <h1
              className="display-1-tight mb-3"
              style={{ fontSize: "clamp(2.3rem, 5vw, 3.4rem)", maxWidth: "40rem" }}
            >
              Концерты, сериалы и артисты —{" "}
              <span className="text-warm-gradient">в одном месте</span>
            </h1>
            <p
              className="text-secondary mb-4"
              style={{ maxWidth: "32rem", fontSize: "1.05rem" }}
            >
              MyBLHub собирает афишу фанмитов и концертов, каталог артистов и
              сериалов, ваши избранное и планы — чтобы ничего не пропустить.
            </p>
            <div className="d-flex flex-wrap gap-2 mb-4">{authCta}</div>
            <p className="small text-secondary mb-0" style={{ opacity: 0.75 }}>
              {upcomingEventsCount} событий в афише · {performersCount} артистов ·{" "}
              {dramasCount} сериалов в каталоге
            </p>
          </div>
          <div className="col-12 col-lg-5">
            {fanPool.length > 0 && (
              <div className="poster-fan">
                {fanPool.map((occ) => (
                  <PosterTile
                    key={occ.id}
                    href={eventHref(occ.event)}
                    posterUrl={occ.event.posterUrl}
                    title={occ.event.title}
                    chip={formatShortDate(occ.startsAt)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Bento: что внутри ---------- */}
      <section>
        <div className="text-center mb-4">
          <span className="eyebrow d-inline-flex mb-2">Возможности</span>
          <h2 className="display-1-tight" style={{ fontSize: "1.9rem" }}>
            Что внутри
          </h2>
        </div>
        <div className="row g-3 stagger">
          {/* Большая карточка афиши с живой агендой */}
          <div className="col-12 col-lg-7">
            <div className="glow-panel h-100 p-4 p-md-5 d-flex flex-column">
              <div className="d-flex align-items-center gap-2 mb-2">
                <CalendarIcon />
                <p className="font-display fw-medium text-white mb-0">
                  Афиша и препродажи
                </p>
                <span className="date-chip">по подписке</span>
              </div>
              <p className="small text-secondary mb-4" style={{ maxWidth: "28rem" }}>
                Концерты и фанмиты по дням, со стартами продаж, билетами и
                напоминаниями в Telegram — за час до открытия продаж.
              </p>
              <div className="d-flex flex-column gap-2 mt-auto">
                {agenda.map((occ) => (
                  <div key={occ.id} className="agenda-row">
                    <div className="agenda-time">
                      <span className="agenda-time-start">
                        {formatShortDate(occ.startsAt)}
                      </span>
                    </div>
                    <span className="agenda-dash">—</span>
                    <div className="agenda-body">
                      <p className="h6 font-display mb-1">{occ.event.title}</p>
                      <p className="small text-secondary mb-0">
                        {occ.event.venue}
                        {occ.event.performers.length > 0 &&
                          ` · ${occ.event.performers.map((ep) => ep.performer.name).join(", ")}`}
                      </p>
                    </div>
                  </div>
                ))}
                {agenda.length === 0 && (
                  <p className="small text-secondary mb-0">
                    Афиша пополняется каждую неделю.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Стопка справа */}
          <div className="col-12 col-lg-5 d-flex flex-column gap-3">
            <div className="surface surface-hover p-4 flex-fill">
              <div className="d-flex align-items-center gap-2 mb-2">
                <HeartIcon />
                <p className="font-display fw-medium text-white mb-0">
                  Артисты и избранное
                </p>
              </div>
              <p className="small text-secondary mb-0">
                Профили актёров, групп и пейрингов с фильмографией и
                дискографией. Сердечко — и их события и релизы попадают в вашу
                ленту.
              </p>
            </div>
            <div className="surface surface-hover p-4 flex-fill">
              <div className="d-flex align-items-center gap-2 mb-2">
                <TvIcon />
                <p className="font-display fw-medium text-white mb-0">
                  Сериалы и статусы
                </p>
              </div>
              <p className="small text-secondary mb-0">
                Смотрю, посмотрено, в планах — отмечайте сериалы, собирайте свою
                коллекцию и находите места съёмок на карте.
              </p>
            </div>
          </div>

          {/* Кремовый ряд: друзья и поездки */}
          <div className="col-12">
            <div className="card-cream p-4 p-md-5">
              <div className="row g-4 align-items-center">
                <div className="col-12 col-lg-7">
                  <p className="font-display fw-semibold mb-2" style={{ fontSize: "1.35rem" }}>
                    Друзья и поездки — потому что вместе веселее
                  </p>
                  <p className="cream-muted small mb-0" style={{ maxWidth: "34rem" }}>
                    Смотрите, кто из друзей идёт на событие, планируйте поездку в
                    Таиланд на общие даты: события, отели, списки мест и «что
                    посетить» рядом с датами — всё в одном плане.
                  </p>
                </div>
                <div className="col-12 col-lg-5 text-lg-end">
                  <Link
                    href={currentUser ? "/trips" : "/signup"}
                    className="btn btn-dark rounded-pill px-4"
                  >
                    {currentUser ? "Мои поездки" : "Попробовать"}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Кто мы ---------- */}
      <section className="surface p-4 p-md-5">
        <div className="row g-4 align-items-center">
          <div className="col-12 col-lg-7">
            <span className="eyebrow mb-2 d-inline-flex">Кто мы</span>
            <h2 className="display-1-tight mb-3" style={{ fontSize: "1.9rem" }}>
              Сделано фанатами — для фанатов
            </h2>
            <p className="text-secondary mb-2">
              MyBLHub вырос из личных табличек и заметок: когда пресейл, куда
              лететь, что смотреть дальше. В какой-то момент таблички перестали
              справляться — и мы собрали всё в один сервис: афишу, каталог и
              планировщик поездок.
            </p>
            <p className="text-secondary mb-0">
              Здесь нет алгоритмов и рекламы — только события, любимые артисты
              и люди, с которыми вы на одной волне. Чего-то не хватает?{" "}
              <Link href="/help" className="link-body-emphasis">
                Напишите нам
              </Link>
              {" "}— мы читаем всё.
            </p>
          </div>
          <div className="col-12 col-lg-5">
            <div className="glow-panel p-4">
              <p className="font-display fw-medium text-white mb-3">
                Что уже внутри
              </p>
              <ul className="list-unstyled d-flex flex-column gap-2 small text-secondary mb-0">
                <li>🎤 {upcomingEventsCount} событий в афише — с пресейлами и билетами</li>
                <li>✨ {performersCount} артистов и групп с фильмографией и музыкой</li>
                <li>📺 {dramasCount} сериалов с местами съёмок на карте</li>
                <li>🗺 Поездки, списки мест и вики для фанатов</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Как это работает ---------- */}
      <section>
        <div className="text-center mb-4">
          <span className="eyebrow d-inline-flex mb-2">Как это работает</span>
          <h2 className="display-1-tight" style={{ fontSize: "1.9rem" }}>
            Три шага — и вы в курсе всего
          </h2>
        </div>
        <div className="row g-3 stagger">
          {[
            {
              n: "01",
              title: "Зарегистрируйтесь",
              body: "Email и пароль — каталог, избранное и статусы просмотра доступны сразу.",
            },
            {
              n: "02",
              title: "Найдите своих",
              body: "Актёры, группы, сериалы, пейринги — добавляйте в избранное одним кликом.",
            },
            {
              n: "03",
              title: "Следите за событиями",
              body: "Отмечайте «Я пойду», получайте .ics в календарь, ловите препродажи с ботом.",
            },
          ].map((s) => (
            <div key={s.n} className="col-12 col-md-4">
              <div className="surface h-100 p-4">
                <span className="ghost-number d-block mb-3">{s.n}</span>
                <p className="font-display fw-medium text-white mb-2">{s.title}</p>
                <p className="small text-secondary mb-0">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="glow-panel text-center p-4 p-md-5">
        <h2 className="display-1-tight mb-3" style={{ fontSize: "1.9rem" }}>
          {currentUser ? "Рады видеть снова" : "Готовы начать?"}
        </h2>
        <p className="text-secondary mx-auto mb-4" style={{ maxWidth: "28rem" }}>
          {currentUser
            ? "Загляните в афишу — там всё, что скоро происходит."
            : "Регистрация занимает меньше минуты — email и пароль, без лишних вопросов."}
        </p>
        <div className="d-flex flex-wrap justify-content-center gap-2">{authCta}</div>
      </section>
    </div>
  );
}
