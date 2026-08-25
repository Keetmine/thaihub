import { auth } from "./auth";
import { catalog } from "./catalog";
import { common } from "./common";
import { events } from "./events";
import { footer } from "./footer";
import { home } from "./home";
import { landing } from "./landing";
import { legal } from "./legal";
import { nav } from "./nav";
import { ui } from "./ui";

/**
 * Английский словарь — эталон структуры: русский обязан её
 * повторять, поэтому забытый ключ ловится типами. Разделы лежат
 * по файлам, чтобы над переводом можно было работать
 * параллельно, не сталкиваясь в одном файле.
 */
export const en = { auth, catalog, common, events, footer, home, landing, legal, nav, ui };

export type Dict = typeof en;
