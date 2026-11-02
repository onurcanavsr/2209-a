/** Sesli komut sözlüğü ve eşleştirici (Türkçe + İngilizce). Saf TypeScript (React/DOM yok) → birim testle denenebilir.
 *  Türkçe tablo aşağıdadır; İngilizcesi `komutlar.en.ts` içindedir. Her işlev `lang` alır (varsayılan "tr").
 *  Tanıyıcının çıktısı (ör. "özetleye", "Ozetle lütfen") yaklaşık eşleştirilir; serbest dil anlama yoktur.
 *  DİKKAT: ifadeleri değiştirirseniz api/app/stt/vocab.py içindeki ipucu listesini de güncelleyin. */

import { DOLGU_EN, EVET_EN, HAYIR_EN, KOMUTLAR_EN, SAYI_KELIME_EN, SIRA_KELIME_EN } from "./komutlar.en";

export type Dil = "tr" | "en";
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
  { id: "cikis", ad: "Çıkış yap", ifadeler: ["çıkış yap", "oturumu kapat", "çıkış", "hesaptan çık"] },
  { id: "yardim", ad: "Komutları listele", ifadeler: ["yardım", "ne diyebilirim", "komutlar", "komut listesi", "komutları söyle"] },
  { id: "dil.tr", ad: "Türkçeye geç", ifadeler: ["türkçeye geç", "türkçe", "dili türkçe yap", "türkçe konuş"] },
  { id: "dil.en", ad: "İngilizceye geç", ifadeler: ["ingilizceye geç", "ingilizce", "dili ingilizce yap", "ingilizce konuş"] },
  // ---- belge sayfasında: bölümlere geçiş (sol menüdeki bölümler) ----
  { id: "bolum.soru", ad: "Belgeye soru sor bölümü", ifadeler: ["soru sorma bölümü", "soru cevap bölümü", "soru cevap", "belgeye soru sor bölümü"] },
  { id: "bolum.ozet", ad: "Özet bölümü", ifadeler: ["özet bölümü", "özete git", "özet sayfası"] },
  { id: "bolum.test", ad: "Pekiştirme testi bölümü", ifadeler: ["teste git", "test bölümü", "pekiştirme testi bölümü", "pekiştirme testine git"] },
  { id: "bolum.dinle", ad: "Metni dinle bölümü", ifadeler: ["metni dinle", "metni dinle bölümü", "dinleme bölümü"] },
  { id: "bolum.metin", ad: "Çıkarılan metin bölümü", ifadeler: ["çıkarılan metin", "metne git", "metin bölümü"] },
  { id: "bolum.notlar", ad: "Notlarım bölümü", ifadeler: ["notlarım", "notlarıma git", "notlar"] },
  { id: "bolum.kartlar", ad: "Öğrenme kartları bölümü", ifadeler: ["öğrenme kartları", "kartlarıma git", "kartlar"] },
  { id: "bolum.imler", ad: "Yer imleri bölümü", ifadeler: ["yer imleri", "yer imlerime git", "yer imlerim"] },
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
  // ---- çalışma alanı ----
  { id: "belge.listele", ad: "Belgeleri listele", ifadeler: ["belgeleri listele", "belgelerimi listele", "belgelerimi oku", "belgeleri oku", "hangi belgeler var", "belgelerimi say"] },
  { id: "belge.yukle", ad: "Dosya yükle", ifadeler: ["belge yükle", "dosya yükle", "dosya seç", "yeni belge yükle", "belge ekle"] },
  // ---- belge sayfası: belgeyi sil ----
  { id: "belge.sil", ad: "Belgeyi sil", ifadeler: ["belgeyi sil", "bu belgeyi sil", "dosyayı sil"] },
  // ---- belge sayfası: belgeye soru sor ----
  { id: "soru.sor", ad: "Belgeye soru sor", ifadeler: ["soru sor", "bir soru sor", "belgeye soru sor", "soru soracağım", "soru sormak istiyorum"] },
  { id: "cevap.oku", ad: "Son cevabı oku", ifadeler: ["cevabı oku", "son cevabı oku", "cevabı tekrar oku", "cevap"] },
  { id: "qa.temizle", ad: "Soru geçmişini sil", ifadeler: ["soru geçmişini sil", "geçmişi temizle", "soru cevap geçmişini temizle"] },
  // ---- belge sayfası: pekiştirme testi ----
  { id: "test.olustur", ad: "Pekiştirme testi oluştur", ifadeler: ["pekiştirme testi", "pekiştirme testi oluştur", "pekiştirme testi başlat", "test oluştur", "yeni test", "yeni test oluştur", "testi başlat", "test başlat", "test hazırla", "quiz başlat"] },
  { id: "test.kolay", ad: "Zorluk: kolay", ifadeler: ["kolay", "kolay test", "kolay zorluk", "zorluk kolay"] },
  { id: "test.orta", ad: "Zorluk: orta", ifadeler: ["orta", "orta test", "orta zorluk", "zorluk orta"] },
  { id: "test.zor", ad: "Zorluk: zor", ifadeler: ["zor", "zor test", "zorluk zor"] },
  { id: "test.bes", ad: "5 soru", ifadeler: ["beş soru", "5 soru", "beş soruluk", "5 soruluk"] },
  { id: "test.on", ad: "10 soru", ifadeler: ["on soru", "10 soru", "on soruluk", "10 soruluk"] },
  { id: "sik.1", ad: "A şıkkını işaretle", ifadeler: ["a şıkkı", "a", "şık a", "a seçeneği", "birinci şık", "birinci", "birinci seçenek", "1"] },
  { id: "sik.2", ad: "B şıkkını işaretle", ifadeler: ["b şıkkı", "be şıkkı", "b", "be", "şık b", "b seçeneği", "ikinci şık", "ikinci", "ikinci seçenek", "2"] },
  { id: "sik.3", ad: "C şıkkını işaretle", ifadeler: ["c şıkkı", "ce şıkkı", "c", "ce", "şık c", "c seçeneği", "üçüncü şık", "üçüncü", "üçüncü seçenek", "3"] },
  { id: "sik.4", ad: "D şıkkını işaretle", ifadeler: ["d şıkkı", "de şıkkı", "d", "de", "şık d", "d seçeneği", "dördüncü şık", "dördüncü", "dördüncü seçenek", "4"] },
  { id: "test.sonraki", ad: "Sonraki soru", ifadeler: ["sonraki soru", "bir sonraki soru", "soruyu atla", "geç"] },
  { id: "test.onceki", ad: "Önceki soru", ifadeler: ["önceki soru", "bir önceki soru"] },
  { id: "test.oku", ad: "Soruyu ve şıkları oku", ifadeler: ["soruyu oku", "soruyu tekrar oku", "soruyu tekrarla", "şıkları oku", "soru ve şıkları oku"] },
  { id: "test.bitir", ad: "Testi bitir", ifadeler: ["testi bitir", "testi tamamla", "sonucu göster", "bitir", "testi bitir ve sonucu göster"] },
  { id: "test.sonuc", ad: "Sonucu oku", ifadeler: ["sonucu oku", "sonucum ne", "kaç doğru yaptım", "puanım"] },
  { id: "test.yanlis", ad: "Yanlışları açıkla", ifadeler: ["yanlışları oku", "yanlışları açıkla", "yanlış cevapları oku", "açıklamaları oku"] },
  { id: "test.tekrar", ad: "Testi tekrar çöz", ifadeler: ["testi tekrar çöz", "aynı testi tekrar çöz", "tekrar çöz"] },
  { id: "test.sil", ad: "Testi sil", ifadeler: ["testi sil", "bu testi sil"] },
];

