# Akademik Asistan

Yapay zekâ destekli, erişilebilir akademik içerik platformu (TÜBİTAK 2209-A).

## Klasörler
- `web/` Next.js arayüzü (middleware ile zorunlu giriş)
- `api/` FastAPI sunucusu (tüm uç noktalar JWT ister)
- `supabase/migrations/` Veritabanı şeması ve RLS politikaları

## Kurulum
1. `.env.example` dosyasını `.env` olarak kopyalayıp doldurun; `web/.env.local.example` dosyasını `web/.env.local` yapın.
2. Supabase > SQL Editor'de `supabase/migrations/0001_init.sql` dosyasını çalıştırın.
3. Supabase > Authentication: e-posta sağlayıcısında "Confirm email" AÇIK olsun.
4. API: `docker compose up --build` (http://localhost:8000/docs)
5. Arayüz: `cd web && npm install && npm run dev` (http://localhost:3000)
6. İlk yöneticiyi atamak için SQL dosyasının sonundaki yorum satırlarını çalıştırın.

## Testler
`cd api && pip install -r requirements.txt && pytest`

## Canlı ortam (sunucu)
- `docker-compose.prod.yml`: yalnızca Caddy dışarı açık (80/443). API, web, Redis iç ağda.
- `deploy/Caddyfile`: otomatik HTTPS (alan adı `.env` içindeki `DOMAIN`).
- `.env.prod.example`: sunucudaki `~/app/.env` için şablon.
- `.github/workflows/ci-deploy.yml`: `main`'e push → testler → sunucuya yayın.
- `.github/workflows/keepalive.yml`: Supabase ücretsiz projesini uyanık tutar (0002_keepalive.sql gerekir).
- `scripts/backup.sh`: haftalık veritabanı yedeği.

## Faz 1 eklentileri
- Kayıt (davetli/açık seçenekli), parola sıfırlama, çıkış, hesap silme (KVKK), aydınlatma metni ve kullanım şartları (TASLAK, doldurulmalı)
- E-posta ve Supabase ayarları için: `docs/EPOSTA_KURULUM.md`

## Faz 2: belge yükleme ve metin çıkarma
- `api/app/extract.py`: PDF (pypdfium2), Word, PowerPoint; taranmış PDF'ler için Tesseract OCR (tur+eng)
- **Sayfa sayfa gezinme (Çıkarılan Metin):** PDF'te her sayfa, PowerPoint'te her slayt ayrı gösterilir; önceki/sonraki ve numaraya git düğmeleri vardır. `raw_text` DEĞİŞMEZ (özet, soru-cevap, test, sesli okuma aynı metni kullanır); yalnızca her sayfanın bu metindeki başlangıç karakteri `documents.page_starts` (jsonb) içinde saklanır. `GET /api/documents/{id}` yanıtında `page_word_starts` (her sayfadan önceki kelime sayısı), `GET /api/documents/{id}/pages/{n}` ile tek sayfa döner. Yer imi `word_index` değeri HER ZAMAN belge genelindeki kelime sırasıdır (sayfa içi sıra + sayfanın `word_offset`'i); eski yer imleri aynen çalışır. Boş/okunamayan sayfa boş görünür; OCR'la okunan görsel sayfa kendi sayfasında çıkar. **Word:** sayfalar, dosyaya Word'ün kaydettiği yerleşim işaretlerinden (`lastRenderedPageBreak`) ve yazarın koyduğu sayfa/bölüm sonlarından okunur; Word'deki sayfalarla aynıdır. Bu işaretler yoksa (Google Docs, LibreOffice, python-docx vb. ile oluşturulmuş dosya) uzun sayfalar paragraf sınırında ~3.000 karakterlik parçalara bölünür ve ekranda "yaklaşık" uyarısı çıkar. YouTube belgelerinde sayfa yoktur, tek metin gösterilir. **Bozuk Türkçe harfler:** Eski (Mac tabanlı) programlarla hazırlanmış bazı PDF'lerin metin katmanında ı→›, İ→‹, ğ→¤, ş→fl, Ş→fi gibi bozuk harfler bulunur (bozukluk PDF'in kendisindedir). Belgede kelime içinde çok sayıda › saptanırsa harfler otomatik düzeltilir ve belge notunda belirtilir; ş/Ş için ligatürün tek glif kutusunu paylaşan "fl"/"fi" çiftleri aranır, böylece gerçek "fiyat", "enflasyon" gibi sözcükler bozulmaz. Uzun belge sınırı: `MAX_TEXT_CHARS` (varsayılan 400000 ≈ 130-140 sayfa); aşılırsa sayfa gezintisi yalnızca alınan sayfaları gösterir ve ekranda açıklama çıkar. **Görsellerden okunan metin:** Belgedeki resim/fotoğraf/ekran görüntüleri OCR'dan geçer: Word'de satır içi ve yüzen resimler (tablodakiler dahil), PowerPoint'te slayttaki resimler, PDF'te metinli sayfalardaki resimler (sayfayı kaplayan tarama zeminleri ve simgeler atlanır). Sonuç `raw_text`'e KARIŞMAZ (özet, soru-cevap vb. etkilenmez); `documents.page_meta.images` içinde [{page, text, st}] olarak saklanır (`st`: ok | empty | skip). `GET /api/documents/{id}` yanıtında `images` ([{page, st}]) ve `GET /api/documents/{id}/images/{n}` ile n. görselin metni gelir. Ekranda "Görsellerden okunan metin" kutusunda görseller arasında ileri-geri gezilir, her görselin hangi sayfada/slaytta olduğu yazar, sayfa görünümünde "Bu sayfadaki görseller" düğmeleri vardır. Koyu zeminli ekran görüntüleri ters çevrilerek okunur; gürültü (çizgi, simge, anlamsız karakter) süzülür; aynı görsel tekrar okunmaz. Sınırlar: `OCR_MAX_IMAGES` (40), `OCR_MIN_IMAGE_PX` (48), `OCR_IMAGES_SECONDS` (240 sn toplam süre), `IMAGE_TEXT_MAX_CHARS` (6000). Sınır aşılırsa kalan görseller "okunmadı" diye listelenir. EMF/WMF/SVG gibi vektör resimler ve Word başlık/altbilgisi ile metin kutularındaki resimler okunmaz. **Kurulum:** ek SQL gerekmez (`page_meta` sütunu 0010'da var). **OCR işareti:** `documents.page_meta` (jsonb) her sayfanın türünü tutar (`text` | `ocr` | `image`). OCR ile okunan sayfada "OCR" uyarısı, okunamayan görüntü sayfasında ayrı uyarı çıkar; üstte OCR ile okunan sayfaların listesi (tıklayınca o sayfaya gider) bulunur. OCR yalnızca metni (25 karakterden az) olmayan PDF sayfalarına uygulanır; metinli sayfadaki fotoğraf ile Word/PowerPoint içindeki resimler okunmaz. **Kurulum:** API'yi yayınlamadan ÖNCE `0009_sayfa_gezintisi.sql` ve ardından `0010_sayfa_turleri.sql` dosyalarını Supabase SQL Editor'de çalıştırın. Bu güncellemeden önce yüklenmiş belgelerde sayfa bilgisi yoktur (dosya saklanmadığı için sonradan üretilemez); sayfa gezintisi istenen belge silinip yeniden yüklenmelidir.
- `api/app/store.py`: veri katmanı (her sorgu `user_id` ile sınırlı), `api/app/routers/documents.py`: yükleme/liste/detay/silme
- Yüklenen dosya SAKLANMAZ; yalnızca çıkarılan metin kaydedilir. Aynı dosya aynı kullanıcı için yeniden işlenmez (önbellek).
- Supabase'de `0003_documents_phase2.sql` çalıştırılmalıdır.
- Testler: `cd api && pytest` (35 test, gerçek OCR testi dahil)

## Faz 3: özetleme
- `api/app/summarize.py`: kısa/orta/ayrıntılı özet; 60.000 karakteri aşan belgeler bölümlere ayrılıp ucuz modelle özetlenir (map), nihai özet kaliteli modelle akıtılır (reduce)
- `api/app/routers/summaries.py`: `POST /api/documents/{id}/summarize` (SSE akışı), `GET /api/documents/{id}/summaries`
- Özetler `0004_summaries.sql` ile saklanır; aynı belge+seviye için tekrar model çağrılmaz. Günlük sınır: `DAILY_SUMMARY_LIMIT`.
- **PDF olarak indirme:** `GET /api/documents/{id}/summary/pdf?level=short|medium|detailed` kayıtlı özeti A4 PDF yapar (`api/app/pdfexport.py`, reportlab). Başlık, belge adı/tarih, bölüm başlıkları, maddeler ve kalın terimler özetin sırasıyla yazılır; metin vektördür (kopyalanınca düzenli çıkar, aranabilir) ve her sayfada "Sayfa n / m" bulunur. Yapay zekâ çağrısı yapmaz, kota harcamaz; özet o seviyede kayıtlı değilse 404 döner. Türkçe karakterler için DejaVu Sans gerekir: Docker imajında `fonts-dejavu-core` kuruludur; imaj dışında çalıştırırsanız `PDF_FONT_DIR` ile yazı tipi klasörünü verin (yoksa uç nokta 503 döner).
- Gerekli: sunucu `.env` içinde `ANTHROPIC_API_KEY`
- Testler: 49 (`cd api && pytest`), sahte model kullanır; gerçek modelle deneme sizin ilk özetinizdir.

## Faz 4: seslendirme
- `api/app/speech.py`: Markdown temizleme, cümle/bölüm ayırma; `api/app/tts/`: sağlayıcılar (edge-tts, Azure Speech)
- `api/app/routers/audio.py`: `/audio/manifest`, `/audio/segment/{n}`, `/audio/download` (özet veya asıl metin)
- Bölümler sunucu diskinde (`/data/audio`, Docker volume `audio_data`) `AUDIO_TTL_DAYS` gün saklanır; belge/hesap silinince hemen silinir
- Günlük kota: `DAILY_TTS_CHARS` (yalnızca yeni sentezlenen karakterler sayılır, önbellekten dinlemek ücretsizdir)
- Oynatıcı: `web/app/belge/[id]/Oynatici.tsx` (hız, ses, ±10 sn, bölüm atlama, MP3 indirme)
- Testler: 71 (`cd api && pytest`)

## Faz 5: soru-cevap ve pekiştirme soruları (quiz)
- `api/app/qa.py` + `api/app/routers/qa.py`: `POST /api/documents/{id}/ask` (SSE), `GET|DELETE /api/documents/{id}/qa`. Arama harici embedding servisi gerektirmez: Türkçeye uyarlanmış BM25 (küçük harf/İ-I kuralı, aksan sadeleştirme, ek yok sayan 5 harfli kök). 30.000 karakterden kısa belgeler aramasız, tümüyle modele verilir. Cevap yalnızca belgeye dayanır, belgede yoksa söyler; cevapta anılan `[Bölüm n]` kaynakları ayrıca döner.
- `api/app/quiz.py` + `api/app/routers/quiz.py`: `POST|GET /api/documents/{id}/quizzes`, `GET|DELETE /api/quizzes/{id}`, `POST|GET /api/quizzes/{id}/attempts`. Model JSON üretir; sunucu doğrular (4 farklı şık, geçerli cevap, "hepsi/hiçbiri" şıkları ve kopya sorular elenir), şıkları karıştırır. Doğru cevap ve açıklamalar istemciye YALNIZCA puanlamadan sonra gider.
- Veritabanı: `0005_qa_quiz.sql` (`qa_messages`, `quizzes`, `quiz_attempts`; RLS açık). Supabase SQL Editor'de çalıştırılmalıdır. `document_chunks` tablosu kullanılmaz.
- Günlük sınırlar: `DAILY_QA_LIMIT` (60), `DAILY_QUIZ_LIMIT` (15); belge başına en fazla 20 test saklanır.
- Arayüz: `web/app/belge/[id]/SoruCevap.tsx`, `Quiz.tsx` (radyo grupları, durum duyuruları, doğru/yanlış renge ek olarak metinle belirtilir).
- Testler: `api/tests/test_qa.py`, `test_quiz.py` (sahte depo ve sahte model kullanır).

## Faz 5b: sesli okumada kelime vurgusu
- Okunan kelime, ekrandaki metnin KENDİ üzerinde vurgulanır (özet: `Ozetleme.tsx`; sesli okurken: "Çıkarılan metin"). Ayrı bir kutu açılmaz. Oynatıcıdaki "Kelime vurgusu" düğmesiyle açılıp kapatılır; tercih tarayıcıda hatırlanır.
- Sağlayıcılardan kelime zamanı gelmediği için `web/lib/takip.ts`, her kelimenin zamanını sesin gerçek süresine, kelime uzunluğuna ve noktalama duraklamalarına göre orantılı hesaplar. Edge/Azure ve önbellekten bağımsızdır; yaklaşıktır (bazen birkaç kelimelik sapma olabilir).
- Seslendirilen metin (Markdown temizlenmiş, noktalama eklenmiş) ekrandaki metinle birebir aynı olmadığından `hizala()` iki kelime listesini sırayla eşleştirir (ekler, `**kalın**'ek`, "Slayt 3", tablo ayraçları, `snake_case` gibi farklara dayanıklıdır).
- `web/lib/ozetAgaci.ts`: özetin ayrıştırılmış ağacı; ekrandaki çizim (`lib/markdown.tsx`) ve kelime numaraları aynı ağaçtan üretilir. `web/lib/vurgu.ts`: React'i yeniden çizdirmeden `span.k.on` sınıfını değiştirir ve gerekirse sayfayı kaydırır (kullanıcı kendisi kaydırdıysa 4 sn karışmaz; `prefers-reduced-motion` desteklenir).
- Yeni uç nokta: `GET /api/documents/{id}/audio/text` — bölümlerin SESLENDİRİLEN metnini döndürür (kota harcamaz; çok uzun belgelerde ilk 60.000 karakterle sınırlıdır).

## Faz 6: yönetim paneli
- **Kurulum:** Supabase SQL Editor'de `0006_admin.sql` çalıştırılır (0001-0005'ten sonra). İlk yönetici için `0001_init.sql` sonundaki yorum satırları kullanılır. Sayfalar `/admin` altındadır (Genel bakış, Kullanıcılar, Kullanım ve maliyet); yalnızca yönetici rolü girebilir.
- **Kullanıcılar:** ara/sayfala, devre dışı bırak/etkinleştir, yönetici yap/kaldır, sil. Her işlem `admin_audit` tablosuna yazılır ve sayfada listelenir.
- **Devre dışı hesap gerçekten durur:** `profiles.is_active` önceden hiçbir yerde kontrol edilmiyordu. Artık (1) Supabase'te hesap yasaklanır (yeni oturum açamaz), (2) `api/app/active_guard.py` ara katmanı mevcut jetonla gelen isteklere de 403 döner (önbellek en çok 30 sn; yönetici işlemi önbelleği anında temizler). Hesabı görme ve **silme** (`GET/DELETE /api/me`) KVKK gereği engellenmez. Ara katman yalnızca `SUPABASE_SERVICE_ROLE_KEY` tanımlıyken çalışır; veritabanına ulaşılamazsa istek geçirilir.
- **Güvenlik kuralları:** yönetici uç noktaları hem JWT rolünü hem de canlı `profiles.role/is_active` değerini doğrular (yetkisi alınan yönetici jetonu bitene kadar işlem yapamaz). Yönetici kendi hesabında işlem yapamaz; yönetici hesabı devre dışı bırakılamaz/silinemez (önce rol kaldırılır); devre dışı hesap yönetici yapılamaz.
- **Maliyet TAHMİNDİR:** `usage_logs` yalnızca (eylem, birim) saklar, gerçek token sayısını değil. `api/app/costs.py` birimlerden, `COST_*` değişkenlerindeki fiyatlarla (varsayılan: Sonnet 5.5 $2/$10, Haiku 4.5 $1/$5 milyon token başına; Azure TTS $15/milyon karakter, Edge ücretsiz) kaba bir tutar üretir. Gerçek fatura için Anthropic Console / Azure panosuna bakın. Soru-cevap birimi bu sürümden itibaren modele giden istem uzunluğudur (eski kayıtlarda yalnızca soru uzunluğu olduğundan eski soru maliyetleri düşük görünür).
- **Limitler salt okunur gösterilir** (`GET /api/admin/limits`); değiştirmek için ortam değişkeni güncellenip API yeniden başlatılır. `system_settings` tablosu hâlâ kullanılmıyor.
- Testler: `test_admin.py` (uç noktalar), `test_costs.py`, `test_active_guard.py` (son ikisi FastAPI gerektirmez).


