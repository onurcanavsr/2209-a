"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";

export default function ParolaSifirla() {
  const t = useT();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/parola-yenile`,
    });
    setBusy(false);
    setDone(true); // hesap var/yok bilgisini sızdırmamak için her durumda aynı mesaj
  }

  if (done)
    return (
      <div className="card login" role="status">
        <h1>{t("E-postanızı kontrol edin")}</h1>
        <p>{t("Bu e-posta ile kayıtlı bir hesap varsa parola yenileme bağlantısı gönderildi.")}</p>
        <p><Link href="/giris">{t("Giriş sayfasına dön")}</Link></p>
      </div>
    );

  return (
    <form className="card login" onSubmit={onSubmit}>
      <h1>{t("Parolamı unuttum")}</h1>
      <p>{t("E-posta adresinizi yazın, size yenileme bağlantısı gönderelim.")}</p>
      <label htmlFor="email">{t("E-posta")}</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <button className="btn" disabled={busy}>{busy ? t("Gönderiliyor…") : t("Bağlantı gönder")}</button>
      <p className="links"><Link href="/giris">{t("Girişe dön")}</Link></p>
    </form>
  );
}
