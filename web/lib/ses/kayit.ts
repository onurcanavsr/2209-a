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
