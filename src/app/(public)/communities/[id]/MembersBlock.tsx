"use client";

import { useState } from "react";
import AppLink from "@/components/AppLink";
import Modal from "@/components/Modal";
import { useLocale, useT } from "@/components/LocaleProvider";
import { userDisplayName, userHref } from "@/lib/userProfile";

export type CommunityMemberBrief = {
  userId: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  role: "OWNER" | "MODERATOR" | "MEMBER";
};

/** Два ряда по пять — ровно столько показывает сетка
 *  (.community-member-grid, пять колонок). Число живёт рядом с
 *  колонками намеренно: разъедутся они — сразу видно, что править. */
const VISIBLE = 10;

const ROLE_ORDER = { OWNER: 0, MODERATOR: 1, MEMBER: 2 } as const;

/**
 * Участники в левой колонке страницы сообщества (правка владельца
 * 2026-09-09) — той же манерой, что друзья в профиле: сетка круглых
 * аватарок с подсказкой-именем. Раньше «кто здесь» жило только во
 * вкладке, и со страницы сообщество выглядело безлюдным.
 *
 * Показываем не больше двух рядов: колонка узкая, и полусотней аватарок
 * блок вытеснил бы вниз всё остальное. Дальше — «Смотреть всех» и
 * модалка со списком: отдельной страницы участников нет, а вкладка
 * рядом остаётся как была (там же управление ролями и приглашения).
 *
 * В первые два ряда ставим создателя и модераторов: если видно не всех,
 * то полезнее видеть тех, к кому идут с вопросами, а не тех, кто
 * вступил раньше.
 *
 * Блок целиком рисует ТОЛЬКО страница и только внутри `canSeeInside` —
 * список людей это персональные данные, наружу он не уходит (то же
 * правило, что у вкладки «Участники»). Своей проверки прав здесь нет
 * намеренно: два условия на один вопрос однажды разойдутся.
 */
export default function MembersBlock({
  members,
  fullList,
}: {
  members: CommunityMemberBrief[];
  /** Что показать в окне «Смотреть всех». Приходит готовым узлом со
   *  страницы, потому что вместе со списком туда переехало управление —
   *  роли, бан и приглашения (правка владельца 2026-09-09: вкладку
   *  «Участники» убрали, и другого места у этих кнопок не осталось).
   *  Узлом, а не пропсами: решать, кому что показать, должна страница —
   *  только она знает, кто тут владелец. */
  fullList?: React.ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const s = t.communities;
  const [open, setOpen] = useState(false);

  if (members.length === 0) return null;

  const ordered = [...members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  const shown = ordered.slice(0, VISIBLE);

  // Кто есть кто в сетке аватарок иначе не разобрать (та же беда была у
  // друзей в профиле): показываем имя, а если ник отличается от него —
  // ник в скобках. Сравниваем именно с ПОКАЗАННЫМ именем: у кого имя не
  // заполнено, userDisplayName и так вернёт ник — иначе выходило бы
  // «vasya (@vasya)».
  const labelOf = (m: CommunityMemberBrief) => {
    const name = userDisplayName(m, locale);
    return m.username && m.username !== name ? `${name} (@${m.username})` : name;
  };
  const roleLabel = (m: CommunityMemberBrief) =>
    m.role === "OWNER" ? s.owner : m.role === "MODERATOR" ? s.moderator : null;

  return (
    <div className="profile-side-block">
      {/* mb-3: заголовок не липнет к сетке — как в блоке друзей. */}
      <h2 className="section-heading mb-3">
        {s.members}
        <span className="text-secondary ms-2" style={{ letterSpacing: 0 }}>
          {members.length}
        </span>
      </h2>

      <div className="community-member-grid">
        {shown.map((m) => {
          const label = labelOf(m);
          return (
            <AppLink
              key={m.userId}
              href={userHref({ id: m.userId, username: m.username })}
              // Подсказка — своя (data-tooltip), а не браузерный title:
              // по АА5 все подсказки на сайте одного вида, а title вдобавок
              // ждёт секунду и не показывается с клавиатуры. tooltip-wide —
              // длинному «Имя (@ник)» нужен перенос.
              className="profile-friend tooltip-wide"
              data-tooltip={label}
              // Ссылка состоит из одной картинки с пустым alt — без явной
              // подписи скринридер читает её как «ссылка» без адресата.
              aria-label={label}
            >
              {m.photoUrl ? (
                // alt пустой: имя уже в подсказке и aria-label, а сломанная
                // картинка с alt-текстом вылезала из круга.
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={m.photoUrl} alt="" />
              ) : (
                <span aria-hidden>{label.charAt(0).toUpperCase()}</span>
              )}
            </AppLink>
          );
        })}
      </div>

      {(members.length > shown.length || fullList) && (
        <button type="button" className="btn-link-accent mt-3" onClick={() => setOpen(true)}>
          {s.people.seeAll}
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={s.members}>
        {fullList ?? (
          <div className="d-flex flex-column gap-2">
            {ordered.map((m) => (
              <AppLink
                key={m.userId}
                href={userHref({ id: m.userId, username: m.username })}
                className="surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2 px-3"
              >
                {m.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async"
                    src={m.photoUrl}
                    alt=""
                    className="rounded-circle flex-shrink-0"
                    style={{ width: "2rem", height: "2rem", objectFit: "cover" }}
                  />
                ) : (
                  <span
                    className="rounded-circle flex-shrink-0 d-inline-block"
                    style={{ width: "2rem", height: "2rem", background: "var(--bs-secondary-bg)" }}
                    aria-hidden
                  />
                )}
                <span className="text-white flex-fill">{labelOf(m)}</span>
                {roleLabel(m) && <span className="small text-secondary">{roleLabel(m)}</span>}
              </AppLink>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
