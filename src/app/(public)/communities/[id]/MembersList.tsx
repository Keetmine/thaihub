import AppLink from "@/components/AppLink";
import { getT } from "@/lib/i18n";

export type CommunityMemberRow = {
  userId: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  role: "OWNER" | "MODERATOR" | "MEMBER";
};

/** Строка человека: аватар, имя, ссылка на профиль и место под кнопки.
 *  Одна на все три списка вкладки — участники, приглашённые и убранные
 *  выглядят одинаково, различаются только тем, что справа. */
function PersonRow({
  person,
  roleLabel,
  fallbackName,
  actions,
}: {
  person: { userId: string; name: string | null; username: string | null; photoUrl: string | null };
  roleLabel?: string | null;
  fallbackName: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="surface d-flex flex-wrap align-items-center gap-2 p-2 px-3">
      {person.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          loading="lazy"
          decoding="async"
          src={person.photoUrl}
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
      <AppLink
        href={`/users/${person.username ?? person.userId}`}
        className="text-decoration-none text-white flex-fill"
      >
        {person.name ?? fallbackName}
      </AppLink>
      {roleLabel && <span className="small text-secondary">{roleLabel}</span>}
      {actions}
    </div>
  );
}

/**
 * Вкладка «Участники». Рендерится только тем, кто внутри сообщества:
 * список людей — это персональные данные, наружу он не уходит (см.
 * `communityAccess`).
 *
 * Три списка на одной вкладке, и это намеренно: участники, позванные и
 * убранные — ответы на один вопрос «кто здесь», просто в разных
 * состояниях. Разносить их по вкладкам значило бы прятать от владельца
 * половину картины.
 *
 * Кнопки (роль, бан, отзыв приглашения) приходят готовыми из страницы:
 * она одна знает, кто их вправе видеть, а сами права всё равно
 * проверяются в экшенах — интерфейс тут ничего не решает.
 */
export default async function MembersTab({
  members,
  actions,
  inviteButton,
  invites,
  inviteActions,
  banned,
  bannedActions,
}: {
  members: CommunityMemberRow[];
  /** Кнопки управления у строки участника (роль, бан) — только у тех,
   *  кто вправе их видеть; страница решает это сама. */
  actions?: (member: CommunityMemberRow) => React.ReactNode;
  /** «Пригласить» — кнопка над списком, у владельца и модераторов. */
  inviteButton?: React.ReactNode;
  /** Позванные, но ещё не ответившие. Видны только управляющим: это
   *  ещё не участники, и обычному участнику знать о них нечего. */
  invites?: { userId: string; name: string | null; username: string | null; photoUrl: string | null }[];
  inviteActions?: (userId: string) => React.ReactNode;
  /** Убранные из сообщества (статус BANNED). Их строки остались в базе,
   *  чтобы человек не вступил заново, — и показываем мы их только тем,
   *  кто может запрет снять. */
  banned?: CommunityMemberRow[];
  bannedActions?: (member: CommunityMemberRow) => React.ReactNode;
}) {
  const { t } = await getT();
  const s = t.communities;
  const fallbackName = t.common.deletedAccount;

  return (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-column gap-2">
        {inviteButton && <div className="d-flex justify-content-end">{inviteButton}</div>}
        {members.map((m) => (
          <PersonRow
            key={m.userId}
            person={m}
            fallbackName={fallbackName}
            roleLabel={m.role === "OWNER" ? s.owner : m.role === "MODERATOR" ? s.moderator : null}
            actions={actions?.(m)}
          />
        ))}
      </div>

      {invites && invites.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">{s.people.invited}</h2>
          <div className="d-flex flex-column gap-2">
            {invites.map((i) => (
              <PersonRow
                key={i.userId}
                person={i}
                fallbackName={fallbackName}
                actions={inviteActions?.(i.userId)}
              />
            ))}
          </div>
        </section>
      )}

      {banned && banned.length > 0 && (
        <section>
          <h2 className="section-heading mb-1">{s.people.bannedTitle}</h2>
          {/* Объяснение, почему убранные вообще видны: строка осталась
              не по недосмотру, она и есть запрет. */}
          <p className="small text-secondary mb-2">{s.people.bannedHint}</p>
          <div className="d-flex flex-column gap-2">
            {banned.map((m) => (
              <PersonRow
                key={m.userId}
                person={m}
                fallbackName={fallbackName}
                actions={bannedActions?.(m)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
