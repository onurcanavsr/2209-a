"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, hataMesaji } from "@/lib/api";

export type YerImi = { id: string; label: string; word_index: number; snippet: string; created_at: string };

export default function YerImleri({ docId }: { docId: string }) {
  const [imler, setImler] = useState<YerImi[] | null>(null);
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/documents/${docId}/bookmarks`);
        if (r.ok) setImler(await r.json());
        else setHata(await hataMesaji(r, "Yer imleri yüklenemedi."));
      } catch { setHata("Sunucuya ulaşılamadı."); }
    })();
  }, [docId]);

  async function sil(im: YerImi) {
    if (!window.confirm(`“${im.label}” yer imi silinsin mi?`)) return;
    setHata(""); setDurum("");
    try {
      const r = await apiFetch(`/api/bookmarks/${im.id}`, { method: "DELETE" });
      if (!r.ok) setHata(await hataMesaji(r, "Yer imi silinemedi."));
      else { setImler((l) => (l ?? []).filter((x) => x.id !== im.id)); setDurum("Yer imi silindi."); }
    } catch { setHata("Sunucuya ulaşılamadı."); }
  }

  return (
    <section aria-labelledby="imler-baslik" className="panel">
      <h2 id="imler-baslik" className="panel-h">Yer İmleri</h2>
      <p className="panel-alt">
        Yer imlerini <Link href={`/belge/${docId}?b=metin`}>Çıkarılan Metin</Link> bölümünde bir kelimeyi seçerek ekleyebilirsiniz.
      </p>
      <div role="status" aria-live="polite">{durum && <p className="msg ok">{durum}</p>}</div>
      <div role="alert">{hata && <p className="msg err">{hata}</p>}</div>
      {imler === null && !hata && <p>Yükleniyor…</p>}
      {imler?.length === 0 && <p className="hint">Henüz yer imi eklemediniz.</p>}
      <ul className="oge-liste">
        {imler?.map((im) => (
          <li key={im.id} className="oge">
            <p className="oge-baslik">{im.label}</p>
            {im.snippet && <p className="hint">“{im.snippet}”</p>}
            <div className="oge-alt">
              <span className="hint">Kelime {im.word_index + 1}</span>
              <span className="row">
                <Link className="btn sec baglanti-btn" href={`/belge/${docId}?b=metin&k=${im.word_index}`}>
                  Metinde göster<span className="sr-only">: {im.label}</span>
                </Link>
                <button type="button" className="btn sec" onClick={() => sil(im)} aria-label={`Yer imini sil: ${im.label}`}>Sil</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
