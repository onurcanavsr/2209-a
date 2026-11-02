import type { TFn } from "./i18n/core";

/** Belge türü etiketi ve dosya adından uzantı temizleme (YouTube başlıklarında uzantı olmaz; "v2.0" gibi sonları kesmemeli). */
export const kindAd = (k: string): string => (k === "youtube" ? "YouTube" : k.toUpperCase());
export const uzantisiz = (t: string): string => t.replace(/\.(pdf|docx|pptx)$/i, "");

/** "12 sayfa" / "8 slayt" etiketi (dile göre). */
export const sayfaYazi = (t: TFn, d: { page_count?: number | null; kind: string }): string =>
  d.page_count ? t(d.kind === "pptx" ? "{n} slayt" : "{n} sayfa", { n: d.page_count }) : "";
