"use client";

import { useT } from "@/components/LocaleProvider";
import { TRIP_CURRENCIES, amountToInput, type TripCurrencyValue } from "@/lib/tripMoney";

/**
 * Пара полей «сколько стоило» + валюта — для форм брони и личного
 * события поездки (правка владельца 2026-09-16).
 *
 * Отдельным компонентом, а не копией в каждой форме: правил тут
 * немного, но они одинаковые — необязательность, разбор суммы на
 * сервере, подпись «попадёт в расходы». Две копии разъехались бы на
 * первой же правке текста.
 *
 * Пусто — цены нет и строки в расходах не будет. Это важнее, чем
 * кажется: у половины броней цену просто не помнят, и заставлять
 * вводить ноль было бы враньём в итогах.
 */
export default function PriceFields({
  priceMinor,
  currency,
}: {
  priceMinor?: number | null;
  currency?: TripCurrencyValue | null;
}) {
  const t = useT();
  const e = t.trips.expenses;
  return (
    <div className="row g-2">
      <div className="col">
        <label className="form-label" htmlFor="price-amount">
          {e.fieldPrice}
        </label>
        <input
          id="price-amount"
          name="priceAmount"
          inputMode="decimal"
          defaultValue={priceMinor != null ? amountToInput(priceMinor) : ""}
          placeholder={e.pricePlaceholder}
          className="form-control"
        />
      </div>
      {/* Валюта — узким селектом со ЗНАЧКАМИ (правка владельца
          2026-09-16): полные названия занимали половину строки. */}
      <div className="col-auto">
        <label className="form-label" htmlFor="price-currency">
          {e.fieldCurrency}
        </label>
        <select
          id="price-currency"
          name="priceCurrency"
          defaultValue={currency ?? "THB"}
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
  );
}
