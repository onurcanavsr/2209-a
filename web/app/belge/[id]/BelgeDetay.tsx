"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, hataMesaji, DURUM, type Belge } from "@/lib/api";
import Ozetleme from "./Ozetleme";
import Oynatici from "./Oynatici";

export default function BelgeDetay({ id }: { id: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<Belge | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/documents/${id}`);
      if (r.status === 404) return setError("Belge bulunamadı.");
      if (!r.ok) return setError(await hataMesaji(r, "Belge yüklenemedi."));
      setDoc(await r.json());
    } catch {
      setError("Sunucuya ulaşılamadı.");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (doc?.status !== "processing") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [doc, load]);

  async function sil() {
    if (!window.confirm("Bu belge silinsin mi? Bu işlem geri alınamaz.")) return;
    const r = await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
    if (r.ok) router.replace("/");
    else setError(await hataMesaji(r, "Belge silinemedi."));
  }

  if (error) return <div><p className="msg err" role="alert">{error}</p><p><Link href="/">← Çalışma alanına dön</Link></p></div>;
  if (!doc) return <p>Yükleniyor…</p>;

  const uzun = doc.truncated || (doc.char_count ?? 0) > (doc.text_preview?.length ?? 0);
  return (
    <div className="prose">
      <p><Link href="/">← Çalışma alanına dön</Link></p>
      <h1>{doc.title}</h1>
      <p className="hint">
        {doc.kind.toUpperCase()}
        {doc.page_count ? ` · ${doc.page_count} ${doc.kind === "pptx" ? "slayt" : "sayfa"}` : ""}
        {doc.char_count ? ` · ${doc.char_count.toLocaleString("tr-TR")} karakter` : ""}
        {" · "}<span className={`badge ${doc.status}`}>{DURUM[doc.status]}</span>
      </p>
      <div role="status" aria-live="polite">
        {doc.status === "processing" && <p className="msg ok">Belge işleniyor, bu sayfa otomatik güncellenir…</p>}
      </div>
      {doc.status === "failed" && <p className="msg err" role="alert">{doc.error}</p>}
      {doc.note && doc.status === "ready" && <p className="msg warn">{doc.note}</p>}
      {doc.status === "ready" && <Ozetleme docId={id} baslik={doc.title} />}
      {doc.status === "ready" && (
        <>
          <h2>Metni dinle</h2>
          <Oynatici key="metin" docId={id} source="text" etiket="Metni dinle"
            dosyaAdi={`${doc.title.replace(/\.[^.]+$/, "")} - metin.mp3`} indirilebilir={(doc.char_count ?? 0) <= 60000} />
          <p className="hint">Metnin tamamını dinlemek günlük sesli okuma kotanızdan düşer; özeti dinlemek çok daha kısadır.</p>
          <h2>Çıkarılan metin</h2>
          <div className="doctext" tabIndex={0} role="region" aria-label="Çıkarılan metin (okumak için ok tuşlarını kullanın)">
            {doc.text_preview}
          </div>
          {uzun && <p className="hint">Burada metnin yalnızca ilk bölümü gösteriliyor. Özetleme ve sesli okuma tüm metni kullanacak.</p>}
        </>
      )}
      <p style={{ marginTop: 24 }}><button type="button" className="btn danger" style={{ width: "auto" }} onClick={sil}>Belgeyi sil</button></p>
    </div>
  );
}