## Faz 7: yeni arayüz, notlar, öğrenme kartları ve yer imleri
- **Kurulum:** Supabase SQL Editor'de `0007_calisma_araclari.sql` çalıştırılır (0001-0006'dan sonra). Yeni ortam değişkeni: `DAILY_CARD_LIMIT` (günlük yapay zekâ ile kart üretimi, varsayılan 10).
- **Arayüz:** Açık/koyu/otomatik tema ve A−/A+ yazı boyutu üst çubukta durur. Giriş yapınca sol menüde *Ana sayfa* ile açık belgenin bölümleri (Özet, Belgeye Soru Sor, Pekiştirme Testi, Sesli Okuma, Çıkarılan Metin, Notlarım, Öğrenme Kartları, Yer İmleri) görünür; bölüm adresi `/belge/<id>?b=<bölüm>` biçimindedir. Yönetici hesabında menünün altında *Yönetim* grubu (Genel bakış, Kullanıcılar, Kullanım ve maliyet) çıkar. Belge dışındaki sayfalarda bölümler en son açılan belgeye gider.
- **Notlar, yer imleri, kartlar:** Belgeye ve kullanıcıya özeldir (`/api/documents/{id}/notes|bookmarks|flashcards`, RLS açık). Belge başına en çok 200 not, 100 yer imi, 200 kart. Yer imi, *Çıkarılan Metin* bölümünde bir kelimeye tıklayarak (ya da kelime sırası yazarak) eklenir. Kartlar elle eklenir veya belgeden üretilir; üretim `usage_logs`'a `cards` olarak yazılır ve yönetim panelindeki maliyet tahminine girer.
- **Sesli komutlar:** Bölüm geçişleri ("özete git", "teste git", "notlarım", "öğrenme kartları", "yer imleri", "çıkarılan metin", "sesli okuma", "soru cevap bölümü") ve gelişmiş sesli akışlar (soruyu dikte etme, evet/hayır onayı, test şıkkı seçme) birleşik çalışır; "pekiştirme testi" ve "soru sor" başka bölümdeyken de ilgili bölüme geçip işi başlatır. Ayrıntı: `docs/SESLI_KOMUT.md`.
- Yönetim panelindeki yatay menü kaldırıldı (`AdminMenu.tsx` silindi); bağlantılar sol menüdedir.

