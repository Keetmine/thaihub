import L from "leaflet";

// Маркеры рисуем сами (divIcon), а не картинками: leaflet'овские синие
// «капли» выбивались из палитры сайта, а перекрашивать PNG на лету
// нельзя. Заодно это снимает зависимость от файлов в /public/leaflet
// для самих иконок (тень оттуда больше не нужна).

function pinHtml(color: string): string {
  return `
    <svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 11.6 23.4 12.1 24 .2.3.6.3.8 0C13.4 36.4 26 22.2 26 13 26 5.8 20.2 0 13 0z"
            fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
      <circle cx="13" cy="13" r="5" fill="rgba(0,0,0,.45)"/>
    </svg>`;
}

function pin(color: string, className: string) {
  return L.divIcon({
    html: pinHtml(color),
    className: `map-pin ${className}`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -32],
  });
}

/** Локации съёмок из каталога — фирменный оранжевый. */
export const defaultIcon = pin("#ff7a45", "map-pin-catalog");

/** Места, добавленные самим пользователем, — другим цветом, чтобы на
 *  общей карте было видно, где свои находки, а где съёмочные площадки. */
export const userPlaceIcon = pin("#5ec8f2", "map-pin-user");
