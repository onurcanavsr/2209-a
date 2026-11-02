import { SITE_ADI, VERI_SORUMLUSU, ILETISIM } from "@/lib/site";
import { getLang } from "@/lib/i18n/server";

// TASLAK: Yayından önce bir hukukçuya/danışmana kontrol ettirin ve [köşeli] alanları doldurun.
// İngilizce metin Türkçe metnin çevirisidir; bağlayıcı sürüm için hukukçunuza danışın.
export default async function Aydinlatma() {
  return (await getLang()) === "en" ? <AydinlatmaEn /> : <AydinlatmaTr />;
}

function AydinlatmaTr() {
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
        <li>Sesli komut (konuşmayı metne çevirme): OpenAI [bölge ve veri saklama koşullarını sağlayıcının güncel belgelerinden doğrulayın]</li>
        <li>YouTube transkripti: YouTube (Google) [video eklerseniz; bölge ve koşulları doğrulayın]</li>
        <li>E-posta gönderimi: [seçilen e-posta servisi]</li>
      </ul>
      <p>Yurt dışına aktarım, KVKK m.9 kapsamındaki şartlara uygun olarak yapılır. [Aktarım dayanağını (örn. açık rıza veya standart sözleşme) güncel mevzuata göre netleştirin.]</p>
      <h2>4.1. Sesli komut</h2>
      <p>Sesli komut özelliğini kullandığınızda mikrofon kaydınız yalnızca birkaç saniyelik komutu anlamak için sunucumuza ve konuşma tanıma hizmetine iletilir. Çalışma alanındaki belge adlarını doğru tanıyabilmek için, adı geçen belgelerinizin başlıkları (dosya adları) kayıtla birlikte tanıma hizmetine ipucu olarak iletilir. Kaydınız sunucumuzda diske yazılmaz ve komut metni günlüklere kaydedilmez; yalnızca günlük kullanım sayısı tutulur. Mikrofon izni tarayıcınızdan verilir ve istediğiniz zaman geri alınabilir. Özelliği kullanmak zorunda değilsiniz; tüm işlemler düğme ve klavyeyle de yapılabilir. [Açık rıza metnini ve saklama sürelerini hukukçunuzla netleştirin.]</p>
      <h2>4.2. YouTube bağlantısı</h2>
      <p>Bir YouTube bağlantısı eklediğinizde sunucumuz, videonun herkese açık altyazısını (transkript) YouTube&apos;dan alır ve metni belge olarak hesabınıza kaydeder. Video dosyası indirilmez ve saklanmaz. YouTube&apos;a altyazıyı almak için videonun kimliği ve sunucumuzun IP adresi iletilir; bağlantı adresiniz başka bir amaçla kullanılmaz. [YouTube Hizmet Şartları ve telif konularını hukukçunuzla netleştirin.]</p>
      <h2>5. Saklama süresi</h2>
      <p>Yüklediğiniz özgün dosyalar, metin çıkarıldıktan sonra saklanmaz. Metin, özet ve sınav verileri hesabınız açık olduğu sürece saklanır; hesabınızı sildiğinizde bu veriler silinir. Ses dosyaları sınırlı süre saklanır [süreyi yazın]. Güvenlik kayıtları [süreyi yazın] saklanır.</p>
      <h2>6. Haklarınız</h2>
      <p>KVKK m.11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, işlemeye itiraz etme ve zarar halinde tazminat talep etme haklarına sahipsiniz. Hesabınızı ve tüm verilerinizi &quot;Hesabım&quot; sayfasından istediğiniz zaman kendiniz silebilirsiniz. Diğer talepleriniz için {ILETISIM} adresine yazabilirsiniz.</p>
      <h2>7. Önemli uyarı</h2>
      <p>Başkalarına ait kişisel veri veya gizli bilgi içeren belgeleri yüklemeyiniz.</p>
    </article>
  );
}

