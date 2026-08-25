import { account } from "./account";
import { auth } from "./auth";
import { catalog } from "./catalog";
import { common } from "./common";
import { events } from "./events";
import { footer } from "./footer";
import { home } from "./home";
import { landing } from "./landing";
import { legal } from "./legal";
import { lists } from "./lists";
import { nav } from "./nav";
import { notifications } from "./notifications";
import { social } from "./social";
import { trips } from "./trips";
import { ui } from "./ui";
import { wiki } from "./wiki";
import { reviews } from "./reviews";
import { widgets } from "./widgets";

/**
 * Английский словарь — эталон структуры: русский обязан её
 * повторять, поэтому забытый ключ ловится типами. Разделы лежат
 * по файлам, чтобы над переводом можно было работать
 * параллельно, не сталкиваясь в одном файле.
 */
export const en = { widgets, reviews, account, auth, catalog, common, events, footer, home, landing, legal, lists, nav, notifications, social, trips, ui, wiki };

export type Dict = typeof en;
