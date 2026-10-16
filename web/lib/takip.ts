// Sesli okumada "şu an okunan kelime"yi bulur. Sağlayıcılardan kelime zamanı gelmediği için kelimelerin
// zamanı, sesin GERÇEK süresine ve kelimelerin uzunluğuna/noktalamasına göre orantılı olarak hesaplanır.
// Sağlayıcıdan (edge/Azure) ve önbellekten bağımsızdır. Yaklaşıktır: birkaç kelimelik sapma olabilir.

export type Takip = {
  kelimeler: string[];
  bas: number[]; // her kelimenin başlangıcı, 0..1 (konuşma aralığına oranla)
  son: number[]; // her kelimenin bitişi, 0..1
};

export const BASLANGIC_SN = 0.2; // seslerin başındaki kısa sessizlik
export const BITIS_SN = 0.15;    // sondaki sessizlik

function agirlik(k: string): number {
  const govde = k.replace(/[.,;:!?…"'“”‘’«»()[\]{}\-–—*_]/g, "");
  const rakam = (govde.match(/\d/g) ?? []).length;
  let w = Math.max(2, govde.length) + rakam * 0.6;  // rakamlar daha uzun okunur
  const sonKarakter = k.slice(-1);
  if (/[.!?…]/.test(sonKarakter)) w += 9;           // cümle sonu duraklaması
  else if (/[,;:]/.test(sonKarakter)) w += 4;       // virgül/noktalı virgül/iki nokta duraklaması
  return w;
}

export function takipHazirla(metin: string): Takip {
  const kelimeler = metin.split(/\s+/).filter(Boolean);
  const w = kelimeler.map(agirlik);
  const toplam = w.reduce((a, b) => a + b, 0) || 1;
  const bas: number[] = [];
  const son: number[] = [];
  let acc = 0;
  for (const x of w) {
    bas.push(acc / toplam);
    acc += x;
    son.push(acc / toplam);
  }
  return { kelimeler, bas, son };
}

// Ses konumundan (sn) konuşma aralığındaki orana.
export function oranHesapla(simdi: number, sure: number): number {
  const etkin = sure - BASLANGIC_SN - BITIS_SN;
  if (!(etkin > 0)) return sure > 0 ? Math.min(1, Math.max(0, simdi / sure)) : 0;
  return Math.min(1, Math.max(0, (simdi - BASLANGIC_SN) / etkin));
}

// Orana karşılık gelen kelime sırası (ikili arama). Kelime yoksa -1.
export function kelimeBul(t: Takip, oran: number): number {
  const n = t.kelimeler.length;
  if (n === 0) return -1;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t.son[mid] > oran) hi = mid; else lo = mid + 1;
  }
  return lo;
}

// Bir kelimeye tıklanınca sesin gideceği konum (sn).
export function zamanBul(t: Takip, i: number, sure: number): number {
  const etkin = sure - BASLANGIC_SN - BITIS_SN;
  if (!(etkin > 0)) return 0;
  const j = Math.min(Math.max(i, 0), t.kelimeler.length - 1);
  return Math.min(sure, BASLANGIC_SN + t.bas[j] * etkin);
}
