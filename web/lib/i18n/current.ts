import { normLang, translate, type Lang, type Params } from "./core";

/** React dışı kodda (api.ts, ses kaydı) geçerli dil: <html lang> (LangProvider her değişimde günceller). */
export function currentLang(): Lang {
  return typeof document === "undefined" ? "tr" : normLang(document.documentElement.lang);
}

/** React dışı kodda çeviri: tNow("Vazgeçildi.") — geçerli arayüz diliyle. */
export const tNow = (text: string, params?: Params): string => translate(currentLang(), text, params);
