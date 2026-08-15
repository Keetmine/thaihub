import { CalendarIcon } from "@/components/icons";

/** Shown in place of a paid feature's content for non-premium users.
 *  There's no self-serve payment yet — access is toggled per-user from
 *  /admin/users — so this deliberately has no "buy" button, just an
 *  explanation of what's behind the flag. */
export default function PremiumUpsell({ feature }: { feature: string }) {
  return (
    <div className="surface p-5 text-center" style={{ maxWidth: "34rem", margin: "0 auto" }}>
      <div className="mb-3" style={{ fontSize: "2rem", opacity: 0.6 }}>
        <CalendarIcon />
      </div>
      <h2 className="h4 font-display mb-2">{feature} — по подписке</h2>
      <p className="text-secondary mb-0">
        Эта функция доступна пользователям с подпиской. Напишите нам, чтобы
        подключить её к вашему аккаунту.
      </p>
    </div>
  );
}
