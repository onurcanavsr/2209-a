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
