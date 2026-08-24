// Плавное появление контента при переходе между разделами (Э2.5).
// template.tsx получает свой ключ на уровне сегмента и перемонтируется,
// когда меняется раздел — CSS-анимация из .page-fade запускается заново
// сама, без библиотек и клиентского кода. Search params и уход вглубь
// (например /artists → /artists/mile) перемонтирования не вызывают, так
// что поиск с ?q= и открытие карточки не мигают.
//
// Анимация — только opacity: transform на обёртке сделал бы её
// containing block'ом для position: sticky/fixed внутри страниц
// (.nav-sticky, алфавитный указатель, липкая панель сохранения).
export default function PublicTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="page-fade">{children}</div>;
}
