"use client";
/** İlk kez gelen kullanıcıya adım adım tanıtım turu (driver.js).
 *  - Çalışma Alanı ve belge sayfası için ayrı tur vardır; her biri kullanıcı başına yalnızca bir kez kendiliğinden açılır.
 *  - Üst çubuktaki "Tanıtım turu" düğmesi ve "tanıtım turu" sesli komutu turu istenen an yeniden başlatır.
 *  - Metinler çeviri işleviyle (useT) çevrilir; ekranda olmayan/gizli öğelerin adımı atlanır (ör. dar ekranda yan menü yerine Menü düğmesi).
 *  - Erişilebilirlik: Esc ile kapanır, ok tuşları çalışır, açıklama kutusu role="dialog", hareket azaltma tercihine uyulur. */
import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useT } from "@/lib/i18n/client";
import { SITE_ADI } from "@/lib/site";

type TurAdi = "calisma" | "belge";
type Adim = { el?: string; baslik: string; aciklama: string; yan?: "top" | "bottom" | "left" | "right" };

const anahtar = (eposta: string, ad: TurAdi) => `tur:v1:${eposta}:${ad}`;
const BEKLE = "tur:bekle";

function gorunur(sel: string): boolean {
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.left >= window.innerWidth) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

export default function Tur({ eposta }: { eposta: string }) {
  const t = useT();
  const router = useRouter();
  const yol = usePathname() ?? "/";
  const tRef = useRef(t);
  tRef.current = t;
  const surucu = useRef<Driver | null>(null);
  const sessiz = useRef(false);
  const tur: TurAdi | null = yol === "/" ? "calisma" : yol.startsWith("/belge/") ? "belge" : null;

  const kapat = useCallback(() => {
    if (!surucu.current) return;
    sessiz.current = true;       // kendiliğinden kapanmada "görüldü" işaretlenmesin
    surucu.current.destroy();
    surucu.current = null;
    sessiz.current = false;
  }, []);

  const baslat = useCallback((ad: TurAdi) => {
    const t = tRef.current;
    kapat();
    const menu = gorunur('[data-tur="kenar"]') ? '[data-tur="kenar"]' : '[data-tur="menu-dugme"]';

    const hepsi: Adim[] = ad === "calisma" ? [
      { baslik: t("{ad}’e hoş geldiniz", { ad: SITE_ADI }), aciklama: t("Bu kısa turda uygulamayı adım adım tanıyacaksınız. İstediğiniz an Esc tuşuyla çıkabilirsiniz; turu sonra üstteki “Tanıtım turu” düğmesinden yeniden başlatabilirsiniz.") },
      { el: '[data-tur="yukle"]', yan: "bottom", baslik: t("1. Belgenizi yükleyin"), aciklama: t("PDF, Word veya PowerPoint dosyanızı buraya sürükleyin ya da “Dosya seç” ile seçin (en fazla 10 MB). Taranmış PDF’ler OCR ile okunur ve hata içerebilir.") },
      { el: '[data-tur="youtube"]', yan: "top", baslik: t("Ya da YouTube videosu ekleyin"), aciklama: t("Altyazısı olan bir videonun bağlantısını yapıştırın; altyazı metni belge olarak kaydedilir.") },
      { el: '[data-tur="belgeler"]', yan: "top", baslik: t("2. Belgeleriniz burada listelenir"), aciklama: t("Yüklediğiniz her belge bu listede görünür. Bir belgeyi açınca özet, soru-cevap, test gibi araçlara ulaşırsınız.") },
      { el: menu, yan: "right", baslik: t("3. Bölümler arasında geçin"), aciklama: t("Bir belgeyi açtıktan sonra buradan Özet, Belgeye Soru Sor, Pekiştirme Testi, Sesli Okuma, Notlarım, Öğrenme Kartları ve Yer İmleri bölümlerine geçersiniz.") },
      { el: '[data-tur="ses"]', yan: "bottom", baslik: t("Sesli komut"), aciklama: t("Düğmeye basıp komutu söyleyin. Ne diyeceğinizi bilmiyorsanız “yardım” deyin ya da yanındaki “Komutlar” düğmesine bakın. Tarayıcı ilk kullanımda mikrofon izni ister.") },
      { el: '[data-tur="araclar"]', yan: "bottom", baslik: t("Dil, tema ve yazı boyutu"), aciklama: t("Buradan arayüz dilini (Türkçe/English), açık-koyu temayı ve yazı boyutunu değiştirebilirsiniz.") },
      { el: '[data-tur="tur-dugme"]', yan: "bottom", baslik: t("Turu tekrar izleyin"), aciklama: t("Bu düğmeyle tanıtımı istediğiniz zaman yeniden başlatabilirsiniz. İyi çalışmalar!") },
    ] : [
      { baslik: t("Belge sayfası"), aciklama: t("Burada belgenizle çalışırsınız. Kısaca nelerin nerede olduğunu gösterelim.") },
      { el: menu, yan: "right", baslik: t("Bölümler"), aciklama: t("Özet, Belgeye Soru Sor, Pekiştirme Testi, Sesli Okuma, Çıkarılan Metin, Notlarım, Öğrenme Kartları ve Yer İmleri arasında buradan geçersiniz.") },
      { el: '[data-tur="icerik"]', yan: "top", baslik: t("Çalışma alanı"), aciklama: t("Seçtiğiniz bölümün içeriği burada açılır. Örneğin Özet bölümünde özetin uzunluğunu seçip özet oluşturabilirsiniz.") },
      { el: '[data-tur="ses"]', yan: "bottom", baslik: t("Sesli komut"), aciklama: t("Belge sayfasında “özetle”, “sonraki soru”, “oku” gibi komutlar da çalışır. Tüm komutlar için “yardım” deyin.") },
      { el: '[data-tur="tur-dugme"]', yan: "bottom", baslik: t("Turu tekrar izleyin"), aciklama: t("Bu tanıtımı istediğiniz zaman bu düğmeyle yeniden başlatabilirsiniz.") },
    ];
    const adimlar = hepsi.filter((a) => !a.el || gorunur(a.el));

    const azHareket = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps: DriveStep[] = adimlar.map((a) => ({
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
      onPopoverRender: (p) => {
        p.wrapper.setAttribute("role", "dialog");
        p.wrapper.setAttribute("aria-label", t("Tanıtım turu"));
        p.closeButton.setAttribute("aria-label", t("Turu kapat"));
        p.closeButton.setAttribute("title", t("Turu kapat"));
      },
      onDestroyed: () => {
        if (sessiz.current) return;
        try { localStorage.setItem(anahtar(eposta, ad), "1"); } catch {}
        surucu.current = null;
      },
    });
    surucu.current = d;
    d.drive();
  }, [eposta, kapat]);

  // Sayfa açılışı: bu tur bu kullanıcıya daha önce gösterilmediyse (ya da düğme/komutla beklemedeyse) başlat
  useEffect(() => {
    if (!tur) return;
    let bekliyor = false;
    try { bekliyor = sessionStorage.getItem(BEKLE) === "1"; sessionStorage.removeItem(BEKLE); } catch {}
    let goruldu = false;
    try { goruldu = localStorage.getItem(anahtar(eposta, tur)) === "1"; } catch {}
    if (goruldu && !bekliyor) return;
    const z = setTimeout(() => baslat(tur), bekliyor ? 600 : 1200);
    return () => { clearTimeout(z); kapat(); };
  }, [tur, eposta, baslat, kapat]);

  // Düğme ve sesli komut bu olayı gönderir
  useEffect(() => {
    const f = () => {
      if (tur) { baslat(tur); return; }
      try { sessionStorage.setItem(BEKLE, "1"); } catch {}
      router.push("/");          // tur yalnızca Çalışma Alanı ve belge sayfalarında vardır
    };
    window.addEventListener("tur:baslat", f);
    return () => window.removeEventListener("tur:baslat", f);
  }, [tur, baslat, router]);

  return null;
}
