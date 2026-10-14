"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function HesapSilme() {
  const router = useRouter();
  const [onay, setOnay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sil() {
    setBusy(true); setError("");
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { router.replace("/giris"); return; }
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (r.ok) {
        await sb.auth.signOut();
        router.replace("/giris?bilgi=silindi");
        return;
      }
      const j = await r.json().catch(() => ({}));
      setError(j.detail || "Hesap silinemedi. Lütfen daha sonra tekrar deneyin.");
    } catch {
      setError("Sunucuya ulaşılamadı. Lütfen daha sonra tekrar deneyin.");
    }
    setBusy(false);
  }

  return (
    <div>
      <p>Hesabınız ve yüklediğiniz tüm belgeler, özetler, ses dosyaları ve sınav sonuçlarınız kalıcı olarak silinir. Bu işlem geri alınamaz.</p>
      <label className="check" htmlFor="sil-onay">
        <input id="sil-onay" type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} />
        <span>Hesabımı ve tüm verilerimi kalıcı olarak silmek istediğimi onaylıyorum.</span>
      </label>
      <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
      <p><button type="button" className="btn danger" style={{ width: "auto" }} disabled={!onay || busy} onClick={sil}>{busy ? "Siliniyor…" : "Hesabımı sil"}</button></p>
    </div>
  );
}
