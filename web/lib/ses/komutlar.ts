/** Sesli komut sözlüğü ve eşleştirici. Saf TypeScript (React/DOM yok) → birim testle denenebilir.
 *  Tanıyıcının çıktısı (ör. "özetleye", "Ozetle lütfen") yaklaşık eşleştirilir; serbest dil anlama yoktur.
 *  DİKKAT: ifadeleri değiştirirseniz api/app/stt/vocab.py içindeki ipucu listesini de güncelleyin. */

export type KomutTanimi = { id: string; ad: string; ifadeler: string[] };

export const KOMUTLAR: KomutTanimi[] = [
  // ---- her sayfada ----
  { id: "git.calisma", ad: "Çalışma alanına git", ifadeler: ["çalışma alanı", "çalışma alanına git", "ana sayfa", "ana sayfaya git", "belgelerim", "belgelerime git", "belgeler"] },
  { id: "git.hesap", ad: "Hesabıma git", ifadeler: ["hesabım", "hesabıma git", "hesap", "hesap sayfası"] },
  { id: "git.yonetim", ad: "Yönetim paneline git", ifadeler: ["yönetim", "yönetim paneli", "yönetime git"] },
  { id: "geri.sayfa", ad: "Önceki sayfaya dön", ifadeler: ["geri git", "önceki sayfa", "geri dön", "sayfada geri git"] },
  { id: "yazi.buyut", ad: "Yazıyı büyüt", ifadeler: ["yazıyı büyüt", "yazı boyutunu büyüt", "yazı büyüt", "büyüt"] },
  { id: "yazi.kucult", ad: "Yazıyı küçült", ifadeler: ["yazıyı küçült", "yazı boyutunu küçült", "yazı küçült", "küçült"] },
  { id: "tema.koyu", ad: "Koyu tema", ifadeler: ["koyu tema", "koyu mod", "karanlık mod", "karanlık tema"] },
  { id: "tema.acik", ad: "Açık tema", ifadeler: ["açık tema", "açık mod", "aydınlık mod", "aydınlık tema"] },
  { id: "tema.otomatik", ad: "Otomatik tema", ifadeler: ["otomatik tema", "varsayılan tema", "tema otomatik"] },
  { id: "yardim", ad: "Komutları listele", ifadeler: ["yardım", "ne diyebilirim", "komutlar", "komut listesi", "komutları söyle"] },
  // ---- belge sayfasında: özet ----
  { id: "ozet.olustur", ad: "Özetle", ifadeler: ["özetle", "özet çıkar", "özet oluştur", "özeti oluştur", "belgeyi özetle"] },
  { id: "ozet.kisa", ad: "Kısa özet", ifadeler: ["kısa özet", "kısa özetle", "kısa özet çıkar"] },
  { id: "ozet.orta", ad: "Orta özet", ifadeler: ["orta özet", "orta özetle", "orta özet çıkar"] },
  { id: "ozet.ayrintili", ad: "Ayrıntılı özet", ifadeler: ["ayrıntılı özet", "ayrıntılı özetle", "detaylı özet", "ayrıntılı özet çıkar"] },
  // ---- belge sayfasında: sesli okuma ----
  { id: "oku.baslat", ad: "Okumayı başlat / sürdür", ifadeler: ["oku", "okumaya başla", "sesli oku", "belgeyi oku", "özeti oku", "dinle", "devam et", "devam", "oynat", "başlat"] },
  { id: "oku.durdur", ad: "Okumayı duraklat", ifadeler: ["dur", "durdur", "duraklat", "bekle", "sus", "okumayı durdur"] },
  { id: "oku.ileri", ad: "10 saniye ileri sar", ifadeler: ["ileri sar", "10 saniye ileri", "on saniye ileri", "biraz ileri"] },
  { id: "oku.geri", ad: "10 saniye geri sar", ifadeler: ["geri sar", "10 saniye geri", "on saniye geri", "biraz geri"] },
  { id: "oku.sonraki", ad: "Sonraki bölüm", ifadeler: ["sonraki bölüm", "sonraki", "bir sonraki bölüm", "bölümü atla"] },
  { id: "oku.onceki", ad: "Önceki bölüm", ifadeler: ["önceki bölüm", "önceki", "bir önceki bölüm"] },
  { id: "oku.hizli", ad: "Daha hızlı oku", ifadeler: ["daha hızlı", "hızlı oku", "hızlandır", "hızı artır"] },
  { id: "oku.yavas", ad: "Daha yavaş oku", ifadeler: ["daha yavaş", "yavaş oku", "yavaşlat", "hızı azalt"] },
];

