# E-posta (Brevo), Cloudflare ve Supabase Ayarları – yzders.com

Supabase'in yerleşik e-posta servisi çok düşük sınırlıdır ve gerçek kullanıcılara güvenilir
ulaşmaz. Doğrulama ve parola sıfırlama e-postaları için Brevo üzerinden kendi alan adınızdan
(`noreply@yzders.com`) göndereceğiz.

## 1. Cloudflare DNS (alan adı yzders.com)
Cloudflare → yzders.com → **DNS → Records**:

| Tür | Ad | Değer | Proxy |
|---|---|---|---|
| A | `@` | Sunucunun IP adresi | Proxied (turuncu bulut) |
| CNAME | `www` | `yzders.com` | Proxied |
| A | `api` | Sunucunun IP adresi | **DNS only (gri bulut)** |

- `api` kaydını gri bulut yapmanız önerilir: Cloudflare, proxy üzerinden gelen isteklerde yaklaşık
  100 saniyede zaman aşımına uğrar; uzun özet/akış yanıtları kesilebilir.
- **SSL/TLS → Overview** modu: **Full (strict)**. Sertifikayı sunucudaki Caddy otomatik alır.
- Sunucuda güvenlik duvarında 80 ve 443 portları açık olmalıdır.

## 2. Brevo ile alan adı doğrulama
1. Brevo → **Senders, Domains & Dedicated IPs → Domains → Add a domain** → `yzders.com`.
2. Brevo size **DNS kayıtları** verir (brevo-code TXT, DKIM CNAME'leri, DMARC TXT). Bunları Cloudflare
   DNS'e **tür/ad/değeri aynen** ekleyin. **Hepsi "DNS only" (gri bulut) olmalıdır.**
3. Brevo'da **Authenticate / Doğrula**'ya basın (yayılma dakikalar-saatler sürebilir).
4. **Senders** bölümünde `noreply@yzders.com` göndericisini ekleyin.
5. **SMTP & API → SMTP** sekmesinden bir **SMTP anahtarı** oluşturun. Güncel sunucu/port/kullanıcı
   bilgisini orada görürsünüz (genelde `smtp-relay.brevo.com`, port `587`). Ücretsiz günlük
   gönderim sınırını kontrol edin.

## 3. Supabase'e bağlama
**Authentication → Emails → SMTP Settings → Enable custom SMTP**
- Sender email: `noreply@yzders.com`, Sender name: `yzders`
- Host / Port / Username / Password: Brevo SMTP sayfasındaki bilgiler (şifre = SMTP anahtarı)

## 4. URL ayarları (çok önemli)
**Authentication → URL Configuration**
- **Site URL:** `https://yzders.com`
- **Redirect URLs:** `https://yzders.com/auth/callback` ve (yerel geliştirme için)
  `http://localhost:3000/auth/callback`

## 5. Sunucu
`.env` dosyasında `DOMAIN=yzders.com` yapın, sonra yeniden derleyip başlatın:

```
docker compose -f docker-compose.prod.yml up -d --build
```

(`CORS_ORIGINS`, Caddy ve site adresleri `DOMAIN` değerinden otomatik türetilir.)

## 6. E-posta şablonları
`supabase/email-templates/` içindeki 3 şablonu Supabase → **Authentication → Emails → Templates**
bölümündeki ilgili şablonlara yapıştırın (konu satırları dosyaların ilk satırında yazar).
