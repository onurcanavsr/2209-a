import { SITE_ADI, ILETISIM } from "@/lib/site";

// TASLAK: Yayından önce gözden geçirin ve [köşeli] alanları doldurun.
export default function Sartlar() {
  return (
    <article className="prose">
      <h1>Kullanım Şartları</h1>
      <h2>1. Hizmet</h2>
      <p>{SITE_ADI}, belge ve video içeriklerini yapay zekâ ile özetleyen, sesli okuyan ve çalışma soruları üreten bir araştırma projesi platformudur. Hizmet, proje süresince sunulur; kesintisiz çalışma garantisi verilmez ve özellikler değişebilir.</p>
      <h2>2. Yapay zekâ çıktıları</h2>
      <p>Özetler, yanıtlar ve sorular yapay zekâ tarafından üretilir ve hatalı ya da eksik olabilir. Önemli kararlar ve sınavlar için asıl kaynağı kontrol etmeniz gerekir. Platform, çıktıların doğruluğundan sorumlu değildir.</p>
      <h2>3. Yüklenen içerik ve telif</h2>
      <p>Yüklediğiniz içeriği kullanma hakkına sahip olduğunuzu kabul edersiniz. İçerik yalnızca sizin için işlenir; başkalarıyla paylaşılmaz. Telifli içeriği yetkisiz biçimde yüklemekten ve kullanmaktan kullanıcı sorumludur.</p>
      <h2>4. Kabul edilemez kullanım</h2>
      <ul>
        <li>Hukuka aykırı, zararlı veya başkalarının haklarını ihlal eden içerik yüklemek</li>
        <li>Sisteme yetkisiz erişmeye, aşırı yük bindirmeye veya otomatik araçlarla kötüye kullanmaya çalışmak</li>
        <li>Hesabınızı başkalarına kullandırmak</li>
      </ul>
      <h2>5. Kullanım sınırları</h2>
      <p>Maliyet ve adil kullanım için günlük işlem ve dosya boyutu sınırları uygulanır. Kuralları ihlal eden hesaplar askıya alınabilir veya silinebilir.</p>
      <h2>6. Kişisel veriler</h2>
      <p>Verilerinizin işlenmesi Aydınlatma Metni&apos;nde açıklanmıştır. Hesabınızı istediğiniz zaman silebilirsiniz.</p>
      <h2>7. İletişim</h2>
      <p>Sorularınız için: {ILETISIM}</p>
    </article>
  );
}
