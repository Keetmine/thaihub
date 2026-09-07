/**
 * Афиша встречи на её собственной странице `/event/<id>`.
 *
 * Есть картинка — показываем её, нет — фон с первой буквой названия
 * (просьба владельца 2026-09-08). Без заглушки страница домашней
 * встречи начиналась пустым местом там, где у концерта постер, и
 * выглядела недоделанной.
 *
 * Заглушка — тот же `.event-card-poster-fallback`, что рисует карточка
 * списка (`EventCard`): третьей реализации первой буквы заводить не
 * стали, у встречи и её карточки должно быть одно лицо. Крупнее только
 * сама буква — блок здесь 15rem вместо 3.9rem в строке списка, и
 * классовый размер шрифта потерялся бы в нём точкой.
 *
 * Через этот же компонент проходит и постер каталожного события — чтобы
 * разметка картинки жила в одном месте. До буквенной ветки оно не
 * доходит: колонку постера страница рисует ему только с картинкой (см.
 * event/[id]/page.tsx).
 */
export default function MeetupPoster({
  title,
  posterUrl,
}: {
  title: string;
  posterUrl: string | null;
}) {
  if (posterUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        loading="eager"
        decoding="async"
        src={posterUrl}
        alt={title}
        className="rounded-4 w-100"
        style={{ aspectRatio: "3 / 4", objectFit: "cover" }}
      />
    );
  }
  return (
    <span
      className="event-card-poster-fallback rounded-4 w-100"
      style={{ fontSize: "5rem" }}
      aria-hidden
    >
      {title.trim().charAt(0).toUpperCase()}
    </span>
  );
}
