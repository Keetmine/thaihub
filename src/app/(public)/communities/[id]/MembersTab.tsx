import AppLink from "@/components/AppLink";
import { getT } from "@/lib/i18n";

export type CommunityMemberRow = {
  userId: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  role: "OWNER" | "MODERATOR" | "MEMBER";
};

/**
 * Вкладка «Участники». Рендерится только тем, кто внутри сообщества:
 * список людей — это персональные данные, наружу он не уходит (см.
 * `communityAccess`).
 *
 * Управление ролями и бан живут отдельными кнопками у строки —
 * их добавляет владелец/модератор.
 */
export default async function MembersTab({
  members,
  actions,
}: {
  members: CommunityMemberRow[];
  /** Кнопки управления у строки участника (роль, бан) — только у тех,
   *  кто вправе их видеть; страница решает это сама. */
  actions?: (member: CommunityMemberRow) => React.ReactNode;
}) {
  const { t } = await getT();
  const s = t.communities;

  return (
    <div className="d-flex flex-column gap-2">
      {members.map((m) => (
        <div
          key={m.userId}
          className="surface d-flex flex-wrap align-items-center gap-2 p-2 px-3"
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
          <AppLink
            href={`/users/${m.username ?? m.userId}`}
            className="text-decoration-none text-white flex-fill"
          >
            {m.name ?? t.common.deletedAccount}
          </AppLink>
          {m.role !== "MEMBER" && (
            <span className="small text-secondary">
              {m.role === "OWNER" ? s.owner : s.moderator}
            </span>
          )}
          {actions?.(m)}
        </div>
      ))}
    </div>
  );
}
