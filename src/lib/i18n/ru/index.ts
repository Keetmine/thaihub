import { common } from "./common";
import { footer } from "./footer";
import { home } from "./home";
import { nav } from "./nav";
import type { Dict } from "../en";

/** Русский словарь; структура проверяется типом Dict. */
export const ru: Dict = { common, footer, home, nav };
