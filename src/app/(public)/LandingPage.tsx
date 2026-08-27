import Link from "@/components/AppLink";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { eventHref } from "@/lib/eventSlug";
import PosterTile from "@/components/PosterTile";
import { formatShortDate } from "@/lib/dates";
import { getT, type Locale } from "@/lib/i18n";
import { CalendarIcon, HeartIcon, TvIcon } from "@/components/icons";

// Лендинг (он же /about). Живые данные вместо выдуманных: постеры и
// агенда — реальные ближайшие события, счётчики — реальный каталог.

/**
 * Счётчик для витрины: округляем ВНИЗ до крупного шага — «9 500+».
 *
 * Точная цифра на лендинге девальвируется сама собой (вчера 9689,
 * сегодня 9691 — а выглядит как «никто не обновляет»), округлённая
 * живёт месяцами. Вниз, а не к ближайшему: «10 000+» при 9689 — это
 * враньё на витрине, а «9 500+» — правда при любом росте.
 */
function roundedCount(n: number, locale: Locale): string {
  const step = n >= 10000 ? 1000 : n >= 1000 ? 500 : 100;
  const floored = Math.floor(n / step) * step;
  return `${floored.toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}+`;
}

export default async function LandingPage() {
  const { t, locale } = await getT();
  const now = new Date();
  const [upcomingRaw, performersCount, dramasCount, currentUser] =
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
        {t.landing.ctaEvents}
      </Link>
      <Link href="/account" className="btn btn-ghost">
        {t.nav.myProfile}
      </Link>
    </>
  ) : (
    <>
      <Link href="/signup" className="btn btn-primary">
        {t.landing.ctaSignup}
      </Link>
      <Link href="/login" className="btn btn-ghost">
        {t.nav.signIn}
      </Link>
    </>
  );

  return (
    <div className="d-flex flex-column gap-5">
      {/* ---------- Hero: текст слева, стена постеров справа ---------- */}
      <section className="py-3 py-md-4">
        <div className="row g-4 g-lg-5 align-items-center">
          <div className="col-12 col-lg-7">
            <span className="eyebrow d-inline-flex mb-3">{t.landing.heroEyebrow}</span>
            <h1
              className="display-1-tight mb-3"
              style={{ fontSize: "clamp(2.3rem, 5vw, 3.4rem)", maxWidth: "40rem" }}
            >
              {t.landing.heroTitle}{" "}
              <span className="text-warm-gradient">{t.landing.heroTitleAccent}</span>
            </h1>
            <p
              className="text-secondary mb-4"
              style={{ maxWidth: "32rem", fontSize: "1.05rem" }}
            >
              {t.landing.heroLead}
            </p>
            <div className="d-flex flex-wrap gap-2 mb-4">{authCta}</div>
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
          <span className="eyebrow d-inline-flex mb-2">{t.landing.featuresEyebrow}</span>
          <h2 className="display-1-tight" style={{ fontSize: "1.9rem" }}>
            {t.landing.featuresTitle}
          </h2>
        </div>
        <div className="row g-3 stagger">
          {/* Большая карточка афиши с живой агендой */}
          <div className="col-12 col-lg-7">
            <div className="glow-panel h-100 p-4 p-md-5 d-flex flex-column">
              <div className="d-flex align-items-center gap-2 mb-2">
                <CalendarIcon />
                <p className="font-display fw-medium text-white mb-0">
                  {t.landing.eventsTitle}
                </p>
                <span className="date-chip">{t.landing.eventsChip}</span>
              </div>
              <p className="small text-secondary mb-4" style={{ maxWidth: "28rem" }}>
                {t.landing.eventsBody}
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
                  <p className="small text-secondary mb-0">{t.landing.agendaEmpty}</p>
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
                  {t.landing.artistsTitle}
                </p>
              </div>
              <p className="small text-secondary mb-0">{t.landing.artistsBody}</p>
            </div>
            <div className="surface surface-hover p-4 flex-fill">
              <div className="d-flex align-items-center gap-2 mb-2">
                <TvIcon />
                <p className="font-display fw-medium text-white mb-0">
                  {t.landing.seriesTitle}
                </p>
              </div>
              <p className="small text-secondary mb-0">{t.landing.seriesBody}</p>
            </div>
          </div>

          {/* Кремовый ряд: друзья и поездки */}
          <div className="col-12">
            <div className="card-cream p-4 p-md-5">
              <div className="row g-4 align-items-center">
                <div className="col-12 col-lg-7">
                  <p className="font-display fw-semibold mb-2" style={{ fontSize: "1.35rem" }}>
                    {t.landing.friendsTitle}
                  </p>
                  <p className="cream-muted small mb-0" style={{ maxWidth: "34rem" }}>
                    {t.landing.friendsBody}
                  </p>
                </div>
                <div className="col-12 col-lg-5 text-lg-end">
                  <Link
                    href={currentUser ? "/trips" : "/signup"}
                    className="btn btn-dark rounded-pill px-4"
                  >
                    {currentUser ? t.nav.myTrips : t.landing.friendsCta}
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
            <span className="eyebrow mb-2 d-inline-flex">{t.landing.aboutEyebrow}</span>
            <h2 className="display-1-tight mb-3" style={{ fontSize: "1.9rem" }}>
              {t.landing.aboutTitle}
            </h2>
            <p className="text-secondary mb-2">{t.landing.aboutStory}</p>
            <p className="text-secondary mb-0">
              {t.landing.aboutNoAds}{" "}
              <Link href="/help" className="link-body-emphasis">
                {t.landing.aboutContactLink}
              </Link>
              {" "}
              {t.landing.aboutContactEnd}
            </p>
          </div>
          <div className="col-12 col-lg-5">
            <div className="glow-panel p-4">
              <p className="font-display fw-medium text-white mb-3">
                {t.landing.insideTitle}
              </p>
              <ul className="list-unstyled d-flex flex-column gap-2 small text-secondary mb-0">
                <li>🎤 {t.landing.insideEvents}</li>
                <li>✨ {t.landing.insideArtists(roundedCount(performersCount, locale))}</li>
                <li>📺 {t.landing.insideSeries(roundedCount(dramasCount, locale))}</li>
                <li>🗺 {t.landing.insideExtras}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Как это работает ---------- */}
      <section>
        <div className="text-center mb-4">
          <span className="eyebrow d-inline-flex mb-2">{t.landing.howEyebrow}</span>
          <h2 className="display-1-tight" style={{ fontSize: "1.9rem" }}>
            {t.landing.howTitle}
          </h2>
        </div>
        <div className="row g-3 stagger">
          {[
            { n: "01", title: t.landing.step1Title, body: t.landing.step1Body },
            { n: "02", title: t.landing.step2Title, body: t.landing.step2Body },
            { n: "03", title: t.landing.step3Title, body: t.landing.step3Body },
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
          {currentUser ? t.landing.finalTitleUser : t.landing.finalTitleGuest}
        </h2>
        <p className="text-secondary mx-auto mb-4" style={{ maxWidth: "28rem" }}>
          {currentUser ? t.landing.finalBodyUser : t.landing.finalBodyGuest}
        </p>
        <div className="d-flex flex-wrap justify-content-center gap-2">{authCta}</div>
      </section>
    </div>
  );
}