/** Küçük harf (tr-TR: I→ı, İ→i; ı sonra i'ye indirilir, İngilizce metinde de aynı sonucu verir), aksansız, noktalamasız, tek boşluklu. */
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
const DOLGU_TR = new Set(["lutfen", "simdi", "asistan", "hadi", "bana", "bir", "rica", "ederim", "misin", "musun", "misiniz", "musunuz", "tamam", "su", "bakalim"]);
const DOLGU_SET: Record<Dil, Set<string>> = { tr: DOLGU_TR, en: new Set(DOLGU_EN) };

function temizle(n: string, lang: Dil = "tr"): string {
  const d = DOLGU_SET[lang];
  return n.split(" ").filter((t) => t && !d.has(t)).join(" ");
}

/** Dile göre komut tablosu. İngilizce tabloda eksik kimlik olursa Türkçesi kullanılır (komut asla kaybolmaz). */
export function komutlari(lang: Dil = "tr"): KomutTanimi[] {
  if (lang !== "en") return KOMUTLAR;
  return KOMUTLAR.map((k) => ({ id: k.id, ...(KOMUTLAR_EN[k.id] ?? { ad: k.ad, ifadeler: k.ifadeler }) }));
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

const HAZIR_ONBELLEK: Partial<Record<Dil, (KomutTanimi & { norm: string[] })[]>> = {};
function hazir(lang: Dil) {
  return (HAZIR_ONBELLEK[lang] ??= komutlari(lang).map((k) => ({ ...k, norm: k.ifadeler.map((x) => temizle(normalize(x), lang)) })));
}

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
export function esles(metin: string, uygun: Iterable<string>, lang: Dil = "tr"): Sonuc {
  const heard = temizle(normalize(metin), lang);
  if (!heard) return { durum: "bos" };
  const izinli = new Set(uygun);
  const skorlar = hazir(lang).filter((k) => izinli.has(k.id))
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


// ---------------------------------------------------------------------------------------------
// Parametreli ifadeler ve onay: sabit sözlüğe sığmayanlar

const SAYI_KELIME: Record<string, number> = {
  bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
};
const SIRA_KELIME: Record<string, number> = {
  birinci: 1, ilk: 1, ikinci: 2, ucuncu: 3, dorduncu: 4, besinci: 5, altinci: 6, yedinci: 7, sekizinci: 8, dokuzuncu: 9, onuncu: 10,
};

/** "evet / hayır" yanıtı. Hem de hayır varsa (ör. "evet hayır") güvenli tarafta kalıp belirsiz sayar. */
export function evetHayir(metin: string, lang: Dil = "tr"): "evet" | "hayir" | null {
  const EVET = lang === "en" ? EVET_EN : ["evet", "onayliyorum", "onayla", "tamam", "olur", "kabul", "dogru"];
  const HAYIR = lang === "en" ? HAYIR_EN : ["hayir", "vazgec", "vazgectim", "iptal", "olmaz", "istemiyorum"];
  const tok = normalize(metin).split(" ").filter(Boolean);   // dolgu temizliği YOK: "tamam" burada anlamlı
  const var_ = (liste: string[]) => tok.some((t) => liste.some((k) => benzerlik(t, k) >= 0.8));
  const e = var_(EVET), h = var_(HAYIR);
  if (e && h) return null;
  return e ? "evet" : h ? "hayir" : null;
}

export type TestIstegi = { adet?: 5 | 10; zorluk?: "easy" | "medium" | "hard" };

/** "10 soruluk zor test oluştur" gibi parametreli test isteği. Parametre yoksa null (sabit komut devreye girer). */
export function testIstegi(metin: string, lang: Dil = "tr"): TestIstegi | null {
  const en = lang === "en";
  const tok = temizle(normalize(metin), lang).split(" ").filter(Boolean);
  const testVar = tok.some((t) => (en ? /^(quiz|test|practice)/ : /^(test|quiz|pekistirme)/).test(t));
  const fiil = tok.some((t) => (en ? /^(create|start|make|generate|new|give|do|begin|prepare)/ : /^(olustur|baslat|hazirla|yap|uret|ver|yeni|cikar)/).test(t));
  const r: TestIstegi = {};
  for (const t of tok) {
    const n = /^\d+$/.test(t) ? Number(t) : en ? SAYI_KELIME_EN[t] : SAYI_KELIME[t.replace(/(luk|lik|luk)$/, "")];
    if (n === 5 || n === 10) r.adet = n;
    const z = en ? t : t.replace(/(dir|lu)$/, "");
    if (z === "kolay" || (en && z === "easy")) r.zorluk = "easy";
    else if (z === "orta" || (en && z === "medium")) r.zorluk = "medium";
    else if (z === "zor" || (en && (z === "hard" || z === "difficult"))) r.zorluk = "hard";
  }
  if (!r.adet && !r.zorluk) return null;
  return testVar || fiil ? r : null;
}

/** "3. soruya git", "üçüncü soru" / "go to question 3", "third question" → 1 tabanlı soru numarası. */
export function soruNoBul(metin: string, lang: Dil = "tr"): number | null {
  const en = lang === "en";
  const tok = temizle(normalize(metin), lang).split(" ").filter(Boolean);
  if (!tok.some((t) => (en ? /^question/ : /^soru/).test(t))) return null;
  const sira = en ? SIRA_KELIME_EN : SIRA_KELIME, sayi = en ? SAYI_KELIME_EN : SAYI_KELIME;
  for (const t of tok) {
    if (/^\d+$/.test(t)) { const n = Number(t); if (n >= 1 && n <= 30) return n; }
    if (sira[t]) return sira[t];
    if (sayi[t]) return sayi[t];
  }
  return null;
}
