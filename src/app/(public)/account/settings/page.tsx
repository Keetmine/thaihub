import { TIMEZONES } from "@/lib/timezones";
import AppLink from "@/components/AppLink";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import SettingsUploadField from "./SettingsUploadField";
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
import InviteFriendSection from "./InviteFriendSection";
import MdlImportSection from "./MdlImportSection";
import SettingsForm, { SettingsSubmitRow } from "./SettingsForm";
import SettingsTabs from "./SettingsTabs";
import { pageMetadata } from "@/lib/seo";
import TelegramLinkButton from "./TelegramLinkButton";
import { telegramBotUsername } from "@/lib/telegram";
import { countryOptions } from "@/lib/countries";
import { dateKey } from "@/lib/dates";
import DatePickerInput from "@/components/DatePickerInput";
import ConfirmForm from "@/components/ConfirmForm";
import { isPremiumActive } from "@/lib/premium";
import { PROFILE_COVER_RATIO_H, PROFILE_COVER_RATIO_W } from "@/lib/userProfile";
import { getT, localeHref, LOCALES, type Dict } from "@/lib/i18n";

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
const telegramNotifyToggles = (
  s: Dict["account"]["settings"],
  c: Dict["communities"],
  ts: Dict["settings"],
  premium: boolean,
) => [
  { name: "tgNotifyInvites" as const, label: s.telegramNotifyInvites, hint: null },
  { name: "tgNotifyFriends" as const, label: s.telegramNotifyFriends, hint: null },
  { name: "tgNotifyReplies" as const, label: s.telegramNotifyReplies, hint: null },
  { name: "tgNotifyEvents" as const, label: s.telegramNotifyEvents, hint: null },
  { name: "tgNotifyBirthdays" as const, label: s.telegramNotifyBirthdays, hint: null },
  { name: "tgNotifyEpisodes" as const, label: s.telegramNotifyEpisodes, hint: null },
  // Недельный дайджест (аудит 2026-09, раздел 8) — платная рассылка,
  // но тумблер стоит в общем ряду и работает у всех: настройка
  // сохраняется заранее и после оплаты уже на месте. Бесплатному
  // аккаунту под подписью — честная пометка, что письмо придёт с
  // подпиской, а не молчаливая галочка в никуда.
  {
    name: "tgNotifyDigest" as const,
    label: ts.telegramNotifyDigest,
    hint: premium ? null : ts.telegramNotifyDigestPremium,
  },
  // Подпись — из словаря сообществ: строка про сообщества и правится
  // вместе с фичей, а account.ts трогают параллельно другие разделы.
  { name: "tgNotifyCommunities" as const, label: c.people.tgToggle, hint: null },
  { name: "tgNotifyBroadcast" as const, label: s.telegramNotifyBroadcast, hint: null },
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
  // Новые строки редизайна — в своём разделе словаря (settings.ts):
  // account.ts правится параллельно и чужие ключи туда не добавляем.
  const ts = t.settings;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  // Подписка решает две вещи на этой странице: можно ли поставить
  // обложку профиля и обещаем ли недельный дайджест.
  const premium = isPremiumActive(user);
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
          <div className="d-flex flex-column gap-3">
            {/* Одна форма на две карточки: у updateProfile единый
                контракт (имя и язык сохраняются вместе), поэтому
                секции разделены визуально, а сабмит общий. */}
            <SettingsForm action={updateProfile} submitLabel={s.save} ownSubmitRow>
              {/* Профиль и «язык и регион» — ОДНА карточка (правка
                  владельца 2026-09-06): это один и тот же рассказ о
                  себе, и сохраняются они одной формой; двумя блоками
                  форма выглядела длиннее, чем есть.

                  Фото — слева и компактной рамкой 3:4, как оно и
                  показывается в профиле: полоса дропзоны во всю ширину
                  колонки занимала полэкрана и обещала не тот кадр. */}
              <div className="surface p-4">
                {/* Подписи под заголовком нет намеренно (правка
                    владельца 2026-09-06): «как вы выглядите для друзей»
                    ничего не объясняло — поля и так говорят за себя. */}
                <h2 className="section-heading mb-3">{ts.profileSection}</h2>
                {/* Не сетка, а флекс: колонка-сетка была втрое шире
                    самой рамки фото (она 11rem), и между фото и полями
                    зияла пустота (правка владельца 2026-09-06). Здесь
                    фото занимает ровно свою ширину, поля начинаются
                    сразу за ним. */}
                <div className="d-flex flex-column flex-sm-row gap-3">
                  <div style={{ width: "11rem", flexShrink: 0 }}>
                    <SettingsUploadField
                      name="photoUrl"
                      label={s.photo}
                      defaultValue={user.photoUrl ?? ""}
                      compact
                      crop
                    />
                  </div>

                  <div className="flex-fill d-flex flex-column gap-3" style={{ minWidth: 0 }}>
                    <div className="row g-3">
                      <div className="col-12 col-lg-6">
                        <label className="form-label" htmlFor="settings-name">{s.name}</label>
                        <input id="settings-name" name="name" defaultValue={user.name ?? ""} className="form-control" />
                        {/* Подсказка про видимость — у самого поля имени. */}
                        <p className="small text-secondary mb-0 mt-1">{s.nameVisible}</p>
                      </div>
                      <div className="col-12 col-lg-6">
                        <label className="form-label" htmlFor="settings-username">{s.username}</label>
                        {/* Он же адрес профиля — ссылкой делятся с друзьями. */}
                        <div className="input-group">
                          <span className="input-group-text small text-secondary">/users/</span>
                          <input id="settings-username"
                            name="username"
                            defaultValue={user.username ?? ""}
                            className="form-control"
                          />
                        </div>
                        <p className="small text-secondary mb-0 mt-1">{s.usernameHint}</p>
                      </div>
                    </div>

                    <div>
                      <label className="form-label" htmlFor="settings-bio">{s.bio}</label>
                      <textarea id="settings-bio"
                        name="bio"
                        rows={3}
                        defaultValue={user.bio ?? ""}
                        placeholder={s.bioPlaceholder}
                        className="form-control"
                      />
                    </div>

                    <div className="row g-3">
                      <div className="col-6 col-lg-3">
                        <label className="form-label" htmlFor="settings-gender">{s.gender}</label>
                        <select id="settings-gender" name="gender" defaultValue={user.gender ?? ""} className="form-select">
                          <option value="">{s.genderEmpty}</option>
                          <option value="female">{s.genderFemale}</option>
                          <option value="male">{s.genderMale}</option>
                          <option value="other">{s.genderOther}</option>
                        </select>
                      </div>
                      <div className="col-6 col-lg-3">
                        <label className="form-label" htmlFor="settings-birthDate">{s.birthDate}</label>
                        <DatePickerInput id="settings-birthDate"
                          name="birthDate"
                          defaultValue={user.birthDate ? dateKey(user.birthDate) : ""}
                          yearsBack={100}
                          yearsForward={0}
                        />
                      </div>
                      <div className="col-12 col-lg-6">
                        <label className="form-label" htmlFor="settings-country">{s.country}</label>
                        <select id="settings-country" name="country" defaultValue={user.country ?? ""} className="form-select">
                          <option value="">{s.countryEmpty}</option>
                          {countryOptions(locale).map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Обложка профиля — косметика подписчика (аудит
                    2026-09, раздел 8). Отдельной строкой под фото, а не
                    рядом с ним: это широкая полоса, и рамка
                    кадрирования у неё во всю ширину карточки.
                    Кадрируем ровно теми пропорциями, какими обложка
                    показывается на профиле.

                    У бесплатного аккаунта поля НЕТ вовсе — только
                    честная строка про подписку; на его отсутствие
                    рассчитывает и экшен: раз поле не пришло, колонку он
                    не трогает, и обложка, поставленная во время
                    подписки, остаётся на месте (её видят все, включая
                    гостей). */}
                <hr className="my-4" />
                <h3 className="small text-uppercase text-secondary mb-2" style={{ letterSpacing: "0.08em" }}>
                  {ts.coverSection}
                </h3>
                <p className="small text-secondary mb-3">
                  {premium ? ts.coverHint : ts.coverPremiumHint}
                </p>
                {premium && (
                  <SettingsUploadField
                    name="coverUrl"
                    defaultValue={user.coverUrl ?? ""}
                    wide
                    crop
                    ratioW={PROFILE_COVER_RATIO_W}
                    ratioH={PROFILE_COVER_RATIO_H}
                  />
                )}

                {/* Язык и часовой пояс — той же карточкой, но отбиты
                    линией: это уже не «о себе», а «как показывать». */}
                <hr className="my-4" />
                <h3 className="small text-uppercase text-secondary mb-3" style={{ letterSpacing: "0.08em" }}>
                  {ts.regionalSection}
                </h3>
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="settings-locale">{s.language}</label>
                    <select id="settings-locale"
                      name="locale"
                      defaultValue={user.locale ?? locale}
                      className="form-select"
                    >
                      {LOCALES.map((code) => (
                        <option key={code} value={code}>
                          {s.languageNames[code]}
                        </option>
                      ))}
                    </select>
                    <p className="small text-secondary mb-0 mt-1">{s.languageHint}</p>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="settings-timezone">{s.timezone}</label>
                    <select id="settings-timezone" name="timezone" defaultValue={user.timezone} className="form-select">
                      {TIMEZONES.map((zone) => (
                        <option key={zone.value} value={zone.value}>
                          {zone.label[locale]}
                        </option>
                      ))}
                    </select>
                    <p className="small text-secondary mb-0 mt-1">{s.timezoneHint}</p>
                  </div>
                </div>

                <SettingsSubmitRow className="mt-4" />
              </div>
            </SettingsForm>

            {/* Привязка Telegram: без неё уведомления слать некуда, а
                telegramId раньше появлялся только у тех, кто входил
                через Telegram или платил в боте. */}
            {botUsername && (
              <div className="surface p-4">
                <h2 className="section-heading mb-1">{s.telegram}</h2>
                <p className="small text-secondary mb-3">{ts.telegramSectionHint}</p>
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
                  <SettingsForm action={updateNotificationPrefs} submitLabel={s.save} className="mt-3">
                    <p className="small text-secondary mb-2">{s.telegramSendTitle}</p>
                    <div className="d-flex flex-column gap-1">
                      {telegramNotifyToggles(s, t.communities, ts, premium).map((toggle) => (
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
                            {toggle.hint && (
                              <span className="text-secondary d-block">{toggle.hint}</span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                  </SettingsForm>
                  </>
                ) : (
                  <>
                    <p className="small text-secondary mb-2">{s.telegramConnectHint}</p>
                    <TelegramLinkButton botUsername={botUsername} />
                  </>
                )}
              </div>
            )}

            {/* Пригласить подругу (аудит 2026-09 п.7): копируемая
                реферальная ссылка. Зарегистрировавшаяся по ней сразу
                становится другом — см. signup/actions.ts. */}
            <div className="surface p-4">
              <h2 className="section-heading mb-1">{t.social.friends.invite.title}</h2>
              <p className="small text-secondary mb-3">{t.social.friends.invite.hint}</p>
              <InviteFriendSection refValue={user.username ?? user.id} />
            </div>

            {/* Тур по интерфейсу — пройти заново. Полезно и когда
                появляются новые разделы. */}
            <div className="surface p-4">
              <h2 className="section-heading mb-1">{s.tourTitle}</h2>
              <p className="small text-secondary mb-3">{s.tourHint}</p>
              <form action={restartTour}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  {user.tourCompletedAt ? s.tourRestart : s.tourStart}
                </button>
              </form>
            </div>
          </div>
        }
        privacy={
          <div className="surface p-4">
            <h2 className="section-heading mb-1">{ts.privacySection}</h2>
            <p className="small text-secondary mb-3">{s.privacyIntro}</p>
            <SettingsForm action={updatePrivacy} submitLabel={s.save}>
              <div className="d-flex flex-column gap-2">
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
              </div>
            </SettingsForm>
          </div>
        }
        security={
          <>
            <div className="surface p-4">
              <h2 className="section-heading mb-1">{ts.passwordSection}</h2>
              <p className="small text-secondary mb-3">{ts.passwordSectionHint}</p>
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
            <h2 className="section-heading mb-1">{ts.calendarSection}</h2>
            <IcsFeedSection token={icsToken} />
          </div>
        }
        mdlImport={
          <div className="d-flex flex-column gap-3">
            <MdlImportSection />
            {/* Выгрузка своих данных таблицей (АА16). Ссылки, а не
                кнопки-формы: браузер сам скачает файл по адресу, а
                ссылку можно открыть в новой вкладке. Подписка не
                требуется — забрать своё человек должен мочь всегда. */}
            <div className="surface p-4 mb-3">
              <h2 className="section-heading mb-1">{s.exportTitle}</h2>
              <p className="small text-secondary mb-3">{s.exportHint}</p>
              <div className="d-flex flex-wrap gap-2">
                {[
                  { kind: "dramas", label: s.exportDramas },
                  { kind: "events", label: s.exportEvents },
                  { kind: "trips", label: s.exportTrips },
                  { kind: "trip-items", label: s.exportTripItems },
                  { kind: "artists", label: s.exportArtists },
                  { kind: "places", label: s.exportPlaces },
                ].map((item) => (
                  <a
                    key={item.kind}
                    href={`/api/export/${item.kind}`}
                    className="btn btn-ghost btn-sm"
                    download
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