/** Küçük harf (tr-TR: I→ı, İ→i), aksansız, noktalamasız, tek boşluklu. */
export function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Komutla ilgisiz dolgu sözcükler ("özetler misin lütfen", "şimdi oku")
const DOLGU = new Set(["lutfen", "simdi", "asistan", "hadi", "bana", "bir", "rica", "ederim", "misin", "musun", "misiniz", "musunuz", "tamam", "su", "bakalim"]);

function temizle(n: string): string {
  return n.split(" ").filter((t) => t && !DOLGU.has(t)).join(" ");
}

export function mesafe(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function benzerlik(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - mesafe(a, b) / m;
}

const ESIK = 0.8;       // kabul için en düşük benzerlik
const FARK = 0.07;      // farklı bir komutla arasındaki en az fark (yoksa belirsiz sayılır)

const HAZIR = KOMUTLAR.map((k) => ({ ...k, norm: k.ifadeler.map((x) => temizle(normalize(x))) }));

function skorla(heard: string, ifade: string): number {
  let s = benzerlik(heard, ifade);
  const hl = heard.length, il = ifade.length;
  if (ifade.includes(" ")) {
    // Çok sözcüklü ifade, daha uzun bir cümlenin içinde (bitişik) geçiyorsa eşleşir. Puan, ifadenin cümleyi
    // ne kadar kapladığına bağlıdır; böylece tam eşleşen uzun ifade, içindeki kısa ifadeye her zaman baskın gelir.
    if ((` ${heard} `).includes(` ${ifade} `)) s = Math.max(s, 0.8 + 0.2 * (il / hl));
  } else if (il >= 5 && !heard.includes(" ") && heard.startsWith(ifade) && hl - il <= 3) {
    s = Math.max(s, 0.9);   // çekim eki almış biçim: "özetleyin", "durdurun" (kısa sözcüklerde kapalı: "okul" ≠ "oku")
  }
  return s;
}

export type Sonuc =
  | { durum: "ok"; id: string; ad: string; skor: number }
  | { durum: "bos" }
  | { durum: "belirsiz"; adaylar: string[] }
  | { durum: "yok" };

/** `uygun`: o an bir işleyicisi olan komut kimlikleri (sayfa/bağlama göre değişir). */
export function esles(metin: string, uygun: Iterable<string>): Sonuc {
  const heard = temizle(normalize(metin));
  if (!heard) return { durum: "bos" };
  const izinli = new Set(uygun);
  const skorlar = HAZIR.filter((k) => izinli.has(k.id))
    .map((k) => ({ id: k.id, ad: k.ad, skor: Math.max(...k.norm.map((x) => skorla(heard, x))) }))
    .sort((a, b) => b.skor - a.skor);
  const [en, ikinci] = skorlar;
  if (!en || en.skor < ESIK) return { durum: "yok" };
  // Tam eşleşme belirsiz olamaz; yakın puanlar yalnızca yaklaşık eşleşmelerde belirsizlik sayılır
  if (en.skor < 0.999 && ikinci && ikinci.skor >= ESIK && en.skor - ikinci.skor < FARK) {
    return { durum: "belirsiz", adaylar: [en.ad, ikinci.ad] };
  }
  return { durum: "ok", id: en.id, ad: en.ad, skor: en.skor };
}
