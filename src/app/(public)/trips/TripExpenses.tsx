"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon, PencilIcon } from "@/components/icons";
import { useLocale, useT } from "@/components/LocaleProvider";
import {
  CATEGORY_EMOJI,
  EXPENSE_CATEGORIES,
  TRIP_CURRENCIES,
  amountToInput,
  byCategory,
  formatMoney,
  totalsByCurrency,
  type ExpenseCategoryValue,
  type ExpenseLike,
  type TripCurrencyValue,
} from "@/lib/tripMoney";
import { addTripExpense, updateTripExpense, deleteTripExpense } from "./actions";

export type ExpenseData = {
  id: string;
  title: string;
  amountMinor: number;
  currency: TripCurrencyValue;
  category: ExpenseCategoryValue;
  /** ISO-строка: клиентский компонент, Date не сериализуем. */
  spentOn: string | null;
  note: string | null;
  /** Одно значение на оба вида привязки: `booking:<id>` или
   *  `occurrence:<id>`. Префикс нужен, потому что id брони и id даты
   *  события живут в разных таблицах и перепутать их нельзя. */
  link: string;
  linkLabel: string | null;
};

/**
 * Строка расходов, пришедшая ИЗ ДРУГОЙ ЗАПИСИ — цены брони или личного
 * события (правка владельца 2026-09-16).
 *
 * Считывается, а не копируется в `TripExpense`: две записи об одних
 * деньгах пришлось бы держать в синхроне, и однажды они бы разъехались.
 * Поэтому такую строку здесь НЕ правят и не удаляют — цена меняется
 * там, где заведена, и подпись прямо об этом говорит.
 */
export type DerivedExpense = {
  id: string;
  title: string;
  amountMinor: number;
  currency: TripCurrencyValue;
  category: ExpenseCategoryValue;
  spentOn: string | null;
  /** Откуда пришла: бронь, личное событие или КУПЛЕННЫЙ пункт покупок. */
  source: "booking" | "event" | "shopping";
};

/**
 * Вкладка «Деньги» поездки (решение владельца 2026-09-16).
 *
 * Траты ЛИЧНЫЕ — «персонально у каждого свои траты». Поэтому здесь нет
 * ни выбора «кто это видит», ни имени автора, ни права правки другими:
 * всё это есть у прочих записей поездки, а тут было бы враньём. Чужих
 * трат человек не видит вовсе, и серверные действия фильтруют по паре
 * (поездка, я), а не только по id.
 *
 * Делёжки «кто кому должен» нет намеренно: владелец отменила её при
 * постановке задачи.
 *
 * Итоги считаются ПО КАЖДОЙ ВАЛЮТЕ отдельно — курсов мы не храним и не
 * выдумываем (см. src/lib/tripMoney.ts): сравнивать баты с рублями не
 * через что, поэтому сводка идёт по валютам отдельно.
 *
 * Три источника строк: траты, заведённые руками; цены броней и личных
 * событий; КУПЛЕННЫЕ пункты списка покупок. Последние — только
 * купленные: список покупок это хотелки, и неотмеченный пункт остаётся
 * планом (он показан отдельной тихой строкой, но в итог не идёт).
 */
