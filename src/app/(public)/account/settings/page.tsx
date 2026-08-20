import { TIMEZONES } from "@/lib/timezones";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import FileDropzone from "@/components/FileDropzone";
import {
  updateProfile,
  updatePrivacy,
  getOrCreateIcsToken,
  unlinkTelegram,
  updateNotificationPrefs,
} from "../actions";
import { restartTour } from "../tourActions";
import ChangePasswordForm from "./ChangePasswordForm";
import IcsFeedSection from "./IcsFeedSection";
import SettingsTabs from "./SettingsTabs";
import { pageMetadata } from "@/lib/seo";
import TelegramLoginButton from "@/components/TelegramLoginButton";
import { telegramBotUsername } from "@/lib/telegram";
import { COUNTRIES } from "@/lib/countries";
import { dateKey } from "@/lib/dates";
import DatePickerInput from "@/components/DatePickerInput";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyTelegramAuth } from "@/lib/telegram";
import { TELEGRAM_RELINK_COOKIE } from "@/lib/telegramRelink";
import TelegramRelinkDialog, { type RelinkInfo } from "./TelegramRelinkDialog";

export const metadata = pageMetadata({
  title: "Настройки",
  description: "Настройки аккаунта и приватности.",
  path: "/account/settings",
  noIndex: true,
});


export const dynamic = "force-dynamic";

const TELEGRAM_NOTIFY_TOGGLES = [
  { name: "tgNotifyInvites" as const, label: "Приглашения в поездки и подписка" },
  { name: "tgNotifyFriends" as const, label: "Заявки в друзья" },
  { name: "tgNotifyReplies" as const, label: "Ответы на мои комментарии" },
  { name: "tgNotifyEvents" as const, label: "Друзья идут на события" },
];

