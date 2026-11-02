/** Çok dillilik çekirdeği (Türkçe / İngilizce). React ve DOM içermez → birim testle denenebilir.
 *
 *  Yöntem: kaynak metin Türkçedir ve çeviri anahtarıdır: t("Belge bulunamadı"). İngilizce karşılıklar `en.ts` içindedir.
 *  Anahtar bulunamazsa Türkçe metin gösterilir (arayüz asla boş kalmaz). `kapsam.test.ts`, koddaki her t("…")
 *  çağrısının İngilizcesi olup olmadığını denetler; yeni bir metin eklerken `en.ts`'ye de ekleyin.
 *  Değişkenler {ad} biçiminde yazılır: t("{n} soru", { n: 5 }). */
import { EN } from "./en";

export type Lang = "tr" | "en";
export const LANGS: readonly Lang[] = ["tr", "en"] as const;
export const DEFAULT_LANG: Lang = "tr";
export const LANG_COOKIE = "lang";
export const LANG_LABEL: Record<Lang, string> = { tr: "Türkçe", en: "English" };
export const LOCALE: Record<Lang, string> = { tr: "tr-TR", en: "en-US" };

export type Params = Record<string, string | number>;

export function normLang(v: string | null | undefined): Lang {
  const p = (v ?? "").trim().toLowerCase().replace("_", "-").split("-")[0];
  return p === "en" ? "en" : p === "tr" ? "tr" : DEFAULT_LANG;
}

/** Accept-Language: "en-US,en;q=0.9,tr;q=0.8" → "en" (kalite sırasına göre ilk desteklenen dil). */
export function fromAcceptLanguage(h: string | null | undefined): Lang {
  let best: { q: number; lang: Lang } | null = null;
  for (const part of (h ?? "").split(",")) {
    const [tag, q] = part.trim().split(";q=");
    const code = tag.trim().toLowerCase().split("-")[0];
    if (code !== "tr" && code !== "en") continue;
    const w = q === undefined ? 1 : Number(q);
    if (!best || w > best.q) best = { q: Number.isFinite(w) ? w : 0, lang: code };
  }
  return best ? best.lang : DEFAULT_LANG;
}

function fill(s: string, p?: Params): string {
  return p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s;
}

export function translate(lang: Lang, text: string, params?: Params): string {
  return fill(lang === "en" ? (EN[text] ?? text) : text, params);
}

export type TFn = (text: string, params?: Params) => string;
export const makeT = (lang: Lang): TFn => (text, params) => translate(lang, text, params);

// ---- yerel biçimlendirme (tarih, sayı) ----
export const sayiYaz = (lang: Lang, n: number, o?: Intl.NumberFormatOptions) => n.toLocaleString(LOCALE[lang], o);
export const tarihYaz = (lang: Lang, d: string | number | Date, o?: Intl.DateTimeFormatOptions) =>
  new Date(d).toLocaleString(LOCALE[lang], o);
export const gunYaz = (lang: Lang, d: string | number | Date, o?: Intl.DateTimeFormatOptions) =>
  new Date(d).toLocaleDateString(LOCALE[lang], o);
