import { account } from "./account";
import { auth } from "./auth";
import { catalog } from "./catalog";
import { common } from "./common";
import { events } from "./events";
import { filters } from "./filters";
import { footer } from "./footer";
import { home } from "./home";
import { landing } from "./landing";
import { legal } from "./legal";
import { lists } from "./lists";
import { mdlImport } from "./mdlImport";
import { nav } from "./nav";
import { notifications } from "./notifications";
import { social } from "./social";
import { trips } from "./trips";
import { ui } from "./ui";
import { wiki } from "./wiki";
import { reviews } from "./reviews";
import type { Dict } from "../en";
import { widgets } from "./widgets";

/** Русский словарь; структура проверяется типом Dict. */
export const ru: Dict = { widgets, reviews, account, auth, catalog, common, events, filters, footer, home, landing, legal, lists, mdlImport, nav, notifications, social, trips, ui, wiki };
