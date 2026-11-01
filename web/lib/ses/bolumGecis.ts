/** Bölümler arası sesli geçiş: başka bir bölümdeyken söylenen "pekiştirme testi", "10 soruluk zor test oluştur" ya da
 *  "soru sor" komutu istekle birlikte ilgili bölüme geçer; hedef bileşen açılınca isteği bir kez alıp uygular.
 *  Bellekte tutulur (URL'ye yazılmaz); böylece sayfa yenilenince test yeniden üretilmez. */
export type BolumIstegi =
  | { tur: "test"; adet?: 5 | 10; zorluk?: "easy" | "medium" | "hard" }
  | { tur: "soru"; metin: string };

const GECERLILIK_MS = 30_000;
let bekleyen: { belgeId: string; istek: BolumIstegi; zaman: number } | null = null;

export function istekBirak(belgeId: string, istek: BolumIstegi): void {
  bekleyen = { belgeId, istek, zaman: Date.now() };
}

/** İstek bu belge ve türdeyse döndürür ve siler; eskimiş ya da başka belgeye aitse null. */
export function istekAl<T extends BolumIstegi["tur"]>(belgeId: string, tur: T): Extract<BolumIstegi, { tur: T }> | null {
  const b = bekleyen;
  if (!b) return null;
  if (Date.now() - b.zaman > GECERLILIK_MS) { bekleyen = null; return null; }
  if (b.belgeId !== belgeId || b.istek.tur !== tur) return null;
  bekleyen = null;
  return b.istek as Extract<BolumIstegi, { tur: T }>;
}

export function bekleyenTemizle(): void {
  bekleyen = null;
}
