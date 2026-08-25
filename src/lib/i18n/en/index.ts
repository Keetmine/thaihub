import { common } from "./common";
import { footer } from "./footer";
import { home } from "./home";
import { nav } from "./nav";

/**
 * Английский словарь — эталон структуры: русский обязан её
 * повторять, поэтому забытый ключ ловится типами. Разделы лежат
 * по файлам, чтобы над переводом можно было работать
 * параллельно, не сталкиваясь в одном файле.
 */
export const en = { common, footer, home, nav };

export type Dict = typeof en;
