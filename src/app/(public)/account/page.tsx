import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { logout } from "../login/actions";
import FavoriteButton from "@/components/FavoriteButton";
import { formatHumanDate, formatTime } from "@/lib/dates";
import { PinIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [attendances, favoritePerformers, favoriteDramas, favoriteEvents] =
    await Promise.all([
      prisma.eventAttendance.findMany({
        where: { userId: user.id },
        include: { event: true },
        orderBy: { event: { startsAt: "asc" } },
      }),
      prisma.favoritePerformer.findMany({
        where: { userId: user.id },
        include: { performer: true },
      }),
      prisma.favoriteDrama.findMany({
        where: { userId: user.id },
        include: { drama: true },
      }),
      prisma.favoriteEvent.findMany({
        where: { userId: user.id },
        include: { event: true },
        orderBy: { event: { startsAt: "asc" } },
      }),
    ]);

  const now = new Date();
  const upcomingAttendances = attendances.filter((a) => a.event.startsAt >= now);
  const pastAttendances = attendances.filter((a) => a.event.startsAt < now);

  const EventRow = ({ event }: { event: (typeof attendances)[number]["event"] }) => (
    <Link
      href={`/event/${event.id}`}
      className="surface surface-hover text-decoration-none d-flex align-items-baseline justify-content-between gap-3 p-3"
    >
      <div>
        <p className="font-display fw-medium text-white mb-0">{event.title}</p>
        <p className="small text-secondary mb-0">
          <PinIcon /> {event.venue}
        </p>
      </div>
      <span className="small text-secondary text-end flex-shrink-0">
        {formatHumanDate(event.startsAt)}
        <br />
        {formatTime(event.startsAt)}
      </span>
    </Link>
  );

  return (
    <div>
      <div className="surface p-4 mb-4" style={{ maxWidth: "40rem" }}>
        <h1 className="h4 mb-1">{user.name || user.email}</h1>
        <p className="text-secondary small mb-4">{user.email}</p>
        <form action={logout}>
          <button type="submit" className="btn btn-outline-secondary btn-sm">
            Выйти
          </button>
        </form>
      </div>

      <h2
        className="small text-secondary text-uppercase mb-2"
        style={{ letterSpacing: "0.08em" }}
      >
        Мои события — предстоящие
      </h2>
      {upcomingAttendances.length === 0 ? (
        <p className="small text-secondary mb-4">Нет предстоящих событий.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-4">
          {upcomingAttendances.map((a) => (
            <EventRow key={a.eventId} event={a.event} />
          ))}
        </div>
      )}

      {pastAttendances.length > 0 && (
        <>
          <h2
            className="small text-secondary text-uppercase mb-2"
            style={{ letterSpacing: "0.08em" }}
          >
            Мои события — прошедшие
          </h2>
          <div className="d-flex flex-column gap-2 opacity-50 mb-4">
            {pastAttendances.map((a) => (
              <EventRow key={a.eventId} event={a.event} />
            ))}
          </div>
        </>
      )}

      <h2
        className="small text-secondary text-uppercase mb-2 mt-4"
        style={{ letterSpacing: "0.08em" }}
      >
        Избранные исполнители
      </h2>
      {favoritePerformers.length === 0 ? (
        <p className="small text-secondary mb-4">Нет избранных исполнителей.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-4">
          {favoritePerformers.map((f) => (
            <div
              key={f.performerId}
              className="surface d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <Link
                href={`/performers/${f.performer.id}`}
                className="text-decoration-none font-display fw-medium text-white"
              >
                {f.performer.name}
              </Link>
              <FavoriteButton kind="performer" id={f.performer.id} isFavorited={true} />
            </div>
          ))}
        </div>
      )}

      <h2
        className="small text-secondary text-uppercase mb-2"
        style={{ letterSpacing: "0.08em" }}
      >
        Избранные сериалы
      </h2>
      {favoriteDramas.length === 0 ? (
        <p className="small text-secondary mb-4">Нет избранных сериалов.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-4">
          {favoriteDramas.map((f) => (
            <div
              key={f.dramaId}
              className="surface d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <Link
                href={`/dramas/${f.drama.id}`}
                className="text-decoration-none font-display fw-medium text-white"
              >
                {f.drama.title}
              </Link>
              <FavoriteButton kind="drama" id={f.drama.id} isFavorited={true} />
            </div>
          ))}
        </div>
      )}

      <h2
        className="small text-secondary text-uppercase mb-2"
        style={{ letterSpacing: "0.08em" }}
      >
        Избранные события
      </h2>
      {favoriteEvents.length === 0 ? (
        <p className="small text-secondary mb-4">Нет избранных событий.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-4">
          {favoriteEvents.map((f) => (
            <div
              key={f.eventId}
              className="surface d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <Link
                href={`/event/${f.event.id}`}
                className="text-decoration-none"
              >
                <p className="font-display fw-medium text-white mb-0">{f.event.title}</p>
                <p className="small text-secondary mb-0">
                  {formatHumanDate(f.event.startsAt)} · {formatTime(f.event.startsAt)}
                </p>
              </Link>
              <FavoriteButton kind="event" id={f.event.id} isFavorited={true} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
