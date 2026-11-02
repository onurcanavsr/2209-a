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

## İngilizce komutlar (English commands)
Konuşma dili **arayüz dilidir**: arayüz İngilizceyken komutlar İngilizce söylenir ve konuşma İngilizce tanınır; Türkçeyken Türkçe.
Dili değiştirmek için üstteki Dil menüsü ya da sesle “İngilizceye geç” / “switch to Turkish” kullanılır.
Belge adı söylemek (ör. “open internship report”, “delete the second document”) ve test isteği (“create a ten question hard quiz”,
“go to question 3”) İngilizcede de aynı mantıkla çalışır. Her komutun ilk dört söylenişi:

| Komut | Söylenişler |
|---|---|
| Go to the workspace | “workspace”, “go to workspace”, “go to the workspace”, “home” |
| Go to my account | “my account”, “go to my account”, “account”, “account page” |
| Go to the admin panel | “admin”, “admin panel”, “go to admin”, “administration” |
| Go back to the previous page | “go back”, “previous page”, “back”, “navigate back” |
| Increase text size | “increase text size”, “bigger text”, “make text bigger”, “larger text” |
| Decrease text size | “decrease text size”, “smaller text”, “make text smaller”, “smaller” |
| Dark theme | “dark theme”, “dark mode” |
| Light theme | “light theme”, “light mode” |
| Automatic theme | “automatic theme”, “default theme”, “theme automatic”, “auto theme” |
| Sign out | “sign out”, “log out”, “logout”, “sign me out” |
| List the commands | “help”, “what can i say”, “commands”, “command list” |
| Switch to Turkish | “switch to turkish”, “turkish”, “speak turkish”, “change language to turkish” |
| Switch to English | “switch to english”, “english”, “speak english”, “change language to english” |
| Ask the Document section | “ask the document section”, “questions and answers”, “q and a”, “go to questions” |
| Summary section | “summary section”, “go to summary”, “summary page”, “go to the summary” |
| Practice Quiz section | “go to quiz”, “quiz section”, “practice quiz section”, “go to practice quiz” |
| Listen to the Text section | “listen to the text”, “listen to text section”, “listen section”, “listening section” |
| Extracted Text section | “extracted text”, “go to text”, “text section”, “go to the text” |
| My Notes section | “my notes”, “go to my notes”, “notes” |
| Flashcards section | “flashcards”, “go to flashcards”, “my cards”, “go to my flashcards” |
| Bookmarks section | “bookmarks”, “go to bookmarks”, “my bookmarks” |
| Summarize | “summarize”, “summarise”, “create a summary”, “make a summary” |
| Short summary | “short summary”, “brief summary”, “summarize briefly”, “create a short summary” |
| Medium summary | “medium summary”, “medium length summary”, “create a medium summary” |
| Detailed summary | “detailed summary”, “long summary”, “full summary”, “create a detailed summary” |
| Start / resume reading | “read”, “start reading”, “read aloud”, “read the document” |
| Pause reading | “stop”, “pause”, “wait”, “stop reading” |
| Fast forward 10 seconds | “fast forward”, “forward 10 seconds”, “ten seconds forward”, “skip ahead” |
| Rewind 10 seconds | “rewind”, “back 10 seconds”, “go back 10 seconds”, “ten seconds back” |
| Next section | “next section”, “next”, “skip section”, “skip this section” |
| Previous section | “previous section”, “previous”, “last section” |
| Read faster | “faster”, “read faster”, “speed up”, “increase speed” |
| Read slower | “slower”, “read slower”, “slow down”, “decrease speed” |
| List my documents | “list documents”, “list my documents”, “read my documents”, “read documents” |
| Upload a file | “upload document”, “upload file”, “upload a file”, “choose file” |
| Delete the document | “delete document”, “delete this document”, “delete the document”, “delete the file” |
| Ask the document a question | “ask a question”, “ask question”, “ask the document”, “i have a question” |
| Read the last answer | “read answer”, “read the answer”, “read the last answer”, “read answer again” |
| Clear the question history | “clear history”, “clear question history”, “delete question history”, “clear questions” |
| Create a practice quiz | “practice quiz”, “create quiz”, “create a quiz”, “create practice quiz” |
| Difficulty: easy | “easy”, “easy quiz”, “easy difficulty”, “difficulty easy” |
| Difficulty: medium | “medium”, “medium quiz”, “medium difficulty”, “difficulty medium” |
| Difficulty: hard | “hard”, “hard quiz”, “hard difficulty”, “difficulty hard” |
| 5 questions | “five questions”, “5 questions”, “five question quiz”, “5 question quiz” |
| 10 questions | “ten questions”, “10 questions”, “ten question quiz”, “10 question quiz” |
| Select option A | “option a”, “a”, “answer a”, “choice a” |
| Select option B | “option b”, “b”, “bee”, “answer b” |
| Select option C | “option c”, “c”, “see”, “sea” |
| Select option D | “option d”, “d”, “dee”, “answer d” |
| Next question | “next question”, “skip question”, “skip”, “next one” |
| Previous question | “previous question”, “go to previous question”, “last question” |
| Read the question and options | “read question”, “read the question”, “repeat question”, “read options” |
| Finish the quiz | “finish quiz”, “finish the quiz”, “submit quiz”, “show result” |
| Read the result | “read result”, “read my result”, “what is my score”, “how many did i get right” |
| Explain the mistakes | “read mistakes”, “explain mistakes”, “read wrong answers”, “explain wrong answers” |
| Retake the quiz | “retake quiz”, “retake the quiz”, “take the quiz again”, “redo quiz” |
| Delete the quiz | “delete quiz”, “delete this quiz”, “remove quiz” |

İfadeleri değiştirirseniz `api/app/stt/vocab.py` içindeki `KEYWORDS_EN` ipucu listesini de güncelleyin.
