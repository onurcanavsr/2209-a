/** Belge türü etiketi ve dosya adından uzantı temizleme (YouTube başlıklarında uzantı olmaz; "v2.0" gibi sonları kesmemeli). */
export const kindAd = (k: string): string => (k === "youtube" ? "YouTube" : k.toUpperCase());
export const uzantisiz = (t: string): string => t.replace(/\.(pdf|docx|pptx)$/i, "");
