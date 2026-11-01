import { evetHayir } from "./komutlar";

/** Komut işleyici kayıt defteri. Bileşenler kendi komutlarını bağlar, ayrılınca siler; böylece
 *  bir komut yalnızca ilgili bileşen ekrandayken "uygun" sayılır (bağlama duyarlı). */

/** `false` döndürmek "bu komut bende değil, sıradakine geç" demektir. */
export type Isleyici = () => boolean | void | Promise<boolean | void>;
type Girdi = { id: string; fn: Isleyici; oncelik: number; sira: number };

const girdiler: Girdi[] = [];
let sayac = 0;

export function kaydet(id: string, fn: Isleyici, oncelik = 0): () => void {
  const g: Girdi = { id, fn, oncelik, sira: ++sayac };
  girdiler.push(g);
  return () => {
    const i = girdiler.indexOf(g);
    if (i >= 0) girdiler.splice(i, 1);
  };
}

export function uygunIdler(): Set<string> {
  return new Set(girdiler.map((g) => g.id));
}

/** Önce yüksek öncelik, eşitse en son kaydedilen denenir; ilk `false` olmayan işleyici komutu üstlenir. */
export async function calistir(id: string): Promise<boolean> {
  const adaylar = girdiler.filter((g) => g.id === id).sort((a, b) => b.oncelik - a.oncelik || b.sira - a.sira);
  for (const g of adaylar) {
    if ((await g.fn()) !== false) return true;
  }
  return false;
}

// Mikrofon açılırken sesli okumanın kendi sesini komut sanmaması için oynatıcılar duraklatılır
const mikrofonDinleyicileri = new Set<() => void>();
export function mikrofonAcilinca(fn: () => void): () => void {
  mikrofonDinleyicileri.add(fn);
  return () => { mikrofonDinleyicileri.delete(fn); };
}
export function mikrofonuBildir(): void {
  mikrofonDinleyicileri.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------------------------
// Sonuç duyurusu: bileşenler komut sonucunu (ör. "B şıkkı işaretlendi. Soru 3 …") ekran okuyucuya iletir.
// SesDugmesi'nin canlı bölgesi tek kanaldır; bileşen duyuru yaptıysa genel "Anlaşıldı" mesajı verilmez.
let duyurucu: ((metin: string) => void) | null = null;
let duyuruN = 0;
export function duyuruAyarla(fn: (metin: string) => void): () => void {
  duyurucu = fn;
  return () => { if (duyurucu === fn) duyurucu = null; };
}
export function sesDuyur(metin: string): void {
  duyuruN++;
  duyurucu?.(metin);
}
export function duyuruSayaci(): number {
  return duyuruN;
}

// ---------------------------------------------------------------------------------------------
// Komut sözlüğüne sığmayanlar: belge adı, "3. soruya git", "10 soruluk zor test oluştur" gibi serbest cümleler.
// Tam eşleşen sabit komut her zaman önce çalışır; işleyici ilgilenmiyorsa `false` döner.
type MetinGirdi = { fn: (metin: string) => boolean | Promise<boolean>; oncelik: number; sira: number };
const metinler: MetinGirdi[] = [];
export function metinKaydet(fn: MetinGirdi["fn"], oncelik = 0): () => void {
  const g: MetinGirdi = { fn, oncelik, sira: ++sayac };
  metinler.push(g);
  return () => {
    const i = metinler.indexOf(g);
    if (i >= 0) metinler.splice(i, 1);
  };
}
export async function metinDene(metin: string): Promise<boolean> {
  const sirali = [...metinler].sort((a, b) => b.oncelik - a.oncelik || b.sira - a.sira);
  for (const g of sirali) {
    if (await g.fn(metin)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Takip konuşması: komut, kullanıcıdan bir cümle daha ister (soru metni, evet/hayır, "hangisi?").
// SesDugmesi komuttan sonra bunu görür, kısa bir bekleme + bip ile mikrofonu KENDİLİĞİNDEN yeniden açar.
export type DikteIstegi = { istem: string; uygula: (metin: string) => void | Promise<void> };
let bekleyenDikte: DikteIstegi | null = null;
export function dikteIste(d: DikteIstegi): void {
  bekleyenDikte = d;
}
export function dikteAl(): DikteIstegi | null {
  const d = bekleyenDikte;
  bekleyenDikte = null;
  return d;
}

/** Geri alınamaz işlemler için sesli onay: "… silinsin mi? Evet ya da hayır deyin." */
export function onayIste(istem: string, evet: () => void | Promise<void>): void {
  dikteIste({
    istem,
    uygula: async (m) => {
      const c = evetHayir(m);
      if (c === "evet") await evet();
      else sesDuyur(c === "hayir" ? "Vazgeçildi." : "Yanıt anlaşılamadı, işlem yapılmadı.");
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Tanıyıcıya ipucu: ekrandaki özel adlar (ör. belge başlıkları). Dosya adları sıradan sözcük olmadığı için
// ipucu verilmezse en çok yanılınan yerdir.
const ipucuKaynaklari = new Set<() => string[]>();
export function ipucuKaydet(fn: () => string[]): () => void {
  ipucuKaynaklari.add(fn);
  return () => { ipucuKaynaklari.delete(fn); };
}
export function ipuclari(): string[] {
  const out: string[] = [];
  ipucuKaynaklari.forEach((f) => f().forEach((s) => { if (s && !out.includes(s)) out.push(s); }));
  return out.slice(0, 15);
}