function AydinlatmaEn() {
  return (
    <article className="prose" lang="en">
      <h1>Personal Data Protection Privacy Notice</h1>
      <p>Under Article 10 of the Turkish Personal Data Protection Law No. 6698 (KVKK), we inform you about how your personal data is processed when you use the {SITE_ADI} platform.</p>
      <h2>1. Data controller</h2>
      <p>{VERI_SORUMLUSU}. Contact: {ILETISIM}. The platform is being developed as part of a TÜBİTAK 2209-A university student research project.</p>
      <h2>2. Data we process</h2>
      <ul>
        <li>Account information: email address and password (only in irreversibly hashed form)</li>
        <li>Text extracted from the documents you upload and the YouTube videos whose links you provide, and the summaries, Q&amp;A and quiz content we generate</li>
        <li>Usage records: type and time of operations, usage amounts, error logs</li>
        <li>Technical data: IP address and browser information (for security purposes)</li>
      </ul>
      <h2>3. Purposes of processing and legal grounds</h2>
      <p>Your data is processed to manage your account, to provide the summarizing, read-aloud and quiz services, to keep the service secure and prevent abuse, and to enforce usage limits. Legal grounds: establishment and performance of a contract, legitimate interest and, where necessary, your explicit consent.</p>
      <h2>4. Parties to whom data is transferred</h2>
      <p>The following service providers are used to provide the service. For this reason your data may be transferred abroad:</p>
      <ul>
        <li>Hosting: OVHcloud (Germany)</li>
        <li>Database and authentication: Supabase [verify the region]</li>
        <li>AI processing: Anthropic (USA). Your document text is sent to this provider to generate summaries and answers.</li>
        <li>Read-aloud: [selected TTS provider]</li>
        <li>Voice commands (speech-to-text): OpenAI [verify the region and data retention terms from the provider's current documentation]</li>
        <li>YouTube transcript: YouTube (Google) [if you add videos; verify the region and terms]</li>
        <li>Email delivery: [selected email service]</li>
      </ul>
      <p>Transfers abroad are made in accordance with the conditions under Article 9 of the KVKK. [Clarify the basis of transfer (e.g. explicit consent or standard contract) according to current legislation.]</p>
      <h2>4.1. Voice commands</h2>
      <p>When you use the voice command feature, your microphone recording is sent to our server and to the speech recognition service only to understand a command of a few seconds. To recognize the document names in the workspace correctly, the titles (file names) of your documents are sent to the recognition service as hints along with the recording. Your recording is not written to disk on our server and the command text is not recorded in logs; only the daily usage count is kept. Microphone permission is granted from your browser and can be withdrawn at any time. You do not have to use the feature; everything can also be done with buttons and the keyboard. [Clarify the explicit consent text and retention periods with your lawyer.]</p>
      <h2>4.2. YouTube link</h2>
      <p>When you add a YouTube link, our server retrieves the video's publicly available captions (transcript) from YouTube and saves the text as a document in your account. The video file is not downloaded or stored. The video ID and our server's IP address are sent to YouTube to retrieve the captions; your link is not used for any other purpose. [Clarify the YouTube Terms of Service and copyright matters with your lawyer.]</p>
      <h2>5. Retention period</h2>
      <p>The original files you upload are not kept after the text has been extracted. Text, summary and quiz data are kept as long as your account is open; they are deleted when you delete your account. Audio files are kept for a limited time [state the period]. Security logs are kept for [state the period].</p>
      <h2>6. Your rights</h2>
      <p>Under Article 11 of the KVKK you have the right to learn whether your data is processed, to request information, to request correction or deletion, to object to processing and to claim compensation for damages. You can delete your account and all your data yourself at any time from the “My account” page. For other requests you can write to {ILETISIM}.</p>
      <h2>7. Important warning</h2>
      <p>Do not upload documents that contain other people's personal data or confidential information.</p>
    </article>
  );
}
