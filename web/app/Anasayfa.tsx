import Link from "next/link";
import Araclar from "./components/Araclar";
import { BOLUMLER, Ikon } from "@/lib/bolumler";
import { KAYIT_ACIK, SITE_ADI } from "@/lib/site";
import { getT } from "@/lib/i18n/server";

const ACIKLAMA: Record<string, string> = {
  soru: "Merak ettiklerini sor; cevap yalnızca belgene dayanır.",
  ozet: "Uzun metni kısa ve anlaşılır bir özete çevir.",
  test: "Belgenden üretilen sorularla kendini sına.",
  dinle: "Metni sesli dinleyerek çalış.",
  metin: "Belgeden çıkarılan metni görüntüle.",
  notlar: "Çalışırken kendi notlarını al.",
  kartlar: "Öğrenme kartlarıyla tekrar yap.",
  imler: "Önemli yerleri işaretle, kolayca dön.",
};

const ADIMLAR = [
  { b: "Yükle", a: "PDF, Word ya da PowerPoint dosyanı (en fazla 10 MB) yükle veya bir YouTube bağlantısı ekle." },
  { b: "Çalış", a: "Soru sor, özet çıkar, sesli okuma; notlarını ve yer imlerini kaydet." },
  { b: "Pekiştir", a: "Test çöz ve öğrenme kartlarıyla tekrar yaparak öğrendiklerini kalıcı hale getir." },
];

export default async function Anasayfa() {
  const { t } = await getT();
  const baslaHref = KAYIT_ACIK ? "/kayit" : "/giris";
  return (
    <div className="ana">
      <header className="ana-ust">
        <Link href="/" className="brand"><span className="logo" aria-hidden="true">{SITE_ADI[0]}</span>{SITE_ADI}</Link>
        <nav aria-label={t("Sayfa içi")} className="ana-nav">
          <a href="#ozellikler">{t("Özellikler")}</a>
          <a href="#nasil">{t("Nasıl çalışır")}</a>
        </nav>
        <div className="tools">
          <Araclar />
          <Link href="/giris" className="ana-btn ikinci">{t("Giriş yap")}</Link>
          {KAYIT_ACIK && <Link href="/kayit" className="ana-btn">{t("Kayıt ol")}</Link>}
        </div>
      </header>

      <section className="ana-hero" aria-labelledby="ana-baslik">
        <div>
          <p className="ana-rozet">{t("Yapay zekâ destekli çalışma alanı")}</p>
          <h1 id="ana-baslik">{t("Belgene soru sor, cevabı hemen al.")}</h1>
          <p className="ana-lead">
            {t("Dosyanı yükle ya da bir YouTube bağlantısı ekle. {site} metni çıkarır; soru-cevap, özet, test ve öğrenme kartlarıyla çalışmanı kolaylaştırır.", { site: SITE_ADI })}
          </p>
          <div className="row">
            <Link href={baslaHref} className="ana-btn">{KAYIT_ACIK ? t("Hemen başla") : t("Giriş yap")}</Link>
            <a href="#nasil" className="ana-btn ikinci">{t("Nasıl çalışır?")}</a>
          </div>
          <ul className="ana-bicim" aria-label={t("Desteklenen kaynaklar")}>
            <li>PDF</li><li>Word</li><li>PowerPoint</li><li>YouTube</li>
          </ul>
          <p className="hint">{t("Cevaplar yalnızca yüklediğin belgeye dayanır.")}</p>
        </div>

        <div className="ana-pencere" aria-hidden="true">
          <div className="ana-pencere-ust"><i /><i /><i /></div>
          <div className="ana-pencere-ic">
            <ul className="ana-yan">
              <li>{t("Ana sayfa")}</li>
              <li className="on">{t("Belgeye Soru Sor")}</li>
              <li>{t("Özet")}</li><li>{t("Pekiştirme Testi")}</li><li>{t("Sesli Okuma")}</li><li>{t("Notlarım")}</li><li>{t("Öğrenme Kartları")}</li><li>{t("Yer İmleri")}</li>
            </ul>
            <div className="ana-panel">
              <strong>{t("Belgeye Soru Sor")}</strong>
              <span className="hint">{t("Cevaplar yalnızca belgene dayanır.")}</span>
              <div className="ana-girdi">{t("Örn. Mitokondrinin görevi nedir?")}</div>
              <span className="ana-mini">{t("Sor")}</span>
              <b>{t("Son sorular")}</b>
              <div className="ana-soru"><span>{t("F8 tuşuna 3 kez basınca ne olur?")}</span><em>{t("2 dk")}</em></div>
              <div className="ana-soru"><span>{t("Word’de sekme ekleme nasıl yapılır?")}</span><em>{t("12 dk")}</em></div>
              <div className="ana-soru"><span>{t("Biçimlendirme araçları nelerdir?")}</span><em>{t("28 dk")}</em></div>
            </div>
          </div>
        </div>
      </section>

      <section id="ozellikler" className="ana-bolum ana-zemin" aria-labelledby="ozellik-baslik">
        <div className="ana-kap">
          <h2 id="ozellik-baslik">{t("Çalışmak için gereken her şey tek yerde")}</h2>
          <p className="sub">{t("Bir belge yükle, sekiz aracın hepsiyle çalış.")}</p>
          <ul className="ana-izgara">
            {BOLUMLER.map((b) => (
              <li key={b.id} className="card">
                <span className="ana-ikon"><Ikon ad={b.ikon} /></span>
                <h3>{t(b.ad)}</h3>
                <p>{t(ACIKLAMA[b.id])}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="nasil" className="ana-bolum" aria-labelledby="nasil-baslik">
        <div className="ana-kap">
          <h2 id="nasil-baslik">{t("Üç adımda başla")}</h2>
          <ol className="ana-adimlar">
            {ADIMLAR.map((x) => (
              <li key={x.b}><h3>{t(x.b)}</h3><p>{t(x.a)}</p></li>
            ))}
          </ol>
          <div className="ana-cta">
            <p>{t("İlk belgeni yükle, hemen başla.")}</p>
            <Link href={baslaHref} className="ana-btn acik">{KAYIT_ACIK ? t("Hemen başla") : t("Giriş yap")}</Link>
          </div>
        </div>
      </section>

      <footer className="ana-alt">
        <span>{SITE_ADI} · {t("TÜBİTAK 2209-A projesi kapsamında geliştirilmektedir.")}</span>
        <span><Link href="/aydinlatma">{t("Aydınlatma Metni")}</Link> · <Link href="/kullanim-sartlari">{t("Kullanım Şartları")}</Link></span>
      </footer>
    </div>
  );
}
