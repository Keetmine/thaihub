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
import type { Dict } from "../en";

/** Русский словарь; структура проверяется типом Dict. */
export const ru: Dict = { auth, catalog, common, events, footer, home, landing, legal, nav, ui };
