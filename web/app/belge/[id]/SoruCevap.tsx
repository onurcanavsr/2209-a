"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { Ozet } from "@/lib/markdown";

type Kaynak = { position: number; snippet: string };
type Kayit = { id?: string; question: string; answer: string; sources: Kaynak[] };

export default function SoruCevap({ docId }: { docId: string }) {
  const [gecmis, setGecmis] = useState<Kayit[]>([]);
  const [soru, setSoru] = useState("");
  const [bekleyenSoru, setBekleyenSoru] = useState("");
  const [akan, setAkan] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");
  const sonCevap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/documents/${docId}/qa`);
        if (r.ok) setGecmis(await r.json());
      } catch {}
    })();
  }, [docId]);

  async function sor(e: React.FormEvent) {
    e.preventDefault();
    const metin = soru.trim();
    if (metin.length < 3 || calisiyor) return;
    setHata(""); setAkan(""); setBekleyenSoru(metin); setCalisiyor(true);
    setDurum("Cevap hazırlanıyor…");
    let tam = "";
    let kaynaklar: Kaynak[] = [];
    let bitti = false;
    try {
      const r = await apiFetch(`/api/documents/${docId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: metin }),
      });
      if (!r.ok || !r.body) {
        setHata(await hataMesaji(r, "Cevap alınamadı.")); setDurum(""); setCalisiyor(false); setBekleyenSoru("");
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const bloklar = buf.split("\n\n");
        buf = bloklar.pop() ?? "";
        for (const b of bloklar) {
          if (!b.startsWith("data: ")) continue;
          const ev = JSON.parse(b.slice(6));
          if (ev.type === "delta") { tam += ev.text; setAkan(tam); }
          if (ev.type === "error") { setHata(ev.message); setDurum(""); }
          if (ev.type === "done") { bitti = true; kaynaklar = ev.sources ?? []; }
        }
      }
      if (bitti && tam.trim()) {
        setGecmis((g) => [...g, { question: metin, answer: tam.trim(), sources: kaynaklar }]);
        setSoru(""); setAkan("");
        setDurum("Cevap hazır.");
        setTimeout(() => sonCevap.current?.focus(), 50);
      } else if (!bitti && !tam) {
        setHata((h) => h || "Cevap alınamadı. Lütfen tekrar deneyin.");
      }
    } catch {
      setHata("Sunucuya ulaşılamadı. Lütfen tekrar deneyin."); setDurum("");
    }
    setBekleyenSoru(""); setCalisiyor(false);
  }

  async function temizle() {
    if (!window.confirm("Bu belgedeki soru-cevap geçmişi silinsin mi?")) return;
    const r = await apiFetch(`/api/documents/${docId}/qa`, { method: "DELETE" });
    if (r.ok) { setGecmis([]); setDurum("Geçmiş silindi."); }
    else setHata(await hataMesaji(r, "Geçmiş silinemedi."));
  }

  return (
    <section aria-labelledby="qa-baslik" className="card" style={{ margin: "20px 0" }}>
      <h2 id="qa-baslik" style={{ marginTop: 0 }}>Belgeye soru sor</h2>
      <form onSubmit={sor}>
        <label htmlFor="qa-soru" style={{ marginTop: 0 }}>Sorunuz</label>
        <input id="qa-soru" type="text" value={soru} maxLength={500} disabled={calisiyor}
          onChange={(e) => setSoru(e.target.value)} aria-describedby="qa-ipucu"
          placeholder="Örn. Mitokondrinin görevi nedir?" />
        <p id="qa-ipucu" className="hint">Cevaplar yalnızca bu belgeye dayanır; belgede yoksa bunu söyler.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="submit" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor || soru.trim().length < 3}>
            {calisiyor ? "Cevaplanıyor…" : "Sor"}
          </button>
          {gecmis.length > 0 && !calisiyor && (
            <button type="button" className="btn sec" onClick={temizle}>Geçmişi temizle</button>
          )}
        </div>
      </form>

      <div role="status" aria-live="polite">{durum && <p className="hint">{durum}</p>}</div>
      <div role="alert" aria-live="assertive">{hata && <p className="msg err">{hata}</p>}</div>

      {calisiyor && (
        <div className="qa-item" aria-busy="true">
          <h3 style={{ fontSize: "1rem", margin: "0 0 6px" }}>Soru: {bekleyenSoru}</h3>
          <div className="ozet"><Ozet text={akan || "…"} /></div>
        </div>
      )}

      {[...gecmis].reverse().map((k, i) => (
        <article key={k.id ?? `${gecmis.length - i}`} className="qa-item"
          ref={i === 0 ? sonCevap : undefined} tabIndex={i === 0 ? -1 : undefined}
          aria-label={`Soru: ${k.question}`}>
          <h3 style={{ fontSize: "1rem", margin: "0 0 6px" }}>Soru: {k.question}</h3>
          <div className="ozet"><Ozet text={k.answer} /></div>
          {k.sources?.length > 0 && (
            <details>
              <summary>Dayanılan bölümler ({k.sources.length})</summary>
              <ul>
                {k.sources.map((s) => <li key={s.position}><strong>Bölüm {s.position}:</strong> {s.snippet}</li>)}
              </ul>
            </details>
          )}
        </article>
      ))}
      <p className="hint">Cevaplar yapay zekâ tarafından üretilir ve hata içerebilir; önemli konularda belge metnini kontrol edin.</p>
    </section>
  );
}