## Faz 8: YouTube bağlantısından transkript
- **Kullanım:** Çalışma Alanı'ndaki "YouTube videosu ekle" kutusuna bağlantı yapıştırılır; videonun altyazısı (transkript) belge olarak kaydedilir. Sonrası PDF/Word ile aynıdır: özet, belgeye soru sor, test, kartlar, sesli okuma, yer imleri. Altyazısı olmayan, özel ya da kısıtlı videolar çalışmaz; otomatik altyazılarda hata olabilir (belgede uyarı notu görünür).
- **Nasıl çalışır:** `api/app/youtube.py` yalnızca YouTube adreslerinden 11 karakterlik video kimliğini alır (başka adrese istek atılmaz), `youtube-transcript-api` ile altyazıyı okur (elle girilmiş tr/en → otomatik tr/en → videonun ilk altyazısı) ve paragraflara böler. Başlık YouTube oEmbed'den alınır. Uç nokta: `POST /api/documents/youtube`. Aynı video aynı kullanıcıya tekrar çekilmez; günlük yükleme sınırına sayılır.
- **Önemli sınır:** YouTube, bulut/sunucu IP'lerinden gelen transkript isteklerini sıkça engeller (kendi bilgisayarınızda çalışıp sunucuda "engelliyor" hatası görmeniz normaldir). Çözüm için `.env`'ye bir HTTP proxy verin: `YOUTUBE_PROXY_URL=http://kullanici:parola@host:port`. Proxy yoksa ve engellenirse özelliği kullanmayın ya da kutuyu kaldırın.
- **Hukuki not:** Bu resmî bir YouTube API'si değildir; YouTube Hizmet Şartları ve telif konusunu `aydinlatma` sayfasındaki köşeli parantezli notla birlikte netleştirin. Kurulum: `pip install -r api/requirements.txt` (`youtube-transcript-api` eklendi).

