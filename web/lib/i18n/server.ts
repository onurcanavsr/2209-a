import { cookies, headers } from "next/headers";
import { DEFAULT_LANG, fromAcceptLanguage, LANG_COOKIE, makeT, normLang, type Lang, type TFn } from "./core";

/** Sunucu bileşenlerinde dil: çerez (kullanıcının seçimi) → tarayıcının Accept-Language'i → Türkçe. */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (c) return normLang(c);
  return fromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LANG;
}

export async function getT(): Promise<{ t: TFn; lang: Lang }> {
  const lang = await getLang();
  return { t: makeT(lang), lang };
}
