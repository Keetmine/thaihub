import { TIMEZONES } from "@/lib/timezones";
import AppLink from "@/components/AppLink";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import FileDropzone from "@/components/FileDropzone";
import {
  updateProfile,
  updatePrivacy,
  getOrCreateIcsToken,
  unlinkTelegram,
  updateNotificationPrefs,
  deleteOwnAccount,
} from "../actions";
import { restartTour } from "../tourActions";
import ChangePasswordForm from "./ChangePasswordForm";
import IcsFeedSection from "./IcsFeedSection";
import SettingsTabs from "./SettingsTabs";
import { pageMetadata } from "@/lib/seo";
import TelegramLinkButton from "./TelegramLinkButton";
import { telegramBotUsername } from "@/lib/telegram";
import { countryOptions } from "@/lib/countries";
import { dateKey } from "@/lib/dates";
import DatePickerInput from "@/components/DatePickerInput";
import ConfirmForm from "@/components/ConfirmForm";
import { getT, localeHref, type Dict } from "@/lib/i18n";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.account.settings.metaTitle,
    description: t.account.settings.metaDescription,
    path: "/account/settings",
    noIndex: true,
    locale,
  });
}


export const dynamic = "force-dynamic";

// Подписи переключателей приходят из словаря, поэтому списки собираются
// функцией: сами наборы полей от языка не зависят.
const telegramNotifyToggles = (s: Dict["account"]["settings"]) => [
  { name: "tgNotifyInvites" as const, label: s.telegramNotifyInvites },
  { name: "tgNotifyFriends" as const, label: s.telegramNotifyFriends },
  { name: "tgNotifyReplies" as const, label: s.telegramNotifyReplies },
  { name: "tgNotifyEvents" as const, label: s.telegramNotifyEvents },
  { name: "tgNotifyBroadcast" as const, label: s.telegramNotifyBroadcast },
];

