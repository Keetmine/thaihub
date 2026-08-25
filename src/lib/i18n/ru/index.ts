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
import { social } from "./social";
import { trips } from "./trips";
import { ui } from "./ui";
import { wiki } from "./wiki";
import { reviews } from "./reviews";
import type { Dict } from "../en";

/** Русский словарь; структура проверяется типом Dict. */
export const ru: Dict = { reviews, account, auth, catalog, common, events, footer, home, landing, legal, lists, nav, social, trips, ui, wiki };
