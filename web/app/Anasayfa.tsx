import Link from "next/link";
import Araclar from "./components/Araclar";
import { BOLUMLER, Ikon } from "@/lib/bolumler";
import { KAYIT_ACIK, SITE_ADI } from "@/lib/site";

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
  { b: "Çalış", a: "Soru sor, özet çıkar, metni dinle; notlarını ve yer imlerini kaydet." },
  { b: "Pekiştir", a: "Test çöz ve öğrenme kartlarıyla tekrar yaparak öğrendiklerini kalıcı hale getir." },
];

export default function Anasayfa() {
  const baslaHref = KAYIT_ACIK ? "/kayit" : "/giris";
  return (
    <div className="ana">
      <header className="ana-ust">
        <Link href="/" className="brand"><span className="logo" aria-hidden="true">{SITE_ADI[0]}</span>{SITE_ADI}</Link>
        <nav aria-label="Sayfa içi" className="ana-nav">
          <a href="#ozellikler">Özellikler</a>
          <a href="#nasil">Nasıl çalışır</a>
        </nav>
        <div className="tools">
          <Araclar />
          <Link href="/giris" className="ana-btn ikinci">Giriş yap</Link>
        </div>
      </header>

      <section className="ana-hero" aria-labelledby="ana-baslik">
        <div>
          <p className="ana-rozet">Yapay zekâ destekli çalışma alanı</p>
          <h1 id="ana-baslik">Belgene soru sor, cevabı hemen al.</h1>
          <p className="ana-lead">
            Dosyanı yükle ya da bir YouTube bağlantısı ekle. {SITE_ADI} metni çıkarır; soru-cevap, özet, test ve
            öğrenme kartlarıyla çalışmanı kolaylaştırır.
          </p>
          <div className="row">
            <Link href={baslaHref} className="ana-btn">{KAYIT_ACIK ? "Hemen başla" : "Giriş yap"}</Link>
            <a href="#nasil" className="ana-btn ikinci">Nasıl çalışır?</a>
          </div>
          <ul className="ana-bicim" aria-label="Desteklenen kaynaklar">
            <li>PDF</li><li>Word</li><li>PowerPoint</li><li>YouTube</li>
          </ul>
          <p className="hint">Cevaplar yalnızca yüklediğin belgeye dayanır.</p>
        </div>

        <div className="ana-pencere" aria-hidden="true">
          <div className="ana-pencere-ust"><i /><i /><i /></div>
          <div className="ana-pencere-ic">
            <ul className="ana-yan">
              <li>Ana sayfa</li>
              <li className="on">Belgeye Soru Sor</li>
              <li>Özet</li><li>Pekiştirme Testi</li><li>Metni Dinle</li><li>Notlarım</li><li>Öğrenme Kartları</li><li>Yer İmleri</li>
            </ul>
            <div className="ana-panel">
              <strong>Belgeye Soru Sor</strong>
              <span className="hint">Cevaplar yalnızca belgene dayanır.</span>
              <div className="ana-girdi">Örn. Mitokondrinin görevi nedir?</div>
              <span className="ana-mini">Sor</span>
              <b>Son sorular</b>
              <div className="ana-soru"><span>F8 tuşuna 3 kez basınca ne olur?</span><em>2 dk</em></div>
              <div className="ana-soru"><span>Word’de sekme ekleme nasıl yapılır?</span><em>12 dk</em></div>
              <div className="ana-soru"><span>Biçimlendirme araçları nelerdir?</span><em>28 dk</em></div>
            </div>
          </div>
        </div>
      </section>

      <section id="ozellikler" className="ana-bolum ana-zemin" aria-labelledby="ozellik-baslik">
        <div className="ana-kap">
          <h2 id="ozellik-baslik">Çalışmak için gereken her şey tek yerde</h2>
          <p className="sub">Bir belge yükle, sekiz aracın hepsiyle çalış.</p>
          <ul className="ana-izgara">
            {BOLUMLER.map((b) => (
              <li key={b.id} className="card">
                <span className="ana-ikon"><Ikon ad={b.ikon} /></span>
                <h3>{b.ad}</h3>
                <p>{ACIKLAMA[b.id]}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="nasil" className="ana-bolum" aria-labelledby="nasil-baslik">
        <div className="ana-kap">
          <h2 id="nasil-baslik">Üç adımda başla</h2>
          <ol className="ana-adimlar">
            {ADIMLAR.map((x) => (
              <li key={x.b}><h3>{x.b}</h3><p>{x.a}</p></li>
            ))}
          </ol>
          <div className="ana-cta">
            <p>İlk belgeni yükle, hemen başla.</p>
            <Link href={baslaHref} className="ana-btn acik">{KAYIT_ACIK ? "Hemen başla" : "Giriş yap"}</Link>
          </div>
        </div>
      </section>

      <footer className="ana-alt">
        <span>{SITE_ADI} · TÜBİTAK 2209-A projesi kapsamında geliştirilmektedir.</span>
        <span><Link href="/aydinlatma">Aydınlatma Metni</Link> · <Link href="/kullanim-sartlari">Kullanım Şartları</Link></span>
      </footer>
    </div>
  );
}
