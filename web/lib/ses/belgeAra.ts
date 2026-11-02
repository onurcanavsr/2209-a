/** Çalışma alanında "staj raporunu aç" gibi sözlerden belgeyi bulur. Saf fonksiyon: birim testle denenir.
 *  Dosya adları genelde "Staj_Raporu_Final-2.docx" gibidir; uzantı ve ayraçlar atılır, sözcük sözcük
 *  yaklaşık eşleştirilir ("raporunu" ≈ "rapor"). */
import { benzerlik, normalize, type Dil } from "./komutlar";

export type BelgeAday = { id: string; title: string };
export type BelgeSonuc<T extends BelgeAday = BelgeAday> =
  | { durum: "ok"; belge: T }
  | { durum: "belirsiz"; adaylar: T[] }
  | { durum: "yok" };

const DOLGU = new Set([
  "ac", "acar", "acin", "aciniz", "git", "goster", "getir", "belge", "belgeyi", "belgesini", "belgesi", "belgem", "belgemi",
  "dosya", "dosyayi", "dosyasini", "dosyasi", "dosyam", "dosyami", "lutfen", "simdi", "bana", "bir", "misin", "musun", "hadi",
  "tamam", "su", "bakalim", "adli", "isimli", "olan", "olani", "olanini", "diger", "digeri", "onu", "sunu", "bunu",
  "sil", "silin", "silinsin", "kaldir", "kaldirin",
]);
const SILME = /^(sil|silin|silinsin|kaldir|kaldirin)/;
const SILME_EN = /^(delete|remove|erase|trash)/;
const DOLGU_EN = new Set([
  "open", "go", "show", "get", "document", "doc", "file", "please", "now", "me", "the", "my", "called", "named", "that", "one", "other",
  "it", "this", "just", "ok", "okay", "hey", "delete", "remove", "erase", "to", "up", "for", "load", "pull",
]);
const SIRA_EN: Record<string, number> = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9 };
const SIRA: Record<string, number> = {
  birinci: 0, ilk: 0, ikinci: 1, ucuncu: 2, dorduncu: 3, besinci: 4, altinci: 5, yedinci: 6, sekizinci: 7, dokuzuncu: 8, onuncu: 9,
};

/** Okunabilir ad: uzantı ve alt çizgi/tire atılır ("Staj_Raporu.docx" → "Staj Raporu"). Tanıyıcıya ipucu olarak da gider. */
export function baslikOku(title: string): string {
  return title.replace(/\.(pdf|docx?|pptx?)$/i, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

export function belgeFiil(metin: string, lang: Dil = "tr"): "sil" | "ac" {
  const rx = lang === "en" ? SILME_EN : SILME;
  return normalize(metin).split(" ").some((t) => rx.test(t)) ? "sil" : "ac";
}

function tokenSkor(h: string, t: string): number {
  if (/^\d+$/.test(h) || /^\d+$/.test(t)) return h === t ? 1 : 0;     // sayılar tam eşleşmeli ("2024" ≠ "2025")
  let s = benzerlik(h, t);
  if (t.length >= 4 && h.startsWith(t) && h.length - t.length <= 3) s = Math.max(s, 0.9);   // çekim eki: raporunu
  return s;
}

export function belgeAra<T extends BelgeAday>(metin: string, belgeler: T[], lang: Dil = "tr"): BelgeSonuc<T> {
  if (belgeler.length === 0) return { durum: "yok" };
  const en = lang === "en";
  const dolgu = en ? DOLGU_EN : DOLGU, siraTablo = en ? SIRA_EN : SIRA;
  const tum = normalize(metin).split(" ").filter(Boolean);

  // "ikinci belge", "ilk dosya", "son belge" — adı olmayan/zor dosyalar için sıra numarasıyla
  const belgeSozu = tum.some((t) => (en ? /^(document|doc|file)/ : /^(belge|dosya)/).test(t));
  if (belgeSozu) {
    const sira = tum.find((t) => t in siraTablo);
    if (sira !== undefined && siraTablo[sira] < belgeler.length) return { durum: "ok", belge: belgeler[siraTablo[sira]] };
    if (tum.some((t) => t === "son" || t === "sonuncu" || t === "last" || t === "latest")) return { durum: "ok", belge: belgeler[belgeler.length - 1] };
  }

  const heard = tum.filter((t) => !dolgu.has(t) && (t.length >= 2 || /^\d$/.test(t)));
  if (heard.length === 0) return { durum: "yok" };

  const adaylar = belgeler.map((b) => {
    const bt = normalize(baslikOku(b.title)).split(" ").filter(Boolean);
    const esleme = heard.map((h) => Math.max(0, ...bt.map((t) => tokenSkor(h, t))));
    const tamam = esleme.every((s) => s >= 0.8);
    const kullanilan = new Set<string>();
    heard.forEach((h) => { const en = bt.find((t) => tokenSkor(h, t) >= 0.8); if (en) kullanilan.add(en); });
    const kapsam = bt.length ? kullanilan.size / bt.length : 0;
    const ort = esleme.reduce((a, b) => a + b, 0) / esleme.length;
    return { b, tamam, skor: ort * (0.5 + 0.5 * kapsam) };
  }).filter((x) => x.tamam && x.skor >= 0.5).sort((a, b) => b.skor - a.skor);

  if (adaylar.length === 0) return { durum: "yok" };
  if (adaylar.length === 1 || adaylar[0].skor - adaylar[1].skor >= 0.08) return { durum: "ok", belge: adaylar[0].b };
  return { durum: "belirsiz", adaylar: adaylar.slice(0, 3).map((x) => x.b) };
}
