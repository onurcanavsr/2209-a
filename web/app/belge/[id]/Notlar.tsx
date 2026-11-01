"use client";
import { useEffect, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";

type Not = { id: string; content: string; created_at: string; updated_at: string };
const tarih = (s: string) => new Date(s).toLocaleString("tr-TR");
const duzenlendi = (n: Not) => Math.abs(new Date(n.updated_at).getTime() - new Date(n.created_at).getTime()) > 2000;

export default function Notlar({ docId }: { docId: string }) {
  const [notlar, setNotlar] = useState<Not[] | null>(null);
  const [yeni, setYeni] = useState("");
  const [duzenId, setDuzenId] = useState<string | null>(null);
  const [duzenMetin, setDuzenMetin] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/documents/${docId}/notes`);
        if (r.ok) setNotlar(await r.json());
        else setHata(await hataMesaji(r, "Notlar yüklenemedi."));
      } catch { setHata("Sunucuya ulaşılamadı."); }
    })();
  }, [docId]);

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    const metin = yeni.trim();
    if (!metin || calisiyor) return;
    setHata(""); setDurum(""); setCalisiyor(true);
    try {
      const r = await apiFetch(`/api/documents/${docId}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: metin }),
      });
      if (!r.ok) setHata(await hataMesaji(r, "Not kaydedilemedi."));
      else { const n: Not = await r.json(); setNotlar((l) => [n, ...(l ?? [])]); setYeni(""); setDurum("Not kaydedildi."); }
    } catch { setHata("Sunucuya ulaşılamadı."); }
    setCalisiyor(false);
  }

  async function kaydet(id: string) {
    const metin = duzenMetin.trim();
    if (!metin || calisiyor) return;
    setHata(""); setDurum(""); setCalisiyor(true);
    try {
      const r = await apiFetch(`/api/notes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: metin }),
      });
      if (!r.ok) setHata(await hataMesaji(r, "Not güncellenemedi."));
      else { const n: Not = await r.json(); setNotlar((l) => (l ?? []).map((x) => (x.id === id ? n : x))); setDuzenId(null); setDurum("Not güncellendi."); }
    } catch { setHata("Sunucuya ulaşılamadı."); }
    setCalisiyor(false);
  }

  async function sil(id: string) {
    if (!window.confirm("Bu not silinsin mi?")) return;
    setHata(""); setDurum("");
    try {
      const r = await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!r.ok) setHata(await hataMesaji(r, "Not silinemedi."));
      else { setNotlar((l) => (l ?? []).filter((x) => x.id !== id)); setDurum("Not silindi."); }
    } catch { setHata("Sunucuya ulaşılamadı."); }
  }

  return (
    <section aria-labelledby="notlar-baslik" className="panel">
      <h2 id="notlar-baslik" className="panel-h">Notlarım</h2>
      <p className="panel-alt">Bu belgeyle ilgili kendi notlarınızı yazın. Notlar yalnızca size görünür.</p>

      <form onSubmit={ekle} className="alt-kart">
        <label htmlFor="yeni-not">Yeni not</label>
        <textarea id="yeni-not" value={yeni} onChange={(e) => setYeni(e.target.value)} rows={4} maxLength={5000}
          placeholder="Örn. Sınavda mitokondrinin görevi sorulabilir." />
        <div className="row" style={{ marginTop: 12 }}>
          <button type="submit" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor || !yeni.trim()}>Notu kaydet</button>
        </div>
      </form>

      <div role="status" aria-live="polite">{durum && <p className="msg ok">{durum}</p>}</div>
      <div role="alert">{hata && <p className="msg err">{hata}</p>}</div>

      <h3 className="liste-baslik">Kayıtlı notlar{notlar ? ` (${notlar.length})` : ""}</h3>
      {notlar === null && !hata && <p>Yükleniyor…</p>}
      {notlar?.length === 0 && <p className="hint">Henüz not eklemediniz.</p>}
      <ul className="oge-liste">
        {notlar?.map((n) => (
          <li key={n.id} className="oge">
            {duzenId === n.id ? (
              <div>
                <label htmlFor={`not-${n.id}`}>Notu düzenle</label>
                <textarea id={`not-${n.id}`} value={duzenMetin} onChange={(e) => setDuzenMetin(e.target.value)} rows={4} maxLength={5000} />
                <div className="row" style={{ marginTop: 10 }}>
                  <button type="button" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor || !duzenMetin.trim()} onClick={() => kaydet(n.id)}>Kaydet</button>
                  <button type="button" className="btn sec" onClick={() => setDuzenId(null)}>Vazgeç</button>
                </div>
              </div>
            ) : (
              <>
                <p className="not-metin">{n.content}</p>
                <div className="oge-alt">
                  <span className="hint">{tarih(n.created_at)}{duzenlendi(n) ? " · düzenlendi" : ""}</span>
                  <span className="row">
                    <button type="button" className="btn sec" onClick={() => { setDuzenId(n.id); setDuzenMetin(n.content); setDurum(""); }}
                      aria-label={`Notu düzenle: ${n.content.slice(0, 40)}`}>Düzenle</button>
                    <button type="button" className="btn sec" onClick={() => sil(n.id)}
                      aria-label={`Notu sil: ${n.content.slice(0, 40)}`}>Sil</button>
                  </span>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
