"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Giris() {
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
    if (error) return setError("E-posta veya parola hatalı, ya da e-postanız henüz doğrulanmadı.");
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="card login" onSubmit={onSubmit}>
      <h1>Hoş geldiniz</h1>
      <p>Devam etmek için giriş yapın.</p>
      <label htmlFor="email">E-posta</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Parola</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <div role="alert" aria-live="assertive">{error && <p className="err">{error}</p>}</div>
      <button className="btn" disabled={busy}>{busy ? "Giriş yapılıyor…" : "Giriş yap"}</button>
    </form>
  );
}
