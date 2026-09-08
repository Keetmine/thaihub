import AppLink from "@/components/AppLink";
import { UsersIcon } from "@/components/icons";
import { getT } from "@/lib/i18n";
import { userDisplayName, userHref } from "@/lib/userProfile";

export type SiteGoer = {
  id: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
};

/** Десять — как два ряда у участников сообщества (MembersBlock): ряд
 *  должен показать «тут есть люди», а не превратиться в стену аватарок
 *  во всю страницу. Дальше — кружок «+N». */
const VISIBLE = 10;

/**
 * «Идут с сайта» (аудит 2026-09, п.7) — кто из людей сайта отметил «иду»
 * на это событие: ряд круглых аватарок-ссылок на профили с
 * подсказкой-именем, той же манерой, что участники сообщества
 * (MembersBlock) и друзья в профиле.
 *
 * Это витрина «тут есть люди», поэтому блок виден и гостю — в отличие от
 * соседних «Друзья идут» и «Из вашего сообщества идут», которые про
 * СВОИХ и без логина не существуют. На встрече сообщества гостя не
 * бывает: страница закрыта посторонним целиком (canSeeMeetup).
 *
 * Кто попадает в ряд, решает страница (см. page.tsx): закрывшие профиль
 * (hideProfileActivity) не показываются — то же правило, что в профиле и
 * в «Из вашего сообщества идут», — но сам зритель видит себя всегда, как
 * и в своём профиле. Пустой список — блока нет вовсе.
 */
export default async function SiteGoersBlock({ goers }: { goers: SiteGoer[] }) {
  const { locale, t } = await getT();
  if (goers.length === 0) return null;

  const shown = goers.slice(0, VISIBLE);
  const rest = goers.length - shown.length;

  return (
    <div className="surface p-4 mb-3">
      <h2 className="section-heading mb-3 d-flex align-items-center gap-2">
        <UsersIcon /> {t.events.detail.siteGoing}
        {/* Счётчик — как у участников сообщества: при «+N» именно он
            отвечает, сколько людей всего. letterSpacing: 0 — цифра не
            наследует разрядку заголовка. */}
        <span className="text-secondary" style={{ letterSpacing: 0 }}>
          {goers.length}
        </span>
      </h2>
      <div className="d-flex flex-wrap align-items-center gap-2">
        {shown.map((g) => {
          const label = userDisplayName(g, locale);
          return (
            <AppLink
              key={g.id}
              href={userHref(g)}
              // .profile-friend — те же кружки, что у друзей в профиле и
              // участников сообщества; размер задаём сами, потому что
              // там его диктует сетка, а здесь ряд.
              className="profile-friend tooltip-wide flex-shrink-0"
              style={{ width: "2rem", height: "2rem" }}
              // Подсказка своя (data-tooltip), не браузерный title — по
              // АА5 все подсказки одного вида; aria-label — потому что
              // внутри ссылки только картинка с пустым alt.
              data-tooltip={label}
              aria-label={label}
            >
              {g.photoUrl ? (
                // alt пустой: имя уже в подсказке и aria-label, а
                // сломанная картинка с alt-текстом вылезала бы из круга.
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={g.photoUrl} alt="" />
              ) : (
                <span aria-hidden>{label.charAt(0).toUpperCase()}</span>
              )}
            </AppLink>
          );
        })}
        {rest > 0 && (
          <span
            className="rounded-circle d-inline-flex align-items-center justify-content-center small text-secondary flex-shrink-0"
            style={{
              width: "2rem",
              height: "2rem",
              background: "var(--bs-secondary-bg)",
              border: "1px solid var(--bs-border-color)",
            }}
            data-tooltip={t.events.detail.siteGoingMore(rest)}
          >
            +{rest}
          </span>
        )}
      </div>
    </div>
  );
}
