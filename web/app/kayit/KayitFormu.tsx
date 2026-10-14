"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function KayitFormu() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 10) return setError("Parola en az 10 karakter olmalıdır.");
    if (password !== String(f.get("password2"))) return setError("Parolalar eşleşmiyor.");
    setBusy(true);
    const { error } = await createClient().auth.signUp({
      email: String(f.get("email")),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) return setError("Kayıt tamamlanamadı. Bilgilerinizi kontrol edip tekrar deneyin.");
    setDone(true);
  }

  if (done)
    return (
      <div className="card login" role="status">
        <h1>E-postanızı kontrol edin</h1>
        <p>Hesabınızı etkinleştirmek için e-postanıza bir doğrulama bağlantısı gönderdik (gelmezse gereksiz klasörüne de bakın). Doğrulamadan giriş yapamazsınız.</p>
        <p><Link href="/giris">Giriş sayfasına dön</Link></p>
      </div>
    );

  return (
    <form className="card login" onSubmit={onSubmit}>
      <h1>Hesap oluştur</h1>
      <label htmlFor="email">E-posta</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Parola</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="phint" />
      <p id="phint" className="hint">En az 10 karakter.</p>
      <label htmlFor="password2">Parola (tekrar)</label>
      <input id="password2" name="password2" type="password" autoComplete="new-password" required />
      <label className="check" htmlFor="onay">
        <input id="onay" name="onay" type="checkbox" required />
        <span>
          <Link href="/aydinlatma" target="_blank">Aydınlatma Metni</Link>&apos;ni okudum, <Link href="/kullanim-sartlari" target="_blank">Kullanım Şartları</Link>&apos;nı kabul ediyorum.
        </span>
      </label>
      <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
      <button className="btn" disabled={busy}>{busy ? "Kaydediliyor…" : "Kayıt ol"}</button>
      <p className="links"><Link href="/giris">Zaten hesabım var</Link></p>
    </form>
  );
}
