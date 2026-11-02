"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";

export default function KayitFormu() {
  const t = useT();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 10) return setError(t("Parola en az 10 karakter olmalıdır."));
    if (password !== String(f.get("password2"))) return setError(t("Parolalar eşleşmiyor."));
    setBusy(true);
    const { error } = await createClient().auth.signUp({
      email: String(f.get("email")),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) return setError(t("Kayıt tamamlanamadı. Bilgilerinizi kontrol edip tekrar deneyin."));
    setDone(true);
  }

  if (done)
    return (
      <div className="card login" role="status">
        <h1>{t("E-postanızı kontrol edin")}</h1>
        <p>{t("Hesabınızı etkinleştirmek için e-postanıza bir doğrulama bağlantısı gönderdik (gelmezse gereksiz klasörüne de bakın). Doğrulamadan giriş yapamazsınız.")}</p>
        <p><Link href="/giris">{t("Giriş sayfasına dön")}</Link></p>
      </div>
    );

  return (
    <form className="card login" onSubmit={onSubmit}>
      <h1>{t("Hesap oluştur")}</h1>
      <label htmlFor="email">{t("E-posta")}</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">{t("Parola")}</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="phint" />
      <p id="phint" className="hint">{t("En az 10 karakter.")}</p>
      <label htmlFor="password2">{t("Parola (tekrar)")}</label>
      <input id="password2" name="password2" type="password" autoComplete="new-password" required />
      <label className="check" htmlFor="onay">
        <input id="onay" name="onay" type="checkbox" required />
        <span>
          {t("{aydinlatma}’ni okudum, {sartlar}’nı kabul ediyorum.", { aydinlatma: "\u0001", sartlar: "\u0002" }).split(/(\u0001|\u0002)/).map((p, i) =>
            p === "\u0001" ? <Link key={i} href="/aydinlatma" target="_blank">{t("Aydınlatma Metni")}</Link>
            : p === "\u0002" ? <Link key={i} href="/kullanim-sartlari" target="_blank">{t("Kullanım Şartları")}</Link> : p)}
        </span>
      </label>
      <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
      <button className="btn" disabled={busy}>{busy ? t("Kaydediliyor…") : t("Kayıt ol")}</button>
      <p className="links"><Link href="/giris">{t("Zaten hesabım var")}</Link></p>
    </form>
  );
}
