"use client";
/** İlk kez gelen kullanıcıya adım adım tanıtım turu (driver.js).
 *  Turlar parçalardan oluşur ve her parça kullanıcı başına yalnızca bir kez kendiliğinden gösterilir:
 *   - "calisma"  : Çalışma Alanı (ana sayfa)
 *   - "belge"    : belge sayfasının genel tanıtımı (ilk belge açılışında)
 *   - "b:<bölüm>": açılan bölümün (özet, soru, test, dinle, metin, notlar, kartlar, imler) kendi tanıtımı
 *  Kullanıcı bölümler arasında gezindikçe, o bölümü ilk kez görüyorsa o bölümün turu açılır.
 *  - Üst çubuktaki "Tanıtım turu" düğmesi ve "tanıtım turu" sesli komutu bulunulan sayfanın turunu baştan başlatır.
 *  - Öğeler data-tur özniteliği ya da kalıcı kimlik/etiketlerle bulunur; ekranda olmayan/gizli öğenin adımı atlanır.
 *  - Metinler çeviri işleviyle (useT) çevrilir; EN karşılıkları lib/i18n/en.ts içindedir.
 *  - Erişilebilirlik: Esc ile kapanır, ok tuşları çalışır, kutu role="dialog", hareket azaltma tercihine uyulur. */
import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useT } from "@/lib/i18n/client";
import { BOLUMLER } from "@/lib/bolumler";
import { SITE_ADI } from "@/lib/site";

type Cevir = ReturnType<typeof useT>;

type Parca = "calisma" | "belge" | `b:${string}`;
type Adim = { el?: string; baslik: string; aciklama: string; yan?: "top" | "bottom" | "left" | "right" };

const anahtar = (eposta: string, p: Parca) => `tur:v1:${eposta}:${p}`;
const BEKLE = "tur:bekle";
const BOLUM_IDLERI: string[] = BOLUMLER.map((b) => b.id);

function gorunur(sel: string): boolean {
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.left >= window.innerWidth) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

function goruldu(eposta: string, p: Parca): boolean {
  try { return localStorage.getItem(anahtar(eposta, p)) === "1"; } catch { return false; }
}
function isaretle(eposta: string, p: Parca) {
  try { localStorage.setItem(anahtar(eposta, p), "1"); } catch {}
}

function hedefler(yol: string, bolum: string): Parca[] {
  if (yol === "/") return ["calisma"];
  if (yol.startsWith("/belge/")) return ["belge", `b:${bolum}`];
  return [];
}

// ---------------------------------------------------------------------------------------------------------------------
// Adım tanımları

function calismaAdimlari(t: Cevir, menu: string): Adim[] {
  return [
    { baslik: t("{ad}’e hoş geldiniz", { ad: SITE_ADI }), aciklama: t("Bu kısa turda uygulamayı adım adım tanıyacaksınız. İstediğiniz an Esc tuşuyla çıkabilirsiniz; turu sonra üstteki “Tanıtım turu” düğmesinden yeniden başlatabilirsiniz.") },
    { el: '[data-tur="yukle"]', yan: "bottom", baslik: t("1. Belgenizi yükleyin"), aciklama: t("PDF, Word veya PowerPoint dosyanızı buraya sürükleyin ya da “Dosya seç” ile seçin (en fazla 10 MB). Taranmış PDF’ler OCR ile okunur ve hata içerebilir.") },
    { el: '[data-tur="youtube"]', yan: "top", baslik: t("Ya da YouTube videosu ekleyin"), aciklama: t("Altyazısı olan bir videonun bağlantısını yapıştırın; altyazı metni belge olarak kaydedilir.") },
    { el: '[data-tur="belgeler"]', yan: "top", baslik: t("2. Belgeleriniz burada listelenir"), aciklama: t("Yüklediğiniz her belge bu listede görünür. Bir belgeyi açınca özet, soru-cevap, test gibi araçlara ulaşırsınız.") },
    { el: menu, yan: "right", baslik: t("3. Bölümler arasında geçin"), aciklama: t("Bir belgeyi açtıktan sonra buradan Özet, Belgeye Soru Sor, Pekiştirme Testi, Sesli Okuma, Notlarım, Öğrenme Kartları ve Yer İmleri bölümlerine geçersiniz.") },
    { el: '[data-tur="ses"]', yan: "bottom", baslik: t("Sesli komut"), aciklama: t("Düğmeye basıp komutu söyleyin. Ne diyeceğinizi bilmiyorsanız “yardım” deyin ya da yanındaki “Komutlar” düğmesine bakın. Tarayıcı ilk kullanımda mikrofon izni ister.") },
    { el: '[data-tur="araclar"]', yan: "bottom", baslik: t("Dil, tema ve yazı boyutu"), aciklama: t("Buradan arayüz dilini (Türkçe/English), açık-koyu temayı ve yazı boyutunu değiştirebilirsiniz.") },
    { el: '[data-tur="tur-dugme"]', yan: "bottom", baslik: t("Turu tekrar izleyin"), aciklama: t("Bu düğmeyle tanıtımı istediğiniz zaman yeniden başlatabilirsiniz. İyi çalışmalar!") },
  ];
}

