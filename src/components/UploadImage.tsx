import { blurUrl, uploadSrcSet } from "@/lib/imageVariants";

/**
 * Картинка из /uploads с уменьшенными копиями.
 *
 * Зачем. Оригиналы у нас 500–900 пикселей по ширине, а в списках
 * показываются мелко: постер в строке афиши занимает 62 пикселя.
 * Двадцать оригиналов на экран — больше мегабайта ради картинок
 * размером с ноготь. Копии лежат рядом с оригиналом
 * (`poster-200.webp`); их кладёт `writeWebpVariants` при сохранении, а
 * старым файлам досыпает `scripts/generate-image-variants.ts`.
 *
 * Почему не next/image. Файлы в /uploads раздаёт Caddy прямо с диска, а
 * Next знает только то, что лежало в public/ на момент сборки. Гонять
 * их через оптимизатор — значит вернуть в цепочку приложение с его
 * процессором там, где сейчас работает статика с вечным кэшем.
 *
 * Копии может не быть: у картинки мельче ступени её не создают, старым
 * файлам могли ещё не досыпать. Это не беда — `srcset` для браузера
 * подсказка: не найдя копию, он возьмёт `src`.
 */
export default function UploadImage({
  src,
  alt,
  sizes,
  className,
  style,
  loading = "lazy",
  blur = false,
}: {
  src: string;
  alt: string;
  /** Сколько места картинка займёт — по этому браузер выбирает копию.
   *  Без него он считает, что во всю ширину окна, и берёт оригинал. */
  sizes: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "lazy" | "eager";
  /** Подложить размытую заглушку, пока грузится сама картинка. Имеет
   *  смысл на крупных одиночных картинках — постер карточки, шапка.
   *  В списках не нужен: там копии по десять килобайт, а заглушка
   *  добавила бы по запросу на каждую строку. */
  blur?: boolean;
}) {
  const srcSet = uploadSrcSet(src);
  const placeholder = blur ? blurUrl(src) : null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      // srcSet без sizes бесполезен: браузер примет ширину места за
      // ширину окна и всегда возьмёт самый большой файл.
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      style={
        placeholder
          ? {
              // Заглушка — фоном под самой картинкой: когда та
              // догрузится, она её просто перекроет, и подменять
              // ничего не нужно.
              backgroundImage: `url(${placeholder})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              ...style,
            }
          : style
      }
    />
  );
}