const PRIVACY_TOGGLES = [
  {
    name: "hideProfileActivity",
    label: "Скрыть всю активность",
    hint: "Не-друзья увидят только имя и фото.",
  },
  { name: "hideAchievements", label: "Скрыть ачивки", hint: null },
  {
    name: "hideFavoritePerformers",
    label: "Скрыть фан-профиль (любимых актёров)",
    hint: null,
  },
  { name: "hideVisitedPlaces", label: "Скрыть посещённые места", hint: null },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ telegram?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const icsToken = await getOrCreateIcsToken();
  const { telegram: telegramStatus } = await searchParams;
  const botUsername = telegramBotUsername();

  // Telegram привязан к другому аккаунту и ждёт подтверждения переноса.
  // Куку ставит /api/auth/telegram/link; данные для попапа собираем
  // здесь, чтобы клиенту не уезжал подписанный payload.
  let relinkInfo: RelinkInfo | null = null;
  const relinkRaw = (await cookies()).get(TELEGRAM_RELINK_COOKIE)?.value;
  if (relinkRaw) {
    const payload = verifyTelegramAuth(new URLSearchParams(relinkRaw));
    const other = payload
      ? await prisma.user.findUnique({
          where: { telegramId: payload.id },
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                favoriteEvents: true,
                favoritePerformers: true,
                trips: true,
                eventAttendances: true,
              },
            },
          },
        })
      : null;
    if (payload && other && other.id !== user.id) {
      relinkInfo = {
        telegramUsername: payload.username,
        otherName: other.name,
        losses: [
          { n: other._count.favoritePerformers, label: "любимых артистов" },
          { n: other._count.favoriteEvents, label: "событий в избранном" },
          { n: other._count.eventAttendances, label: "отметок «иду»" },
          { n: other._count.trips, label: "поездок" },
        ]
          .filter((c) => c.n > 0)
          .map((c) => `${c.n} ${c.label}`),
      };
    }
  }

  return (
    <div>
      {relinkInfo && <TelegramRelinkDialog info={relinkInfo} />}
      <Link href="/account" className="eyebrow text-decoration-none">
        ← Профиль
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Настройки
      </h1>

      <SettingsTabs
        profile={
          <div className="surface p-4">
            <form action={updateProfile} className="row g-3">
              <div className="col-12 col-md-6 d-flex flex-column gap-3">
                <div>
                  <label className="form-label">Ник</label>
                  {/* Он же адрес профиля — ссылкой делятся с друзьями. */}
                  <div className="input-group">
                    <span className="input-group-text small text-secondary">/users/</span>
                    <input
                      name="username"
                      defaultValue={user.username ?? ""}
                      className="form-control"
                    />
                  </div>
                  <p className="small text-secondary mb-0 mt-1">
                    Латиница, цифры, точка, дефис или подчёркивание. Занятый ник
                    не сохранится — прежний останется.
                  </p>
                </div>
                <div>
                  <label className="form-label">Имя</label>
                  <input name="name" defaultValue={user.name ?? ""} className="form-control" />
                </div>
                <div>
                  <label className="form-label">Таймзона</label>
                  <select name="timezone" defaultValue={user.timezone} className="form-select">
                    {TIMEZONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className="small text-secondary mb-0 mt-1">
                    Время событий показывается тайское, а в скобках — в этой
                    зоне.
                  </p>
                </div>
                <div>
                  <label className="form-label">Страна</label>
                  <select name="country" defaultValue={user.country ?? ""} className="form-select">
                    <option value="">не указана</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="small text-secondary mb-0">
                  Имя видно друзьям и в публичном профиле.
                </p>
              </div>
              <div className="col-12 col-md-6 d-flex flex-column gap-3">
                <FileDropzone name="photoUrl" label="Фото" defaultValue={user.photoUrl ?? ""} />
                <div className="row g-3">
                  <div className="col-6">
                    <label className="form-label">Пол</label>
                    <select name="gender" defaultValue={user.gender ?? ""} className="form-select">
                      <option value="">не указан</option>
                      <option value="female">женский</option>
                      <option value="male">мужской</option>
                      <option value="other">другой</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Дата рождения</label>
                    <DatePickerInput
                      name="birthDate"
                      defaultValue={user.birthDate ? dateKey(user.birthDate) : ""}
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">О себе</label>
                  <textarea
                    name="bio"
                    rows={3}
                    defaultValue={user.bio ?? ""}
                    placeholder="Любимые пейринги, на скольких концертах были"
                    className="form-control"
                  />
                </div>
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-primary btn-sm">
                  Сохранить
                </button>
              </div>
            </form>

            {/* Тур по интерфейсу — пройти заново. Полезно и когда
                появляются новые разделы. */}
            <div className="border-top pt-3 mt-4" style={{ borderColor: "var(--bs-border-color)" }}>
              <p className="fw-medium text-white mb-1">Тур по сайту</p>
              <p className="small text-secondary mb-2">
                Короткая проводка по разделам — где афиша, поездки и уведомления.
              </p>
              <form action={restartTour}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  {user.tourCompletedAt ? "Пройти заново" : "Начать тур"}
                </button>
              </form>
            </div>

            {/* Привязка Telegram: без неё уведомления слать некуда, а
                telegramId раньше появлялся только у тех, кто входил
                через Telegram или платил в боте. */}
            {botUsername && (
              <div className="border-top pt-3 mt-4" style={{ borderColor: "var(--bs-border-color)" }}>
                <p className="fw-medium text-white mb-1">Telegram</p>
                {telegramStatus === "linked" && (
                  <p className="small text-success mb-2">Telegram подключён.</p>
                )}
                {telegramStatus === "taken" && (
                  <p className="small text-danger mb-2">
                    Этот Telegram уже привязан к другому аккаунту.
                  </p>
                )}
                {telegramStatus === "only-login" && (
                  <p className="small text-danger mb-2">
                    Это ваш единственный способ входа — сначала задайте пароль
                    во вкладке «Безопасность».
                  </p>
                )}
                {user.telegramId ? (
                  <>
                  <div className="d-flex flex-wrap align-items-center gap-3">
                    <span className="small text-secondary">
                      Подключён{user.telegramUsername ? ` — @${user.telegramUsername}` : ""}.
                      Присылаем напоминания о событиях и новости друзей.
                    </span>
                    <form action={unlinkTelegram}>
                      <button type="submit" className="btn btn-ghost btn-sm">
                        Отвязать
                      </button>
                    </form>
                  </div>

                  {/* Что слать в бота. На сайте уведомления приходят
                      всегда — настройка только про Telegram. */}
                  <form action={updateNotificationPrefs} className="mt-3">
                    <p className="small text-secondary mb-2">Присылать в Telegram:</p>
                    <div className="d-flex flex-column gap-1">
                      {TELEGRAM_NOTIFY_TOGGLES.map((t) => (
                        <div className="form-check" key={t.name}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id={t.name}
                            name={t.name}
                            defaultChecked={Boolean(user[t.name])}
                          />
                          <label className="form-check-label small" htmlFor={t.name}>
                            {t.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <button type="submit" className="btn btn-ghost btn-sm mt-2">
                      Сохранить
                    </button>
                  </form>
                  </>
                ) : (
                  <>
                    <p className="small text-secondary mb-2">
                      Подключите, чтобы получать напоминания о событиях, старте
                      продаж билетов и новостях друзей.
                    </p>
                    <TelegramLoginButton botUsername={botUsername} mode="link" />
                  </>
                )}
              </div>
            )}
          </div>
        }
        privacy={
          <div className="surface p-4">
            <p className="small text-secondary mb-3">
              Друзья видят всё всегда; настройки ниже — для остальных.
            </p>
            <form action={updatePrivacy} className="d-flex flex-column gap-2">
              {PRIVACY_TOGGLES.map((t) => (
                <div className="form-check" key={t.name}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={t.name}
                    name={t.name}
                    defaultChecked={Boolean(user[t.name])}
                  />
                  <label className="form-check-label small" htmlFor={t.name}>
                    {t.label}
                    {t.hint && <span className="text-secondary d-block">{t.hint}</span>}
                  </label>
                </div>
              ))}
              <div className="mt-2">
                <button type="submit" className="btn btn-primary btn-sm">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        }
        security={
          <div className="surface p-4">
            <ChangePasswordForm />
          </div>
        }
        calendar={
          <div className="surface p-4">
            <IcsFeedSection token={icsToken} />
          </div>
        }
      />
    </div>
  );
}
