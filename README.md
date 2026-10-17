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
- `api/app/store.py`: veri katmanı (her sorgu `user_id` ile sınırlı), `api/app/routers/documents.py`: yükleme/liste/detay/silme
- Yüklenen dosya SAKLANMAZ; yalnızca çıkarılan metin kaydedilir. Aynı dosya aynı kullanıcı için yeniden işlenmez (önbellek).
- Supabase'de `0003_documents_phase2.sql` çalıştırılmalıdır.
- Testler: `cd api && pytest` (35 test, gerçek OCR testi dahil)

## Faz 3: özetleme
- `api/app/summarize.py`: kısa/orta/ayrıntılı özet; 60.000 karakteri aşan belgeler bölümlere ayrılıp ucuz modelle özetlenir (map), nihai özet kaliteli modelle akıtılır (reduce)
- `api/app/routers/summaries.py`: `POST /api/documents/{id}/summarize` (SSE akışı), `GET /api/documents/{id}/summaries`
- Özetler `0004_summaries.sql` ile saklanır; aynı belge+seviye için tekrar model çağrılmaz. Günlük sınır: `DAILY_SUMMARY_LIMIT`.
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
- Okunan kelime, ekrandaki metnin KENDİ üzerinde vurgulanır (özet: `Ozetleme.tsx`; metin dinlerken: "Çıkarılan metin"). Ayrı bir kutu açılmaz. Oynatıcıdaki "Kelime vurgusu" düğmesiyle açılıp kapatılır; tercih tarayıcıda hatırlanır.
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

