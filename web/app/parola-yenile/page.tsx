"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ParolaYenile() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 10) return setError("Parola en az 10 karakter olmalıdır.");
    if (password !== String(f.get("password2"))) return setError("Parolalar eşleşmiyor.");
    setBusy(true);
    const sb = createClient();
    const { error } = await sb.auth.updateUser({ password });
    if (error) { setBusy(false); return setError("Parola güncellenemedi. Bağlantının süresi dolmuş olabilir, işlemi yeniden başlatın."); }
    await sb.auth.signOut();
    router.replace("/giris?bilgi=yenilendi");
  }

  return (
    <form className="card login" onSubmit={onSubmit}>
      <h1>Yeni parola belirle</h1>
      <label htmlFor="password">Yeni parola</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="phint" />
      <p id="phint" className="hint">En az 10 karakter.</p>
      <label htmlFor="password2">Yeni parola (tekrar)</label>
      <input id="password2" name="password2" type="password" autoComplete="new-password" required />
      <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
      <button className="btn" disabled={busy}>{busy ? "Kaydediliyor…" : "Parolayı kaydet"}</button>
    </form>
  );
}
