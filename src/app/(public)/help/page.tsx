import AppLink from "@/components/AppLink";
import PageHeader from "@/components/PageHeader";
import FeedbackForm from "@/components/FeedbackForm";
import FaqHashOpener from "./FaqHashOpener";
import { getCurrentUser } from "@/lib/userAuth";
import { pageMetadata } from "@/lib/seo";
import { getT, type Dict } from "@/lib/i18n";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.legal.help.metaTitle,
    description: t.legal.help.metaDescription,
    path: "/help",
    locale,
  });
}

type FaqLink = { href: string; label: string };
type FaqItem = { id: string; q: string; a: string; links?: FaqLink[] };
type FaqTopic = { id: string; title: string; items: FaqItem[] };

/**
 * Дерево вопросов собирается тут, а не в словаре, по двум причинам.
 *
 * Во-первых, ссылки под ответом — это адреса, а не текст: их место в
 * коде, иначе перевод отвечал бы ещё и за маршруты. Во-вторых, забытый
 * при переводе вопрос так ловится типом: каждый ключ раскрывается здесь
 * поимённо, и вопрос, которого нет в русском словаре, не соберётся.
 *
 * Подписи ссылок берём из одного места (`linkLabels`): одна и та же
 * страница упоминается в нескольких ответах, и пять её имён разъехались
 * бы при первой же правке.
 */