function belgeGiris(t: Cevir, menu: string): Adim[] {
  return [
    { baslik: t("Belge sayfası"), aciklama: t("Burada belgenizle çalışırsınız. Kısaca nelerin nerede olduğunu gösterelim.") },
    { el: menu, yan: "right", baslik: t("Bölümler"), aciklama: t("Özet, Belgeye Soru Sor, Pekiştirme Testi, Sesli Okuma, Çıkarılan Metin, Notlarım, Öğrenme Kartları ve Yer İmleri arasında buradan geçersiniz. Her bölüme ilk girişinizde o bölümün kısa tanıtımı gösterilir.") },
    { el: '[data-tur="icerik"]', yan: "top", baslik: t("Çalışma alanı"), aciklama: t("Seçtiğiniz bölümün içeriği burada açılır. Şimdi açık olan bölümü birlikte tanıyalım.") },
  ];
}

function belgeSon(t: Cevir): Adim[] {
  return [
    { el: '[data-tur="ses"]', yan: "bottom", baslik: t("Sesli komut"), aciklama: t("Belge sayfasında “özetle”, “sonraki soru”, “oku” gibi komutlar da çalışır. Tüm komutlar için “yardım” deyin.") },
    { el: '[data-tur="tur-dugme"]', yan: "bottom", baslik: t("Turu tekrar izleyin"), aciklama: t("Bu tanıtımı istediğiniz zaman bu düğmeyle yeniden başlatabilirsiniz.") },
  ];
}

