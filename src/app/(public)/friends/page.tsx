import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/userAuth";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import FriendActionButton from "@/components/FriendActionButton";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import { sendFriendRequest, acceptFriendRequest, removeFriendship } from "./actions";

export const dynamic = "force-dynamic";

function UserRow({
  name,
  email,
  photoUrl,
  action,
}: {
  name: string | null;
  email: string;
  photoUrl: string | null;
  action: React.ReactNode;
}) {
  return (
    <div className="surface d-flex align-items-center justify-content-between gap-3 p-3">
      <div className="d-flex align-items-center gap-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "50%",
              background: "var(--bs-secondary-bg)",
            }}
          />
        )}
        <div>
          <p className="font-display fw-medium text-white mb-0">{name || email}</p>
          {name && <p className="small text-secondary mb-0">{email}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: { requester: true, addressee: true },
    orderBy: { createdAt: "desc" },
  });

  const other = (f: (typeof friendships)[number]) =>
    f.requesterId === user.id ? f.addressee : f.requester;

  const accepted = friendships.filter((f) => f.status === "ACCEPTED");
  const incoming = friendships.filter((f) => f.status === "PENDING" && f.addresseeId === user.id);
  const outgoing = friendships.filter((f) => f.status === "PENDING" && f.requesterId === user.id);

  const excludedIds = new Set([user.id, ...friendships.map((f) => other(f).id)]);
  const searchResults = q
    ? await prisma.user.findMany({
        where: {
          id: { notIn: Array.from(excludedIds) },
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 20,
      })
    : [];

  return (
    <div>
      <span className="eyebrow">Профиль</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Друзья
      </h1>

      <NameSearchBox
        action="/friends"
        q={q}
        placeholder="Найти по имени или email…"
      />

      {q && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Результаты поиска
          </h2>
          {searchResults.length === 0 ? (
            <p className="small text-secondary mb-4">Никого не найдено.</p>
          ) : (
            <div className="d-flex flex-column gap-2 mb-4">
              {searchResults.map((u) => (
                <UserRow
                  key={u.id}
                  name={u.name}
                  email={u.email}
                  photoUrl={u.photoUrl}
                  action={
                    <FriendActionButton
                      action={sendFriendRequest}
                      id={u.id}
                      label="Добавить в друзья"
                      pendingLabel="Отправка…"
                    />
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {incoming.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Заявки в друзья
          </h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {incoming.map((f) => (
              <UserRow
                key={f.id}
                name={other(f).name}
                email={other(f).email}
                photoUrl={other(f).photoUrl}
                action={
                  <div className="d-flex align-items-center gap-2">
                    <FriendActionButton
                      action={acceptFriendRequest}
                      id={f.id}
                      label="Принять"
                      pendingLabel="…"
                    />
                    <ConfirmForm
                      action={() => removeFriendship(f.id)}
                      confirmMessage="Отклонить заявку в друзья?"
                    >
                      <button type="submit" className="icon-btn icon-btn-danger" aria-label="Отклонить">
                        <TrashIcon />
                      </button>
                    </ConfirmForm>
                  </div>
                }
              />
            ))}
          </div>
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
            Отправленные заявки
          </h2>
          <div className="d-flex flex-column gap-2 mb-4">
            {outgoing.map((f) => (
              <UserRow
                key={f.id}
                name={other(f).name}
                email={other(f).email}
                photoUrl={other(f).photoUrl}
                action={
                  <ConfirmForm
                    action={() => removeFriendship(f.id)}
                    confirmMessage="Отменить заявку в друзья?"
                  >
                    <button type="submit" className="btn btn-outline-secondary btn-sm">
                      Отменить
                    </button>
                  </ConfirmForm>
                }
              />
            ))}
          </div>
        </>
      )}

      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        Мои друзья
      </h2>
      {accepted.length === 0 ? (
        <p className="small text-secondary">Пока нет друзей.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {accepted.map((f) => (
            <UserRow
              key={f.id}
              name={other(f).name}
              email={other(f).email}
              photoUrl={other(f).photoUrl}
              action={
                <ConfirmForm
                  action={() => removeFriendship(f.id)}
                  confirmMessage={`Удалить «${other(f).name || other(f).email}» из друзей?`}
                >
                  <button type="submit" className="icon-btn icon-btn-danger" aria-label="Удалить из друзей">
                    <TrashIcon />
                  </button>
                </ConfirmForm>
              }
            />
          ))}
        </div>
      )}

      <p className="small text-secondary mt-4">
        <Link href="/account" className="link-body-emphasis">
          ← Назад к профилю
        </Link>
      </p>
    </div>
  );
}