function buildFaq(t: Dict): FaqTopic[] {
  const h = t.legal.help;
  const p = h.topics;
  const l = h.linkLabels;

  const link = (href: string, label: string): FaqLink => ({ href, label });
  const series = link("/dramas", l.series);
  const artists = link("/artists", l.artists);
  const novels = link("/novels", l.novels);
  const events = link("/events", l.events);
  const calendar = link("/calendar", l.calendar);
  const locations = link("/locations", l.locations);
  const map = link("/locations/map", l.map);
  const places = link("/lists", l.places);
  const trips = link("/trips", l.trips);
  const communities = link("/communities", l.communities);
  const friends = link("/friends", l.friends);
  const notifications = link("/notifications", l.notifications);
  const profile = link("/account", l.profile);
  const settings = link("/account/settings", l.settings);
  const search = link("/search", l.search);
  const wiki = link("/wiki", l.wiki);
  // Отдельной страницы подписки нет: её описание с ценой, оплатой и
  // промокодом рисуется на месте закрытого раздела. Ведём туда же, куда
  // ведёт кнопка «Оформить подписку» в кабинете.
  const subscribe = link("/calendar", l.subscribe);

  return [
    {
      id: "start",
      title: p.start.title,
      items: [
        { id: "start-what", ...p.start.what, links: [events, series, artists] },
        { id: "start-account", ...p.start.account, links: [link("/signup", l.signup), link("/login", l.login)] },
        { id: "start-first", ...p.start.first, links: [settings] },
        { id: "start-find", ...p.start.find, links: [search] },
        { id: "start-wiki", ...p.start.wiki, links: [wiki] },
      ],
    },
    {
      id: "catalog",
      title: p.catalog.title,
      items: [
        { id: "catalog-mine", ...p.catalog.mine, links: [series] },
        { id: "catalog-status", ...p.catalog.status, links: [series] },
        { id: "catalog-episodes", ...p.catalog.episodes },
        { id: "catalog-rewatch", ...p.catalog.rewatch },
        { id: "catalog-bell", ...p.catalog.bell, links: [settings] },
        { id: "catalog-reviews", ...p.catalog.reviews },
        { id: "catalog-artists-list", ...p.catalog.artistsList, links: [artists] },
        { id: "catalog-artists", ...p.catalog.artists, links: [artists] },
        { id: "catalog-seen-live", ...p.catalog.seenLive, links: [artists] },
        { id: "catalog-novels", ...p.catalog.novels, links: [novels] },
        { id: "catalog-missing", ...p.catalog.missing, links: [link("/help#feedback", h.feedbackTitle)] },
      ],
    },
    {
      id: "events",
      title: p.events.title,
      items: [
        { id: "events-what", ...p.events.what, links: [events] },
        { id: "events-going", ...p.events.going, links: [events] },
        { id: "events-calendar", ...p.events.calendar, links: [calendar] },
        { id: "events-ics", ...p.events.ics, links: [settings] },
        { id: "events-presale", ...p.events.presale, links: [settings] },
        { id: "events-tickets", ...p.events.tickets },
        { id: "events-friends", ...p.events.friends, links: [friends] },
      ],
    },
    {
      id: "places",
      title: p.places.title,
      items: [
        { id: "places-locations", ...p.places.locations, links: [locations, map] },
        { id: "places-visited", ...p.places.visited, links: [locations] },
        { id: "places-own", ...p.places.own, links: [places] },
        { id: "places-lists", ...p.places.lists, links: [places, profile] },
      ],
    },
    {
      id: "trips",
      title: p.trips.title,
      items: [
        { id: "trips-what", ...p.trips.what, links: [trips] },
        { id: "trips-create", ...p.trips.create, links: [trips] },
        { id: "trips-shared", ...p.trips.shared, links: [friends] },
        { id: "trips-stay", ...p.trips.stay },
        { id: "trips-lists", ...p.trips.lists },
        { id: "trips-bookings", ...p.trips.bookings },
      ],
    },
    {
      id: "communities",
      title: p.communities.title,
      items: [
        { id: "communities-what", ...p.communities.what, links: [communities] },
        { id: "communities-create", ...p.communities.create, links: [communities, subscribe] },
        { id: "communities-join", ...p.communities.join, links: [communities] },
        { id: "communities-outside", ...p.communities.outside },
        { id: "communities-discussions", ...p.communities.discussions },
        { id: "communities-meetups", ...p.communities.meetups, links: [events] },
        { id: "communities-trips", ...p.communities.trips, links: [trips] },
        { id: "communities-places", ...p.communities.places },
        { id: "communities-roles", ...p.communities.roles },
        { id: "communities-ban", ...p.communities.ban },
        { id: "communities-achievements", ...p.communities.achievements, links: [profile] },
        {
          id: "communities-report",
          ...p.communities.report,
          links: [link("/help#feedback", h.feedbackTitle)],
        },
      ],
    },
    {
      id: "profile",
      title: p.profile.title,
      items: [
        { id: "profile-profile", ...p.profile.profile, links: [profile] },
        { id: "profile-stats", ...p.profile.stats, links: [profile] },
        { id: "profile-achievements", ...p.profile.achievements, links: [profile] },
        { id: "profile-friends", ...p.profile.friends, links: [friends] },
        { id: "profile-notifications", ...p.profile.notifications, links: [notifications] },
        { id: "profile-telegram", ...p.profile.telegram, links: [settings] },
      ],
    },
    {
      id: "premium",
      title: p.premium.title,
      items: [
        { id: "premium-gives", ...p.premium.gives, links: [subscribe] },
        { id: "premium-free", ...p.premium.free },
        { id: "premium-pay", ...p.premium.pay, links: [subscribe, link("/terms", l.terms)] },
        { id: "premium-expire", ...p.premium.expire, links: [settings] },
      ],
    },
    {
      id: "privacy",
      title: p.privacy.title,
      items: [
        { id: "privacy-profile", ...p.privacy.profile, links: [settings] },
        { id: "privacy-trip", ...p.privacy.trip, links: [trips] },
        { id: "privacy-review", ...p.privacy.review },
        { id: "privacy-data", ...p.privacy.data, links: [link("/privacy", l.privacyPolicy), settings] },
      ],
    },
    {
      id: "data",
      title: p.data.title,
      items: [
        { id: "data-mdl", ...p.data.mdl, links: [settings] },
        { id: "data-mdl-missing", ...p.data.mdlMissing, links: [notifications] },
        { id: "data-export", ...p.data.export, links: [settings] },
      ],
    },
  ];
}

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ fb?: string }>;
}) {
  // ?fb=<запрос> — переход из пустого поиска: подставляем контекст и
  // сразу выбираем «добавьте сериал/актёра».
  const { fb } = await searchParams;
  const { t } = await getT();
  const user = await getCurrentUser();
  const topics = buildFaq(t);
  const h = t.legal.help;

  return (
    <div>
      <FaqHashOpener />
      <PageHeader eyebrow={h.eyebrow} title={h.title} className="mb-4" />

      <div className="row g-4">
        <div className="col-12 col-lg-8 d-flex flex-column gap-4">
          <div className="surface p-4">
            <p className="text-secondary mb-3">{h.intro}</p>
            <h2 className="section-heading mb-2">{h.tocTitle}</h2>
            <nav className="faq-toc d-flex flex-wrap gap-2" aria-label={h.tocTitle}>
              {topics.map((topic) => (
                <a key={topic.id} href={`#topic-${topic.id}`} className="chip-link">
                  {topic.title}
                </a>
              ))}
            </nav>
          </div>

          {topics.map((topic) => (
            <section key={topic.id} id={`topic-${topic.id}`} className="surface p-4 faq-section">
              <h2 className="section-heading mb-2">{topic.title}</h2>
              {topic.items.map((item) => (
                <details key={item.id} id={item.id} className="faq-item">
                  <summary>
                    <span className="faq-caret" aria-hidden>
                      ▸
                    </span>
                    <span className="faq-question">{item.q}</span>
                    <a
                      href={`#${item.id}`}
                      className="faq-anchor"
                      aria-label={`${h.anchorLabel}: ${item.q}`}
                    >
                      #
                    </a>
                  </summary>
                  <div className="faq-answer">
                    <p className="mb-0">{item.a}</p>
                    {item.links && item.links.length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mt-3">
                        {item.links.map((linkItem) => (
                          <AppLink
                            key={linkItem.href}
                            href={linkItem.href}
                            className="chip-link faq-link"
                          >
                            {linkItem.label} →
                          </AppLink>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </section>
          ))}
        </div>

        <div className="col-12 col-lg-4">
          <div className="surface p-4 position-sticky" id="feedback" style={{ top: "6.5rem" }}>
            <h2 className="h6 fw-semibold mb-2">{h.feedbackTitle}</h2>
            <p className="text-secondary small mb-3">{h.feedbackHint}</p>
            <FeedbackForm
              defaultKind={fb ? "CONTENT_REQUEST" : "QUESTION"}
              context={fb ? h.searchContext(fb) : ""}
              defaultEmail={user?.email ?? ""}
              emailRequired={!user}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
