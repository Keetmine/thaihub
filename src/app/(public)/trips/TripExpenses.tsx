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
  budgetProgress,
  byCategory,
  formatMoney,
  totalsByCurrency,
  type ExpenseCategoryValue,
  type TripCurrencyValue,
} from "@/lib/tripMoney";
import { addTripExpense, updateTripExpense, deleteTripExpense, setTripBudget } from "./actions";

export type ExpenseData = {
  id: string;
  title: string;
  amountMinor: number;
  currency: TripCurrencyValue;
  category: ExpenseCategoryValue;
  /** ISO-строка: клиентский компонент, Date не сериализуем. */
  spentOn: string | null;
  note: string | null;
  bookingId: string | null;
  bookingLabel: string | null;
};

export type BudgetData = { currency: TripCurrencyValue; amountMinor: number };

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
 * выдумываем (см. src/lib/tripMoney.ts). Поэтому и бюджет свой на каждую
 * валюту: сравнивать баты с рублями не через что.
 */
export default function TripExpenses({
  tripId,
  expenses,
  budgets,
  bookings,
  canAdd,
}: {
  tripId: string;
  expenses: ExpenseData[];
  budgets: BudgetData[];
  /** Брони поездки — чтобы прицепить трату к уже известному перелёту
   *  или отелю вместо того, чтобы вбивать его второй раз. */
  bookings: { id: string; label: string }[];
  canAdd: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const e = t.trips.expenses;
  const [editing, setEditing] = useState<ExpenseData | null>(null);
  const [adding, setAdding] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const totals = totalsByCurrency(expenses);
  const budgetByCurrency = new Map(budgets.map((b) => [b.currency, b.amountMinor]));

  return (
    <div>
      {/* Итоги сверху: ради них вкладку и открывают. По строке на
          валюту — складывать баты с рублями нечем. */}
      {totals.length > 0 && (
        <div className="d-flex flex-column gap-3 mb-4">
          {totals.map(({ currency, total }) => {
            const budget = budgetByCurrency.get(currency) ?? 0;
            const { share, over } = budgetProgress(total, budget);
            const cats = byCategory(expenses, currency);
            return (
              <section key={currency} className="surface p-3">
                <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2">
                  <p className="h5 mb-0">{formatMoney(total, currency, locale)}</p>
                  {budget > 0 && (
                    <p className="small text-secondary mb-0">
                      {over > 0
                        ? e.overBudget(formatMoney(over, currency, locale))
                        : e.ofBudget(formatMoney(budget, currency, locale))}
                    </p>
                  )}
                </div>

                {budget > 0 && (
                  <div className={`expense-budget-bar mt-2${over > 0 ? " is-over" : ""}`}>
                    <span style={{ width: `${Math.round(share * 100)}%` }} />
                  </div>
                )}

                {/* Разбивка по категориям — полосами, а не диаграммой:
                    полоса читается с одного взгляда и не требует легенды. */}
                {cats.length > 0 && (
                  <ul className="list-unstyled d-flex flex-column gap-2 mt-3 mb-0">
                    {cats.map((c) => (
                      <li key={c.category} className="expense-cat-row">
                        <span className="expense-cat-name">
                          <span aria-hidden>{CATEGORY_EMOJI[c.category]}</span>{" "}
                          {e.category[c.category]}
                        </span>
                        <span className="expense-cat-track">
                          <span style={{ width: `${Math.max(2, Math.round(c.share * 100))}%` }} />
                        </span>
                        <span className="expense-cat-sum small text-secondary">
                          {formatMoney(c.total, currency, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {canAdd && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            {e.add}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBudgetOpen(true)}>
            {e.budget}
          </button>
        </div>
      )}

      {expenses.length === 0 ? (
        <EmptyState emoji="💸" title={e.emptyTitle} hint={canAdd ? e.emptyHint : undefined} />
      ) : (
        <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
          {expenses.map((item) => (
            <li key={item.id} className="surface surface-hover expense-row">
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
                    item.bookingLabel,
                    item.note,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="expense-row-sum">
                {formatMoney(item.amountMinor, item.currency, locale)}
              </span>
              {canAdd && (
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
        bookings={bookings}
        item={editing}
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />

      <BudgetDialog
        tripId={tripId}
        budgets={budgets}
        open={budgetOpen}
        onClose={() => setBudgetOpen(false)}
      />
    </div>
  );
}

/** Одна форма на создание и на правку: два экрана с одними и теми же
 *  полями разъехались бы при первой правке. */
function ExpenseDialog({
  tripId,
  bookings,
  item,
  open,
  onClose,
}: {
  tripId: string;
  bookings: { id: string; label: string }[];
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
          <div className="col-7">
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
          <div className="col-5">
            <label className="form-label" htmlFor="expense-currency">
              {e.fieldCurrency}
            </label>
            <select
              id="expense-currency"
              name="currency"
              defaultValue={item?.currency ?? "THB"}
              className="form-select"
            >
              {TRIP_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {e.currency[c]}
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

        {/* Привязка к брони: перелёты и отели сайт уже знает, и вбивать
            их второй раз не нужно. Пусто — обычная трата. */}
        {bookings.length > 0 && (
          <div>
            <label className="form-label" htmlFor="expense-booking">
              {e.fieldBooking}
            </label>
            <select
              id="expense-booking"
              name="bookingId"
              defaultValue={item?.bookingId ?? ""}
              className="form-select"
            >
              <option value="">{e.noBooking}</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
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

/** Бюджет — по одному на валюту: курсов мы не храним, сравнивать баты с
 *  рублями не через что. Пустое поле снимает бюджет. */
function BudgetDialog({
  tripId,
  budgets,
  open,
  onClose,
}: {
  tripId: string;
  budgets: BudgetData[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const e = t.trips.expenses;
  const router = useRouter();
  const [currency, setCurrency] = useState<TripCurrencyValue>("THB");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = budgets.find((b) => b.currency === currency);

  function submit(formData: FormData) {
    start(async () => {
      const res = await setTripBudget(tripId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={e.budget}>
      <form action={submit} className="d-flex flex-column gap-3">
        <p className="small text-secondary mb-0">{e.budgetHint}</p>
        <div className="row g-2">
          <div className="col-5">
            <label className="form-label" htmlFor="budget-currency">
              {e.fieldCurrency}
            </label>
            <select
              id="budget-currency"
              name="currency"
              value={currency}
              onChange={(ev) => setCurrency(ev.target.value as TripCurrencyValue)}
              className="form-select"
            >
              {TRIP_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {e.currency[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-7">
            <label className="form-label" htmlFor="budget-amount">
              {e.fieldAmount}
            </label>
            {/* key по валюте: иначе при переключении валюты в поле
                оставалась сумма от прошлой. */}
            <input
              id="budget-amount"
              key={currency}
              name="amount"
              inputMode="decimal"
              defaultValue={current ? amountToInput(current.amountMinor) : ""}
              placeholder={e.budgetPlaceholder}
              className="form-control"
            />
          </div>
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
