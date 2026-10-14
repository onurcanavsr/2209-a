import { SITE_ADI, VERI_SORUMLUSU, ILETISIM } from "@/lib/site";

// TASLAK: Yayından önce bir hukukçuya/danışmana kontrol ettirin ve [köşeli] alanları doldurun.
export default function Aydinlatma() {
  return (
    <article className="prose">
      <h1>Kişisel Verilerin Korunması Aydınlatma Metni</h1>
      <p>6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) m.10 kapsamında, {SITE_ADI} platformunu kullanırken kişisel verilerinizin nasıl işlendiği hakkında sizi bilgilendiriyoruz.</p>
      <h2>1. Veri sorumlusu</h2>
      <p>{VERI_SORUMLUSU}. İletişim: {ILETISIM}. Platform, bir TÜBİTAK 2209-A üniversite öğrencileri araştırma projesi kapsamında geliştirilmektedir.</p>
      <h2>2. İşlenen veriler</h2>
      <ul>
        <li>Hesap bilgileri: e-posta adresi, parola (yalnızca geri döndürülemez şekilde karıştırılmış olarak)</li>
        <li>Yüklediğiniz belgelerden ve bağlantısını verdiğiniz YouTube videolarından çıkarılan metin, ürettiğimiz özet, soru-cevap ve sınav içerikleri</li>
        <li>Kullanım kayıtları: işlem türü ve zamanı, kullanım miktarı, hata kayıtları</li>
        <li>Teknik veriler: IP adresi, tarayıcı bilgisi (güvenlik amacıyla)</li>
      </ul>
      <h2>3. İşleme amaçları ve hukuki sebepler</h2>
      <p>Verileriniz; hesabınızı yönetmek, özetleme, sesli okuma ve sınav hizmetlerini sunmak, hizmet güvenliğini ve kötüye kullanımın önlenmesini sağlamak ve kullanım sınırlarını uygulamak amacıyla işlenir. Hukuki sebepler: sözleşmenin kurulması ve ifası, meşru menfaat ve gerektiğinde açık rızanızdır.</p>
      <h2>4. Verilerin aktarıldığı taraflar</h2>
      <p>Hizmetin sağlanması için aşağıdaki hizmet sağlayıcılar kullanılmaktadır. Bu nedenle verileriniz yurt dışına aktarılabilir:</p>
      <ul>
        <li>Barındırma: OVHcloud (Almanya)</li>
        <li>Veritabanı ve kimlik doğrulama: Supabase [bölgeyi doğrulayın]</li>
        <li>Yapay zekâ işleme: Anthropic (ABD). Özet ve soru üretimi için belge metniniz bu sağlayıcıya iletilir.</li>
        <li>Sesli okuma: [seçilen TTS sağlayıcı]</li>
        <li>E-posta gönderimi: [seçilen e-posta servisi]</li>
      </ul>
      <p>Yurt dışına aktarım, KVKK m.9 kapsamındaki şartlara uygun olarak yapılır. [Aktarım dayanağını (örn. açık rıza veya standart sözleşme) güncel mevzuata göre netleştirin.]</p>
      <h2>5. Saklama süresi</h2>
      <p>Yüklediğiniz özgün dosyalar, metin çıkarıldıktan sonra saklanmaz. Metin, özet ve sınav verileri hesabınız açık olduğu sürece saklanır; hesabınızı sildiğinizde bu veriler silinir. Ses dosyaları sınırlı süre saklanır [süreyi yazın]. Güvenlik kayıtları [süreyi yazın] saklanır.</p>
      <h2>6. Haklarınız</h2>
      <p>KVKK m.11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, işlemeye itiraz etme ve zarar halinde tazminat talep etme haklarına sahipsiniz. Hesabınızı ve tüm verilerinizi &quot;Hesabım&quot; sayfasından istediğiniz zaman kendiniz silebilirsiniz. Diğer talepleriniz için {ILETISIM} adresine yazabilirsiniz.</p>
      <h2>7. Önemli uyarı</h2>
      <p>Başkalarına ait kişisel veri veya gizli bilgi içeren belgeleri yüklemeyiniz.</p>
    </article>
  );
}