function bolumAdimlari(bolum: string, t: Cevir): Adim[] {
  switch (bolum) {
    case "ozet": {
      const P = '[aria-labelledby="ozet-baslik"]';
      return [
        { el: `${P} .seg`, yan: "bottom", baslik: t("Özet uzunluğu"), aciklama: t("Kısa (3-5 madde), Orta (yaklaşık 1 sayfa) ya da Ayrıntılı (bölüm bölüm) özet arasından seçin. Önce uzunluğu seçin, sonra özetletin.") },
        { el: `${P} .row`, yan: "bottom", baslik: t("Özetleyin"), aciklama: t("“Özetle” düğmesi özeti hazırlar; metin yazıldıkça ekranda görünür. Hazır olunca “Yeniden oluştur” ile yenisini üretebilir, “PDF indir” ile kaydedebilirsiniz. Sesle “özetle” demeniz de yeterli.") },
        { el: `${P} .ozet`, yan: "top", baslik: t("Özetiniz burada"), aciklama: t("Özet bu alanda görünür. Oluşturduğunuz özetler kaydedilir; bu bölüme döndüğünüzde yeniden hazırlamanız gerekmez.") },
        { el: `${P} .player`, yan: "top", baslik: t("Özeti dinleyin"), aciklama: t("Oynat düğmesi özeti seslendirir. 10 saniye geri/ileri, önceki/sonraki bölüm, hız ve ses seçimi ile MP3 indirme de burada. Sesle “oku” ve “daha hızlı” diyebilirsiniz.") },
      ];
    }
    case "soru": {
      const P = '[aria-labelledby="qa-baslik"]';
      return [
        { el: `${P} form`, yan: "bottom", baslik: t("Sorunuzu yazın"), aciklama: t("Belgeyle ilgili sorunuzu kutuya yazıp “Sor”a basın (en az 3 karakter). Cevaplar yalnızca bu belgeye dayanır; belgede yoksa bunu söyler. Sesle “soru sor” deyip sorunuzu söyleyebilirsiniz.") },
        { el: `${P} .qa-item`, yan: "top", baslik: t("Cevaplar ve kaynaklar"), aciklama: t("Sorunuz ve cevabı burada listelenir; en yenisi en üstte durur. Cevabın dayandığı belge bölümleri de gösterilir. Sesle “cevabı oku” diyebilir, “Geçmişi temizle” düğmesiyle geçmişi silebilirsiniz.") },
      ];
    }
    case "test": {
      const P = '[aria-labelledby="quiz-baslik"]';
      return [
        { el: `${P} .row`, yan: "bottom", baslik: t("Testi hazırlayın"), aciklama: t("Zorluğu ve soru sayısını seçip “Yeni test oluştur”a basın. Çoktan seçmeli sorular belgenizden hazırlanır.") },
        { el: `${P} details`, yan: "bottom", baslik: t("Önceki testleriniz"), aciklama: t("Daha önce oluşturduğunuz testleri buradan açıp yeniden çözebilirsiniz.") },
        { el: `${P} .opt`, yan: "top", baslik: t("Cevabınızı seçin"), aciklama: t("Her soruda bir şık işaretleyin. Hepsini yanıtlayınca “Testi bitir” ile puanınızı ve açıklamaları görürsünüz. Sesle “A şıkkı”, “sonraki soru” ve “testi bitir” diyebilirsiniz.") },
      ];
    }
    case "dinle": {
      const P = '[aria-labelledby="dinle-baslik"]';
      return [
        { el: `${P} .player > .row:nth-child(1)`, yan: "bottom", baslik: t("Oynatın ve gezinin"), aciklama: t("Oynat düğmesi belgenin metnini seslendirir. 10 saniye geri/ileri ve önceki/sonraki bölüm düğmeleriyle gezinebilirsiniz. Sesle “oku” demeniz de yeterli. Metnin tamamını dinlemek günlük sesli okuma kotanızdan düşer; özeti dinlemek daha kısadır.") },
        { el: `${P} .player > .row:nth-child(2)`, yan: "bottom", baslik: t("Hız, ses ve vurgu"), aciklama: t("Okuma hızını ve sesi seçin. “Kelime vurgusu” okunan kelimenin metinde işaretlenmesini açar ya da kapatır; “MP3 indir” sesi bilgisayarınıza kaydeder.") },
        { el: `${P} .doctext`, yan: "top", baslik: t("Okunan metin"), aciklama: t("Okuma sırasında seslendirilen kelime burada işaretlenir. Metinde ok tuşlarıyla gezinebilirsiniz.") },
      ];
    }
    case "metin": {
      const P = '[aria-labelledby="metin-baslik"]';
      return [
        { el: `${P} form.alt-kart`, yan: "bottom", baslik: t("Yer imi ekleyin"), aciklama: t("Metinde bir kelime seçin (ya da sırasını yazın), yer imine bir ad verip “Yer imi ekle”ye basın. Kayıtlı yerlere sonra “Yer İmleri” bölümünden dönersiniz.") },
        { el: `${P} [role="group"].alt-kart`, yan: "bottom", baslik: t("OCR ile okunan sayfalar"), aciklama: t("Görüntüden okunduğu için bu sayfalarda hata olabilir. Numaralara tıklayarak o sayfaya geçebilirsiniz.") },
        { el: `${P} .doctext`, yan: "top", baslik: t("Belgenin metni"), aciklama: t("Belgeden çıkarılan metin burada. Bir kelimeye tıklayarak seçersiniz; ok tuşlarıyla gezebilirsiniz. Taranmış belgelerde okuma hataları olabilir.") },
      ];
    }
    case "kartlar": {
      const P = '[aria-labelledby="kartlar-baslik"]';
      return [
        { el: "#calis-baslik", yan: "bottom", baslik: t("Kartlarla çalışın"), aciklama: t("Kartın ön yüzünü okuyup cevabı aklınızdan söyleyin, sonra kartı çevirerek kontrol edin. Önceki/Sonraki düğmeleri ve sol/sağ ok tuşları kartlar arasında gezdirir.") },
        { el: `${P} form.alt-kart`, yan: "bottom", baslik: t("Kendi kartınızı ekleyin"), aciklama: t("Ön yüze soru ya da terimi, arka yüze cevabı yazıp “Kartı ekle”ye basın.") },
        { el: "#kart-adet", yan: "bottom", baslik: t("Belgeden otomatik kart üretin"), aciklama: t("Kart sayısını seçip “Belgeden oluştur” bölümündeki düğmeye basın; kartlar belgenizden otomatik hazırlanır.") },
      ];
    }
    case "notlar": {
      const P = '[aria-labelledby="notlar-baslik"]';
      return [
        { el: `${P} form.alt-kart`, yan: "bottom", baslik: t("Yeni not"), aciklama: t("Notunuzu yazıp “Notu kaydet”e basın. Notlar bu belgeyle birlikte saklanır.") },
        { el: `${P} .oge-liste`, yan: "top", baslik: t("Kayıtlı notlarınız"), aciklama: t("Notlarınız burada listelenir. “Düzenle” ile değiştirebilir, “Sil” ile kaldırabilirsiniz.") },
      ];
    }
    case "imler": {
      const P = '[aria-labelledby="imler-baslik"]';
      return [
        { el: `${P} .panel-alt`, yan: "bottom", baslik: t("Yer imi nasıl eklenir?"), aciklama: t("Yer imlerini “Çıkarılan Metin” bölümünde bir kelimeyi seçerek eklersiniz.") },
        { el: `${P} .oge-liste`, yan: "top", baslik: t("Yer imleriniz"), aciklama: t("“Metinde göster” sizi o kelimeye götürür, “Sil” yer imini kaldırır.") },
      ];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------------------------------------

export default function Tur({ eposta }: { eposta: string }) {
  const t = useT();
  const router = useRouter();
  const yol = usePathname() ?? "/";
  const sp = useSearchParams();
  const istenen = sp?.get("b") ?? "";
  const bolum = BOLUM_IDLERI.includes(istenen) ? istenen : "ozet";   // BelgeDetay ile aynı varsayılan
  const parcalar = hedefler(yol, bolum);
  const anahtarStr = parcalar.join("|");

  const tRef = useRef(t);
  tRef.current = t;
  const surucu = useRef<Driver | null>(null);
  const sessiz = useRef(false);

  const kapat = useCallback(() => {
    if (!surucu.current) return;
    sessiz.current = true;
    surucu.current.destroy();
    surucu.current = null;
    sessiz.current = false;
  }, []);

  /** secilen parçaların adımlarını tek turda gösterir. */
  const baslat = useCallback((secilen: Parca[]) => {
    const t = tRef.current;
    if (!secilen.length) return;
    kapat();
    const menu = gorunur('[data-tur="kenar"]') ? '[data-tur="kenar"]' : '[data-tur="menu-dugme"]';

    const liste: { a: Adim; p: Parca }[] = [];
    const ekle = (p: Parca, adimlar: Adim[]) => adimlar.forEach((a) => liste.push({ a, p }));
    if (secilen.includes("calisma")) ekle("calisma", calismaAdimlari(t, menu));
    if (secilen.includes("belge")) ekle("belge", belgeGiris(t, menu));
    for (const p of secilen) if (p.startsWith("b:")) ekle(p, bolumAdimlari(p.slice(2), t));
    if (secilen.includes("belge")) ekle("belge", belgeSon(t));

    const gorunenler = liste.filter(({ a }) => !a.el || gorunur(a.el));
    if (!gorunenler.length) return;

    const azHareket = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps: DriveStep[] = gorunenler.map(({ a }) => ({
      element: a.el,
      popover: { title: a.baslik, description: a.aciklama, side: a.yan, align: "start" },
    }));
    const d = driver({
      steps,
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      nextBtnText: t("İleri"),
      prevBtnText: t("Geri"),
      doneBtnText: t("Bitir"),
      popoverClass: "yzders-tur",
      animate: !azHareket,
      smoothScroll: !azHareket,
      stagePadding: 6,
      stageRadius: 10,
      disableActiveInteraction: true,
      // Bir parçanın ilk adımı gösterildiği anda o parça "görüldü" sayılır (tur yarıda kapansa da tekrar tekrar açılmasın)
      onHighlightStarted: () => {
        const i = d.getActiveIndex();
        const p = i === undefined ? undefined : gorunenler[i]?.p;
        if (p) isaretle(eposta, p);
      },
      onPopoverRender: (p) => {
        p.wrapper.setAttribute("role", "dialog");
        p.wrapper.setAttribute("aria-label", t("Tanıtım turu"));
        p.closeButton.setAttribute("aria-label", t("Turu kapat"));
        p.closeButton.setAttribute("title", t("Turu kapat"));
      },
      onDestroyed: () => {
        if (!sessiz.current) surucu.current = null;
      },
    });
    surucu.current = d;
    d.drive();
  }, [eposta, kapat]);

  // Sayfa ya da bölüm değişince: bu kullanıcıya daha önce gösterilmemiş parçalar varsa turu kendiliğinden başlat
  useEffect(() => {
    if (!anahtarStr) return;
    const hepsi = anahtarStr.split("|") as Parca[];
    let bekliyor = false;
    try { bekliyor = sessionStorage.getItem(BEKLE) === "1"; sessionStorage.removeItem(BEKLE); } catch {}
    const secilen = bekliyor ? hepsi : hepsi.filter((p) => !goruldu(eposta, p));
    if (!secilen.length) return;
    const z = setTimeout(() => baslat(secilen), bekliyor ? 600 : 1100);
    return () => { clearTimeout(z); kapat(); };
  }, [anahtarStr, eposta, baslat, kapat]);

  // Düğme ve sesli komut bu olayı gönderir: bulunulan sayfanın (ve açık bölümün) turu baştan başlar
  useEffect(() => {
    const f = () => {
      if (anahtarStr) { baslat(anahtarStr.split("|") as Parca[]); return; }
      try { sessionStorage.setItem(BEKLE, "1"); } catch {}
      router.push("/");          // tur yalnızca Çalışma Alanı ve belge sayfalarında vardır
    };
    window.addEventListener("tur:baslat", f);
    return () => window.removeEventListener("tur:baslat", f);
  }, [anahtarStr, baslat, router]);

  return null;
}
