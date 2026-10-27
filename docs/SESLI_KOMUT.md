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

## Komutları değiştirmek
`web/lib/ses/komutlar.ts` içindeki `KOMUTLAR` listesi. İpucu listesini (`api/app/stt/vocab.py`) de güncelleyin.
Yeni bir bileşende komut bağlamak için `useSesKomutlari({ "id": () => {...} })` kullanın; `false` döndürmek
"bu komut bende değil" demektir.

## Bilinen sınırlar
- Dosya yükleme penceresi sesle açılamaz (tarayıcılar gerçek tıklama ister).
- Sürekli dinleme (eller serbest) yoktur: her komut için düğmeye basılır. Okuma sürerken düğmeye basılırsa okuma duraklar.
- Soru-cevap dikte ve test şıkkı seçme henüz bağlanmadı.
- İnternet bağlantısı gerekir; gecikme ağa ve tanıma servisine bağlıdır.

## Elle test matrisi (gerçek cihazlarda)
Chrome, Edge, Brave, Opera, Firefox (masaüstü); Android Chrome; iPhone Safari. Her birinde: izin isteme, bip, komut,
iptal (Esc / tekrar basma), izin reddi mesajı. Ekran okuyucu: NVDA+Firefox/Chrome, VoiceOver+Safari.
