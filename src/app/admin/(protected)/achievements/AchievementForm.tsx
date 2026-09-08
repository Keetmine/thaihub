"use client";

import { useRef, useState } from "react";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";

// Форма ачивки (Э2ф). Метрики приходят с сервера готовым списком
// (значение + русская подпись + kind + чья): сами реестры METRICS и
// COMMUNITY_METRICS живут в src/lib/, тянут prisma и в клиентский бандл
// не попадают. У флаговых метрик порога нет — поле блокируется на 1.
//
// Ачивка бывает личная и сообщества (`scope`): каталог общий, а вот
// метрики у них разные — при смене переключателя список метрик
// перерисовывается, чтобы нельзя было повесить на сообщество «дни в
// Таиланде».

export type MetricOption = {
  value: string;
  label: string;
  kind: "counter" | "flag";
  scope: "USER" | "COMMUNITY";
};

export default function AchievementForm({
  action,
  submitLabel,
  metricOptions,
  defaultValues,
  keyLocked = false,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  metricOptions: MetricOption[];
  defaultValues?: {
    key: string;
    scope: "USER" | "COMMUNITY";
    emoji: string;
    title: string;
    hint: string;
    metric: string;
    threshold: number;
    enabled: boolean;
    sort: number;
  };
  /** true на редактировании: по key привязаны уже полученные
   *  UserAchievement/CommunityAchievement, менять его нельзя. Заодно
   *  запирается и scope — выданные строки лежат в разных таблицах. */
  keyLocked?: boolean;
}) {
  const v = defaultValues;
  const [scope, setScope] = useState<"USER" | "COMMUNITY">(v?.scope ?? "USER");
  const scopeOptions = metricOptions.filter((m) => m.scope === scope);
  const [metric, setMetric] = useState(v?.metric ?? scopeOptions[0]?.value ?? "");
  // Метрика чужого scope в селекте не показана — значит, и выбранной
  // остаться не может: подставляем первую из своих.
  const currentMetric = scopeOptions.some((m) => m.value === metric)
    ? metric
    : (scopeOptions[0]?.value ?? "");
  const isFlag = scopeOptions.find((m) => m.value === currentMetric)?.kind === "flag";

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);

  return (
    <form ref={formRef} action={action} className="surface d-flex flex-column gap-3 p-4">
      <FormSection title="Как выглядит" hint="эмодзи-медаль, название и подсказка «как получить»">
        <div className="row g-3">
          <div className="col-4 col-md-2">
            <label className="form-label" htmlFor="achievement-form-emoji">Эмодзи *</label>
            <input id="achievement-form-emoji" name="emoji" required defaultValue={v?.emoji} className="form-control" maxLength={8} />
          </div>
          <div className="col-8 col-md-4">
            <label className="form-label" htmlFor="achievement-form-title">Название *</label>
            <input id="achievement-form-title" name="title" required defaultValue={v?.title} className="form-control" />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="achievement-form-hint">Подсказка *</label>
            <input id="achievement-form-hint"
              name="hint"
              required
              defaultValue={v?.hint}
              className="form-control"
              placeholder="Посетить 5 событий"
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Условие"
        hint="метрика считается кодом из статистики (юзера или сообщества), порог задаётся здесь"
      >
        <div className="row g-3">
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="achievement-form-scope">Чьё достижение *</label>
            {/* На правке scope заперт: выданные строки лежат в разных
                таблицах (UserAchievement / CommunityAchievement), и
                смена адресата осиротила бы уже полученное. */}
            <select
              id="achievement-form-scope"
              name="scope"
              className="form-select"
              value={scope}
              disabled={keyLocked}
              onChange={(e) => setScope(e.target.value as "USER" | "COMMUNITY")}
            >
              <option value="USER">Личная</option>
              <option value="COMMUNITY">Сообщества</option>
            </select>
            {keyLocked && <input type="hidden" name="scope" value={scope} />}
            <div className="form-text">
              {keyLocked
                ? "Менять нельзя: выданные записи привязаны к этому типу."
                : "Личная висит в профиле, сообщества — на странице сообщества."}
            </div>
          </div>
          <div className="col-12 col-md-5">
            <label className="form-label" htmlFor="achievement-form-metric">Метрика *</label>
            <select id="achievement-form-metric"
              name="metric"
              className="form-select"
              value={currentMetric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {scopeOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="achievement-form-threshold">
              Порог *
            </label>
            {/* У флага порога нет: value=1 отправляется скрытым полем,
                видимый input задизейблен, чтобы это было очевидно. */}
            <input
              id="achievement-form-threshold"
              name={isFlag ? undefined : "threshold"}
              type="number"
              min={1}
              step={1}
              required
              key={isFlag ? "flag" : "counter"}
              defaultValue={isFlag ? 1 : v?.threshold ?? 1}
              disabled={isFlag}
              className="form-control"
            />
            {isFlag && <input type="hidden" name="threshold" value="1" />}
            {isFlag && (
              <div className="form-text">У флага порога нет — «было/не было».</div>
            )}
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="achievement-form-sort">Порядок</label>
            <input id="achievement-form-sort"
              name="sort"
              type="number"
              step={1}
              defaultValue={v?.sort ?? 0}
              className="form-control"
            />
            <div className="form-text">Меньше — выше в списке.</div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Служебное"
        hint="ключ связывает достижение с уже полученными у пользователей"
      >
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="achievement-form-key">Ключ *</label>
            <input id="achievement-form-key"
              name="key"
              required
              defaultValue={v?.key}
              readOnly={keyLocked}
              pattern="[a-z0-9-]+"
              className="form-control"
              placeholder="concerts-5"
            />
            <div className="form-text">
              {keyLocked
                ? "Менять нельзя: по ключу привязаны уже полученные достижения."
                : "Латиница в нижнем регистре, цифры и дефисы. После создания не меняется."}
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="form-check">
              <input
                type="checkbox"
                name="enabled"
                id="achv-enabled"
                className="form-check-input"
                defaultChecked={v?.enabled ?? true}
              />
              <label htmlFor="achv-enabled" className="form-check-label">
                Включена
              </label>
            </div>
            <div className="form-text">
              Выключенная прячется отовсюду (кабинет, профили), прогресс не считается;
              уже полученные у пользователей записи остаются.
            </div>
          </div>
        </div>
      </FormSection>

      <div className="admin-form-actions">
        <SubmitButton label={submitLabel} busyLabel="Сохранение…" className="btn btn-primary" />
        {dirty && (
          <span className="small text-secondary">
            ● Есть несохранённые изменения — они пропадут, если уйти со страницы.
          </span>
        )}
      </div>
    </form>
  );
}