const privacyToggles = (s: Dict["account"]["settings"]) =>
  [
    {
      name: "hideProfileActivity",
      label: s.privacyHideActivity,
      hint: s.privacyHideActivityHint,
    },
    { name: "hideAchievements", label: s.privacyHideAchievements, hint: null },
    {
      name: "hideFavoritePerformers",
      label: s.privacyHideFavorites,
      hint: null,
    },
    { name: "hideVisitedPlaces", label: s.privacyHideVisited, hint: null },
  ] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ telegram?: string }>;
}) {
  const { locale, t } = await getT();
  const s = t.account.settings;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  const icsToken = await getOrCreateIcsToken();
  const { telegram: telegramStatus } = await searchParams;
  const botUsername = telegramBotUsername();

  return (
    <div>
      <AppLink href="/account" className="eyebrow text-decoration-none">
        {s.back}
      </AppLink>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        {s.title}
      </h1>

      <SettingsTabs
        profile={
          <div className="surface p-4">
            <form action={updateProfile} className="row g-3">
              <div className="col-12 col-md-6 d-flex flex-column gap-3">
                <div>
                  <label className="form-label">{s.username}</label>
                  {/* Он же адрес профиля — ссылкой делятся с друзьями. */}
                  <div className="input-group">
                    <span className="input-group-text small text-secondary">/users/</span>
                    <input
                      name="username"
                      defaultValue={user.username ?? ""}
                      className="form-control"
                    />
                  </div>
                  <p className="small text-secondary mb-0 mt-1">{s.usernameHint}</p>
                </div>
                <div>
                  <label className="form-label">{s.name}</label>
                  <input name="name" defaultValue={user.name ?? ""} className="form-control" />
                </div>
                <div>
                  <label className="form-label">{s.timezone}</label>
                  <select name="timezone" defaultValue={user.timezone} className="form-select">
                    {TIMEZONES.map((zone) => (
                      <option key={zone.value} value={zone.value}>
                        {zone.label[locale]}
                      </option>
                    ))}
                  </select>
                  <p className="small text-secondary mb-0 mt-1">{s.timezoneHint}</p>
                </div>
                <div>
                  <label className="form-label">{s.country}</label>
                  <select name="country" defaultValue={user.country ?? ""} className="form-select">
                    <option value="">{s.countryEmpty}</option>
                    {countryOptions(locale).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="small text-secondary mb-0">{s.nameVisible}</p>
              </div>
              <div className="col-12 col-md-6 d-flex flex-column gap-3">
                <FileDropzone name="photoUrl" label={s.photo} defaultValue={user.photoUrl ?? ""} />
                <div className="row g-3">
                  <div className="col-6">
                    <label className="form-label">{s.gender}</label>
                    <select name="gender" defaultValue={user.gender ?? ""} className="form-select">
                      <option value="">{s.genderEmpty}</option>
                      <option value="female">{s.genderFemale}</option>
                      <option value="male">{s.genderMale}</option>
                      <option value="other">{s.genderOther}</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">{s.birthDate}</label>
                    <DatePickerInput
                      name="birthDate"
                      defaultValue={user.birthDate ? dateKey(user.birthDate) : ""}
                      yearsBack={100}
                      yearsForward={0}
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">{s.bio}</label>
                  <textarea
                    name="bio"
                    rows={3}
                    defaultValue={user.bio ?? ""}
                    placeholder={s.bioPlaceholder}
                    className="form-control"
                  />
                </div>
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-primary btn-sm">
                  {s.save}
                </button>
              </div>
            </form>

            {/* Тур по интерфейсу — пройти заново. Полезно и когда
                появляются новые разделы. */}
            <div className="border-top pt-3 mt-4" style={{ borderColor: "var(--bs-border-color)" }}>
              <p className="fw-medium text-white mb-1">{s.tourTitle}</p>
              <p className="small text-secondary mb-2">{s.tourHint}</p>
              <form action={restartTour}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  {user.tourCompletedAt ? s.tourRestart : s.tourStart}
                </button>
              </form>
            </div>

            {/* Привязка Telegram: без неё уведомления слать некуда, а
                telegramId раньше появлялся только у тех, кто входил
                через Telegram или платил в боте. */}
            {botUsername && (
              <div className="border-top pt-3 mt-4" style={{ borderColor: "var(--bs-border-color)" }}>
                <p className="fw-medium text-white mb-1">{s.telegram}</p>
                {telegramStatus === "linked" && (
                  <p className="small text-success mb-2">{s.telegramLinked}</p>
                )}
                {telegramStatus === "taken" && (
                  <p className="small text-danger mb-2">{s.telegramTaken}</p>
                )}
                {telegramStatus === "only-login" && (
                  <p className="small text-danger mb-2">{s.telegramOnlyLogin}</p>
                )}
                {user.telegramId ? (
                  <>
                  <div className="d-flex flex-wrap align-items-center gap-3">
                    <span className="small text-secondary">
                      {s.telegramConnected(user.telegramUsername ?? "")}
                    </span>
                    {/* С подтверждением: отвязка обрывает напоминания и
                        уведомления, а кнопка стоит вплотную к настройкам
                        рассылки — промахнуться легко. */}
                    <ConfirmForm
                      action={unlinkTelegram}
                      confirmMessage={s.telegramUnlinkConfirm}
                      confirmLabel={s.telegramUnlink}
                      busyLabel={s.telegramUnlinking}
                    >
                      <button type="button" className="btn btn-ghost btn-sm">
                        {s.telegramUnlink}
                      </button>
                    </ConfirmForm>
                  </div>

                  {/* Что слать в бота. На сайте уведомления приходят
                      всегда — настройка только про Telegram. */}
                  <form action={updateNotificationPrefs} className="mt-3">
                    <p className="small text-secondary mb-2">{s.telegramSendTitle}</p>
                    <div className="d-flex flex-column gap-1">
                      {telegramNotifyToggles(s).map((toggle) => (
                        <div className="form-check" key={toggle.name}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id={toggle.name}
                            name={toggle.name}
                            defaultChecked={Boolean(user[toggle.name])}
                          />
                          <label className="form-check-label small" htmlFor={toggle.name}>
                            {toggle.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <button type="submit" className="btn btn-ghost btn-sm mt-2">
                      {s.save}
                    </button>
                  </form>
                  </>
                ) : (
                  <>
                    <p className="small text-secondary mb-2">{s.telegramConnectHint}</p>
                    <TelegramLinkButton botUsername={botUsername} />
                  </>
                )}
              </div>
            )}
          </div>
        }
        privacy={
          <div className="surface p-4">
            <p className="small text-secondary mb-3">{s.privacyIntro}</p>
            <form action={updatePrivacy} className="d-flex flex-column gap-2">
              {privacyToggles(s).map((toggle) => (
                <div className="form-check" key={toggle.name}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={toggle.name}
                    name={toggle.name}
                    defaultChecked={Boolean(user[toggle.name])}
                  />
                  <label className="form-check-label small" htmlFor={toggle.name}>
                    {toggle.label}
                    {toggle.hint && <span className="text-secondary d-block">{toggle.hint}</span>}
                  </label>
                </div>
              ))}
              <div className="mt-2">
                <button type="submit" className="btn btn-primary btn-sm">
                  {s.save}
                </button>
              </div>
            </form>
          </div>
        }
        security={
          <>
            <div className="surface p-4">
              <ChangePasswordForm />
            </div>
            <div className="surface p-4 mt-3">
              <h2 className="section-heading mb-2">{s.deleteTitle}</h2>
              <p className="small text-secondary mb-3">{s.deleteText}</p>
              <ConfirmForm
                action={deleteOwnAccount}
                confirmMessage={s.deleteConfirm}
                confirmLabel={s.deleteLabel}
                busyLabel={s.deleteBusy}
              >
                <button type="button" className="btn btn-outline-danger btn-sm">
                  {s.deleteButton}
                </button>
              </ConfirmForm>
            </div>
          </>
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
