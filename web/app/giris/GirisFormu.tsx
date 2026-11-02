"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";

export default function GirisFormu({ bilgi, hata, kayitAcik }: { bilgi?: string; hata?: string; kayitAcik: boolean }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setBusy(false);
    if (error) return setError(t("E-posta veya parola hatalı, ya da e-postanız henüz doğrulanmadı."));
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="card login" onSubmit={onSubmit}>
      <h1>{t("Hoş geldiniz")}</h1>
      <p>{t("Devam etmek için giriş yapın.")}</p>
      {bilgi === "silindi" && <p className="msg ok" role="status">{t("Hesabınız ve verileriniz silindi.")}</p>}
      {bilgi === "yenilendi" && <p className="msg ok" role="status">{t("Parolanız güncellendi. Giriş yapabilirsiniz.")}</p>}
      {hata === "baglanti" && <p className="msg err" role="alert">{t("Bağlantı geçersiz veya süresi dolmuş. Lütfen işlemi tekrar başlatın.")}</p>}
      <label htmlFor="email">{t("E-posta")}</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">{t("Parola")}</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
      <button className="btn" disabled={busy}>{busy ? t("Giriş yapılıyor…") : t("Giriş yap")}</button>
      <p className="links">
        <Link href="/parola-sifirla">{t("Parolamı unuttum")}</Link>
        {kayitAcik && <Link href="/kayit">{t("Hesap oluştur")}</Link>}
      </p>
    </form>
  );
}
