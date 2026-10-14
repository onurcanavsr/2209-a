# E-posta ve Supabase Ayarları (sizin yapacağınız adımlar)

Supabase'in yerleşik e-posta servisi çok düşük sınırlıdır ve gerçek kullanıcılara güvenilir
ulaşmaz. Doğrulama ve parola sıfırlama e-postaları için kendi alan adınızdan gönderen bir
servis bağlayacağız.

## 1. E-posta servisi (Resend veya Brevo)
1. Hesap açın, **alan adı ekleyin**: `sentezapp.com.tr`
2. Servis size birkaç **DNS kaydı** verir (SPF ve DKIM; bazen bir MX/TXT daha).
   Bunları Türk Ticaret DNS panelinden, servisin gösterdiği tür/ad/değerle aynen ekleyin.
3. Servis panelinde "Verify/Doğrula"ya basın (DNS yayılması dakikalar-saatler sürebilir).
4. Bir **SMTP bilgisi veya API anahtarı** oluşturun. Servisin belgesindeki güncel SMTP
   sunucu/port/kullanıcı bilgilerini kullanın. Ücretsiz günlük gönderim sınırını kontrol edin.

## 2. Supabase'e bağlama
**Authentication → Emails → SMTP Settings → Enable custom SMTP**
- Sender email: `noreply@sentezapp.com.tr`, Sender name: `Sentez`
- Host / Port / Username / Password: servisten aldığınız bilgiler

## 3. URL ayarları (çok önemli)
**Authentication → URL Configuration**
- **Site URL:** `https://sentezapp.com.tr`
- **Redirect URLs:** `https://sentezapp.com.tr/auth/callback` ve (yerel geliştirme için)
  `http://localhost:3000/auth/callback`

## 4. E-posta şablonları
**Authentication → Emails → Templates** altında üç şablonu, `supabase/email-templates/`
klasöründeki dosyalarla değiştirin (konu satırı dosyanın ilk satırındaki yorumda yazar):
Confirm signup, Reset password, Invite user.

## 5. Kayıt politikası
- **Herkese açık kayıt:** `.env`'de `REGISTRATION_OPEN=true` ve Supabase'de
  *Sign In / Providers → Allow new users to sign up* AÇIK.
- **Yalnızca davetle (başlangıç için önerilir):** `REGISTRATION_OPEN=false` ve Supabase'de
  *Allow new users to sign up* KAPALI. Kullanıcı eklemek için
  *Authentication → Users → Invite user* kullanın.
- Her iki durumda **Confirm email** AÇIK kalmalı.
- Kayıt değişikliklerinde siteyi yeniden yayınlayın (`REGISTRATION_OPEN` derleme sırasında okunur).

## 6. Test listesi
1. Yeni e-postayla kayıt (veya davet) → e-posta geldi mi, bağlantı siteye döndürüp giriş yaptırıyor mu?
2. E-postayı **telefonda** açın (farklı cihaz) → yine çalışmalı.
3. "Parolamı unuttum" → yeni parola → giriş.
4. Hesabım → hesabı sil → Supabase Users listesinden kullanıcı kaybolmuş olmalı.
5. Yönetici olmayan hesapla `/admin` → ana sayfaya yönlenmeli.