export default function TripExpenses({
  tripId,
  expenses,
  derived,
  plannedShopping,
  links,
  canAdd,
}: {
  tripId: string;
  expenses: ExpenseData[];
  /** Цены броней, личных событий и купленных покупок — см. DerivedExpense. */
  derived: DerivedExpense[];
  /** Ещё НЕ купленные покупки с ценой: это план, а не расход. В итог не
   *  идут, но и пропасть не должны — иначе человек проставил цены и не
   *  понимает, куда они делись. */
  plannedShopping: ExpenseLike[];
  /** К чему можно прицепить трату: брони поездки и события афиши в её
   *  датах. Одним списком с готовыми значениями `booking:…` /
   *  `occurrence:…` — форме не нужно знать, откуда что взялось. */
  links: { value: string; label: string }[];
  canAdd: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const e = t.trips.expenses;
  const [editing, setEditing] = useState<ExpenseData | null>(null);
  const [adding, setAdding] = useState(false);

  // Итоги и разбивка считаются по ОБЕИМ половинам: цена брони — такие
  // же потраченные деньги, как трата, заведённая руками.
  const all = [...expenses, ...derived];
  const totals = totalsByCurrency(all);
  const plannedTotals = totalsByCurrency(plannedShopping);

  // Единый список: сверху свежее по дате, записи без даты в хвосте.
  const rows = [
    ...derived.map((d) => ({ ...d, kind: "derived" as const })),
    ...expenses.map((e2) => ({ ...e2, kind: "manual" as const })),
  ].sort((a, b) => {
    if (!a.spentOn && !b.spentOn) return 0;
    if (!a.spentOn) return 1;
    if (!b.spentOn) return -1;
    return b.spentOn.localeCompare(a.spentOn);
  });

  return (
    <div>
      {/* Итоги сверху: ради них вкладку и открывают. По строке на
          валюту — складывать баты с рублями нечем. */}
      {/* Сводка ОДНИМ компактным блоком (правка владельца 2026-09-16:
          «много места занимают»). Было по карточке на валюту, в каждой
          крупное число, полоса бюджета и столбик категорий — на двух
          валютах это занимало целый экран до самого списка.

          Теперь: итоги в строку через разделитель, под ними категории
          мелкой сеткой. Разбивка считается ВНУТРИ валюты (складывать
          баты с рублями нечем), поэтому при двух валютах идут два
          коротких блока с подписью валюты. */}
      {totals.length > 0 && (
        <section className="surface p-3 mb-3 expense-summary">
          <p className="expense-summary-totals mb-0">
            {totals.map(({ currency, total }, i) => (
              <span key={currency}>
                {i > 0 && <span className="expense-summary-sep" aria-hidden> · </span>}
                {formatMoney(total, currency, locale)}
              </span>
            ))}
          </p>

          {/* План отдельной тихой строкой: это ещё не потраченное, и
              складывать его с итогом нельзя. */}
          {plannedTotals.length > 0 && (
            <p className="small text-secondary mb-0 mt-1">
              {e.planned(
                plannedTotals
                  .map((pt) => formatMoney(pt.total, pt.currency, locale))
                  .join(" · "),
              )}
            </p>
          )}

          {totals.map(({ currency }) => {
            const cats = byCategory(all, currency);
            if (cats.length === 0) return null;
            return (
              <div key={currency} className="mt-2">
                {totals.length > 1 && (
                  <p className="expense-summary-cur mb-1">{e.currency[currency]}</p>
                )}
                <ul className="list-unstyled d-flex flex-column gap-1 mb-0">
                  {cats.map((c) => (
                    <li key={c.category} className="expense-cat-row">
                      <span className="expense-cat-name">
                        <span aria-hidden>{CATEGORY_EMOJI[c.category]}</span>{" "}
                        {e.category[c.category]}
                      </span>
                      <span className="expense-cat-track">
                        <span style={{ width: `${Math.max(2, Math.round(c.share * 100))}%` }} />
                      </span>
                      <span className="expense-cat-sum">
                        {formatMoney(c.total, currency, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {canAdd && (
        <div className="mb-3">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            {e.add}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState emoji="💸" title={e.emptyTitle} hint={canAdd ? e.emptyHint : undefined} />
      ) : (
        <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
          {rows.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="surface surface-hover expense-row">
              <span className="expense-row-emoji" aria-hidden>
                {CATEGORY_EMOJI[item.category]}
              </span>
              <span className="expense-row-main">
                <span className="d-block">{item.title}</span>
                <span className="small text-secondary d-block">
                  {[
                    item.spentOn
                      ? new Date(item.spentOn).toLocaleDateString(
                          locale === "ru" ? "ru-RU" : "en-US",
                          { day: "numeric", month: "long" },
                        )
                      : null,
                    e.category[item.category],
                    // Откуда пришла строка — говорим прямо: иначе
                    // непонятно, почему её нельзя поправить здесь.
                    item.kind === "derived"
                      ? item.source === "booking"
                        ? e.fromBooking
                        : item.source === "shopping"
                          ? e.fromShopping
                          : e.fromEvent
                      : item.linkLabel,
                    item.kind === "manual" ? item.note : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="expense-row-sum">
                {formatMoney(item.amountMinor, item.currency, locale)}
              </span>
              {/* Правка и удаление — только у своих трат. Цену брони
                  меняют в самой брони: копии здесь нет, править нечего. */}
              {canAdd && item.kind === "manual" && (
                <span className="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.common.edit}
                    onClick={() => setEditing(item)}
                  >
                    <PencilIcon />
                  </button>
                  <ConfirmForm
                    action={deleteTripExpense.bind(null, tripId, item.id)}
                    confirmMessage={e.deleteConfirm}
                  >
                    <TrashIcon />
                  </ConfirmForm>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <ExpenseDialog
        tripId={tripId}
        links={links}
        item={editing}
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />


    </div>
  );
}

/** Одна форма на создание и на правку: два экрана с одними и теми же
 *  полями разъехались бы при первой правке. */
function ExpenseDialog({
  tripId,
  links,
  item,
  open,
  onClose,
}: {
  tripId: string;
  links: { value: string; label: string }[];
  item: ExpenseData | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const e = t.trips.expenses;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    start(async () => {
      const res = item
        ? await updateTripExpense(tripId, item.id, formData)
        : await addTripExpense(tripId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      formRef.current?.reset();
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? e.editTitle : e.add}>
      {/* key по id: без него поля правки одной траты утекали в следующую
          (тот же приём у формы дел). */}
      <form ref={formRef} key={item?.id ?? "new"} action={submit} className="d-flex flex-column gap-3">
        <div>
          <label className="form-label" htmlFor="expense-title">
            {e.fieldTitle}
          </label>
          <input
            id="expense-title"
            name="title"
            defaultValue={item?.title}
            required
            autoFocus
            placeholder={e.titlePlaceholder}
            className="form-control"
          />
        </div>

        <div className="row g-2">
          <div className="col">
            <label className="form-label" htmlFor="expense-amount">
              {e.fieldAmount}
            </label>
            <input
              id="expense-amount"
              name="amount"
              inputMode="decimal"
              defaultValue={item ? amountToInput(item.amountMinor) : ""}
              required
              placeholder="1200"
              className="form-control"
            />
          </div>
          {/* Валюта — узким селектом со ЗНАЧКАМИ (правка владельца
              2026-09-16): четыре полных названия занимали половину
              строки, а «฿» понятно и так. */}
          <div className="col-auto">
            <label className="form-label" htmlFor="expense-currency">
              {e.fieldCurrency}
            </label>
            <select
              id="expense-currency"
              name="currency"
              defaultValue={item?.currency ?? "THB"}
              className="form-select expense-currency-select"
            >
              {TRIP_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {e.currencySign[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="form-label" htmlFor="expense-category">
            {e.fieldCategory}
          </label>
          <select
            id="expense-category"
            name="category"
            defaultValue={item?.category ?? "OTHER"}
            className="form-select"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_EMOJI[c]} {e.category[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label" htmlFor="expense-date">
            {e.fieldDate}
          </label>
          <DatePickerInput
            id="expense-date"
            name="spentOn"
            defaultValue={item?.spentOn ? item.spentOn.slice(0, 10) : ""}
          />
        </div>

        {/* «К чему относится»: брони поездки и события афиши в её датах.
            Один селект на два вида — сайт уже знает и про перелёт, и про
            фестиваль, вбивать их названия руками незачем. Пусто —
            обычная трата. */}
        {links.length > 0 && (
          <div>
            <label className="form-label" htmlFor="expense-link">
              {e.fieldBooking}
            </label>
            <select
              id="expense-link"
              name="link"
              defaultValue={item?.link ?? ""}
              className="form-select"
            >
              <option value="">{e.noBooking}</option>
              {links.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="form-label" htmlFor="expense-note">
            {e.fieldNote}
          </label>
          <input id="expense-note" name="note" defaultValue={item?.note ?? ""} className="form-control" />
        </div>

        {error && <p className="text-danger small mb-0">{error}</p>}

        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? t.common.loading : t.common.save}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
