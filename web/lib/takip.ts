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

// ---- Seslendirilen kelimeleri ekrandaki kelimelerle eşleştirme ----
const norm = (w: string) => w.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");

// konusulan[i] → ekrandaki kelime sırası (eşleşmezse -1). Metinler noktalama ve biçim açısından
// birebir aynı olmadığı için (ör. eklenen noktalar, "Slayt 3", tablo ayraçları) sırayla ve
// önce yakın, bulunamazsa uzak bir aralıkta aranır; böylece küçük farklar sonraki kelimeleri kaydırmaz.
export function hizala(konusulan: string[], gorunen: string[]): Int32Array {
  const hedef: { n: string; i: number }[] = [];
  gorunen.forEach((w, i) => { const n = norm(w); if (n) hedef.push({ n, i }); });
  const map = new Int32Array(konusulan.length).fill(-1);
  const YAKIN = 8, UZAK = 80;
  let j = 0;
  for (let k = 0; k < konusulan.length; k++) {
    const n = norm(konusulan[k]);
    if (!n) continue;
    let bulunan = -1;
    for (let d = j; d < Math.min(hedef.length, j + YAKIN); d++) if (hedef[d].n === n) { bulunan = d; break; }
    if (bulunan < 0 && n.length >= 5) {
      for (let d = j + YAKIN; d < Math.min(hedef.length, j + UZAK); d++) if (hedef[d].n === n) { bulunan = d; break; }
    }
    if (bulunan >= 0) { map[k] = hedef[bulunan].i; j = bulunan + 1; continue; }
    // Seslendirme tek ekran kelimesini birkaça bölmüş olabilir (ör. "snake_case" → "snake case"):
    // ardışık 2-3 konuşulan kelimenin birleşimi ekrandaki kelimeyle eşleşirse hepsi ona bağlanır.
    for (const uzun of [2, 3]) {
      if (k + uzun > konusulan.length) break;
      const birlesik = konusulan.slice(k, k + uzun).map(norm).join("");
      let d = j;
      for (; d < Math.min(hedef.length, j + YAKIN); d++) if (hedef[d].n === birlesik) break;
      if (d < Math.min(hedef.length, j + YAKIN)) {
        for (let x = k; x < k + uzun; x++) map[x] = hedef[d].i;
        j = d + 1; k += uzun - 1;
        break;
      }
    }
  }
  return map;
}

