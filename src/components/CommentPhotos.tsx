import UploadImage from "@/components/UploadImage";

/**
 * Картинки под комментарием — общий показ для отзывов о событии (АА20)
 * и обсуждений в сообществе.
 *
 * Серверный компонент: показывать нечего кроме картинок, клиентский код
 * тут лишний. Каждая — ссылка на полный размер: в ленте они мелкие, а
 * рассмотреть кадр с концерта хочется.
 */
export default function CommentPhotos({
  photos,
}: {
  photos: { id: string; url: string }[];
}) {
  if (photos.length === 0) return null;
  return (
    <div className="comment-photos">
      {photos.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer">
          <UploadImage src={p.url} alt="" sizes="8rem" />
        </a>
      ))}
    </div>
  );
}
