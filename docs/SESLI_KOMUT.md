# Sesli komut: kurulum ve işletim

Tarayıcı mikrofonu kaydeder (tüm güncel tarayıcılarda aynı), konuşma sunucuda metne çevrilir
(OpenAI `gpt-transcribe`), komut tarayıcıda eşleştirilip çalıştırılır. Web Speech API kullanılmaz;
bu yüzden Brave, Opera ve Firefox'ta da çalışır.

## Açmak
1. platform.openai.com'da hesap açın, **Billing**'den küçük bir bakiye yükleyin, bir **API anahtarı** üretin.
   Dashboard'da aylık bütçe/kullanım sınırı belirleyin. (Ücretsiz katman yoktur.)
2. Sunucudaki `~/app/.env` dosyasına ekleyin:
   ```
   SESLI_KOMUT=true
   OPENAI_API_KEY=sk-...
   ```
3. `main`'e göndererek (CI) ya da `docker compose -f docker-compose.prod.yml up -d --build` ile yeniden yayınlayın
   (`SESLI_KOMUT` derleme sırasında okunur).
4. Girişten sonra üst çubukta **Sesli komut** ve **Komutlar** düğmeleri görünür.

## Kapatmak (acil)
`OPENAI_API_KEY`'i boşaltıp API'yi yeniden başlatın: düğme kendiliğinden gizlenir.
Kalıcı kapatma için `SESLI_KOMUT=false` ve yeniden yayın.

## Maliyet ve sınırlar
- `gpt-transcribe`: ses dakikası başına 0,0045 $ (OpenAI model sayfası; güncelini doğrulayın). 3 sn'lik komut ≈ 0,000225 $.
- Kullanıcı başına günlük hak: `DAILY_STT_REQUESTS` (varsayılan 300). Tek kayıt en çok `STT_MAX_BYTES` (400 KB).
- Yönetim panelindeki STT tutarı **tahmindir** (komut sayısı × ortalama süre).

## Komutlar (özet)
Düğmeye bas → bip → konuş. Sayfaya göre geçerli komutlar değişir; "yardım" ya da **Komutlar** düğmesi o anki listeyi gösterir.

- **Her yerde:** çalışma alanına git, hesabıma git, geri git, yazıyı büyüt/küçült, koyu/açık/otomatik tema, çıkış yap, yardım.
- **Çalışma alanı:** *belge adını söyle* ("staj raporu", "fizik ders notlarını aç"), *"ikinci belge" / "son belge"*,
  "belgeleri listele", "dosya yükle" (düğmeye odaklanır), "… belgesini sil" (sesli onay ister).
- **Belge sayfası, bölümlere geçiş (sol menü):** "özete git", "teste git" / "pekiştirme testi bölümü", "soru cevap bölümü", "metni dinle", "çıkarılan metin", "notlarım", "öğrenme kartları", "yer imleri".
- **Özet bölümü:** özetle / kısa-orta-ayrıntılı özet, oku / dur / devam et / ileri sar / geri sar / sonraki-önceki bölüm / daha hızlı-yavaş. Bu komutlar yalnızca ilgili bölüm açıkken geçerlidir; "yardım" o an geçerli olanları söyler.
- **Soru sor** (başka bölümdeyken de çalışır; soruyu söyleyince Belgeye Soru Sor bölümüne geçip cevaplar): "soru sor" de → bip → sorunuzu söyleyin (mikrofon kendiliğinden yeniden açılır) → cevap sesli duyurulur; "cevabı oku".
- **Pekiştirme testi** (başka bölümdeyken de çalışır; önce Pekiştirme Testi bölümüne geçer, testi orada başlatır): "pekiştirme testi" ya da "10 soruluk zor test oluştur" → soru ve şıklar okunur →
  "B şıkkı" / "ikinci şık" → sıradaki soru kendiliğinden okunur; "3. soruya git", "soruyu oku", "testi bitir", "sonucu oku", "yanlışları oku".