## Faz 9: Türkçe / İngilizce (iki dilli arayüz, özet, sesli okuma ve sesli komut)
- **Kurulum:** Supabase SQL Editor'de `0008_i18n.sql` çalıştırın (özetler artık belge + seviye + **dil** başına tek kayıttır; mevcut özetler Türkçe sayılır). İsteğe bağlı yeni ortam değişkeni: `TTS_VOICE_EN` (varsayılan `en-US-AriaNeural`). API ve web yeniden yayınlanır.
- **Dil seçimi:** Üst çubuktaki **Dil** menüsü (ya da "İngilizceye geç" / "switch to Turkish" sesli komutu). Seçim `lang` çerezinde saklanır; ilk ziyarette tarayıcının dili (Accept-Language) kullanılır, bulunamazsa Türkçe. Tüm arayüz, hata iletileri, belge notları ve hukuki sayfalar seçilen dilde görünür.
- **Dil tüm katmana taşınır:** Web, her API isteğine `X-Lang` başlığı ekler. API bu dille (1) hata ve durum iletilerini çevirir, (2) özet, soru-cevap, test ve kart istemlerini o dilde yazdırır (belge hangi dilde olursa olsun çıktı seçilen dildedir), (3) seslendirme sesini seçer, (4) sesli komut tanımada konuşma dilini belirler.
- **Özet:** Türkçe ve İngilizce özetler ayrı saklanır; dil değişince kendi dilindeki özet gelir, yoksa oluşturulabilir. Sesli okuma özeti de aynı dilde okur.
- **Sesli okuma:** Türkçe: Emel, Ahmet. İngilizce: Aria, Guy (ABD), Sonia, Ryan (İngiltere). Seçili ses diğer dile aitse dilin varsayılan sesi kullanılır. "[Slayt 3]" işaretleri İngilizcede "Slide 3" diye okunur.
- **Sesli komut:** Komutlar arayüz dilinde söylenir; tüm komutların İngilizcesi vardır (`web/lib/ses/komutlar.en.ts`, tablo: `docs/SESLI_KOMUT.md`). Konuşma tanıma dili isteğe göre `tr`/`en` seçilir.
- **Yeni metin eklerken:** Arayüzde kaynak metin Türkçe yazılır ve `t("…")` ile sarılır; İngilizcesi `web/lib/i18n/en.ts`'e eklenir (`lib/i18n/core.test.ts` eksikleri yakalar). API iletileri için `api/app/i18n.py` (`EN` / `PATTERNS`; `tests/test_i18n.py` denetler).
- **Kapsam dışı:** Supabase'in gönderdiği doğrulama / parola sıfırlama e-postalarının metni Supabase panelindeki şablonlardan düzenlenir (dil başına ayrı şablon yok; iki dilli bir metin yazabilirsiniz).