- **Geri alınamaz işlemler** (belge/test/geçmiş silme, boş soruyla bitirme) önce "… Evet ya da hayır?" diye sorar.

Şık harfleri (be/de/ce) sesli olarak birbirine karışabilir; **"birinci, ikinci, üçüncü, dördüncü şık"** daha güvenilirdir. Sistem emin olamazsa tahmin yürütmez, tekrar ister.

## Yeni arayüzle birlikte çalışma (sol menü ve bölümler)
Belge sayfası artık bölümlere ayrılmıştır (`/belge/<id>?b=soru|ozet|test|dinle|metin|notlar|kartlar|imler`); aynı anda yalnızca bir bölüm ekrandadır. Bunun sesli komutlara etkisi:
- Bir bölümün komutları (şık seçme, cevabı oku, özetle, oku…) yalnızca o bölüm açıkken geçerlidir.
- "Bölüm adı" komutları (`bolum.*`, `web/lib/ses/komutlar.ts`) her zaman geçerlidir; "pekiştirme testi" ve "soru sor" ise bölüme geçip işi başlatır (`web/lib/ses/bolumGecis.ts`: istek bellekte bir kez bırakılır, hedef bölüm açılınca uygulanır).
- "Çıkış yap" komutu hesap menüsündeki çıkış formunu kullanır; form menü kapalıyken de sayfada durmalıdır (`Kabuk.tsx`).
- Komut ifadeleri iki komutta aynı olamaz: `komutlar.test.ts` bunu denetler.

## Veri
Tanıma isteğiyle birlikte, çalışma alanındaki en çok 15 belgenin başlığı **ipucu** olarak OpenAI'a gider (dosya adlarını doğru
tanımak için). Bu, aydınlatma metninde belirtildi. İsterseniz `web/app/Calisma.tsx` içindeki `useSesIpuclari` çağrısını kaldırarak kapatırsınız.

## Komutları değiştirmek
`web/lib/ses/komutlar.ts` içindeki `KOMUTLAR` listesi. İpucu listesini (`api/app/stt/vocab.py`) de güncelleyin.
Yeni bir bileşende komut bağlamak için `useSesKomutlari({ "id": () => {...} })` kullanın; `false` döndürmek
"bu komut bende değil" demektir.

## Bilinen sınırlar
- **Dosya yükleme penceresi sesle açılamaz** (tarayıcılar gerçek tıklama ister). "Dosya yükle" komutu düğmeye odaklanır;
  açmak için bir kez Boşluk/Enter gerekir. Tam elsiz kullanım için işletim sistemi ses kontrolü (Windows Ses Erişimi, macOS/iOS Voice Control, Android Voice Access) ya da anahtar cihazı gerekir.
- **Giriş (e-posta/şifre) sesle yapılamaz**; şifre alanına konuşmak güvenli değildir. Parola yöneticisi ya da cihaz kilidiyle oturum açık tutulmalıdır.
- Sürekli dinleme (eller serbest) yoktur: her komut için düğmeye basılır (takip soruları hariç, onlar kendiliğinden açılır).
  Okuma sürerken düğmeye basılırsa okuma duraklar; "devam et" ile sürer.
- Cevap ve test metinleri **ekran okuyucunun canlı bölgesiyle** okunur; ekran okuyucusu olmayan kullanıcılar için bunları
  sesli okuyan bir mod (TTS) henüz yoktur. Kendi sesini duyma riskine karşı, takip sorularında istem uzunluğuna göre kısa bir bekleme uygulanır.
- İnternet bağlantısı gerekir; gecikme ağa ve tanıma servisine bağlıdır.

## Elle test matrisi (gerçek cihazlarda)
Chrome, Edge, Brave, Opera, Firefox (masaüstü); Android Chrome; iPhone Safari. Her birinde: izin isteme, bip, komut,
iptal (Esc / tekrar basma), izin reddi mesajı. Ekran okuyucu: NVDA+Firefox/Chrome, VoiceOver+Safari.
