"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { Ozet } from "@/lib/markdown";
import { ozetAgaci, ozetKelimeleri } from "@/lib/ozetAgaci";
import { vurguIsaretle } from "@/lib/vurgu";
import Oynatici from "./Oynatici";

type Seviye = "short" | "medium" | "detailed";
const SEVIYELER: { id: Seviye; ad: string; ipucu: string }[] = [
  { id: "short", ad: "Kısa", ipucu: "3-5 madde" },
  { id: "medium", ad: "Orta", ipucu: "~1 sayfa" },
  { id: "detailed", ad: "Ayrıntılı", ipucu: "bölüm bölüm" },
];

export default function Ozetleme({ docId, baslik: belgeAdi }: { docId: string; baslik: string }) {
  const [seviye, setSeviye] = useState<Seviye>("medium");
  const [kayitli, setKayitli] = useState<Partial<Record<Seviye, string>>>({});
  const [akan, setAkan] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");
  const baslik = useRef<HTMLHeadingElement>(null);
  const ozetKap = useRef<HTMLDivElement>(null);
  const onceki = useRef(-1);
  // Sesli okumada okunan kelime, ekrandaki özetin kendi üzerinde işaretlenir (ayrı bir kutu yok)
  const kayitliMetin = kayitli[seviye] ?? "";
  const gorunen = useMemo(() => ozetKelimeleri(ozetAgaci(kayitliMetin)), [kayitliMetin]);
  const isaretle = useCallback((i: number) => {
    vurguIsaretle(ozetKap.current, onceki.current, i);
    onceki.current = i;
  }, []);
  useEffect(() => { onceki.current = -1; }, [kayitliMetin, calisiyor]);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/documents/${docId}/summaries`);
        if (!r.ok) return;
        const list: { level: Seviye; content: string }[] = await r.json();
        setKayitli(Object.fromEntries(list.map((s) => [s.level, s.content])));
      } catch {}
    })();
  }, [docId]);

  const metin = calisiyor ? akan : (akan || kayitli[seviye] || "");
  const gosterilen = calisiyor ? akan : (kayitli[seviye] ?? "");

  async function olustur(yeniden: boolean) {
    setHata(""); setAkan(""); setCalisiyor(true);
    setDurum("Özet hazırlanıyor…");
    let tam = "";
    try {
      const r = await apiFetch(`/api/documents/${docId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: seviye, regenerate: yeniden }),
      });
      if (!r.ok || !r.body) { setHata(await hataMesaji(r, "Özet hazırlanamadı.")); setDurum(""); setCalisiyor(false); return; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let bitti = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const bloklar = buf.split("\n\n");
        buf = bloklar.pop() ?? "";
        for (const b of bloklar) {
          if (!b.startsWith("data: ")) continue;
          const ev = JSON.parse(b.slice(6));
          if (ev.type === "start" && ev.cached) setDurum("Daha önce hazırlanmış özet gösteriliyor.");
          if (ev.type === "delta") { tam += ev.text; setAkan(tam); }
          if (ev.type === "error") { setHata(ev.message); setDurum(""); }
          if (ev.type === "done") bitti = true;
        }
      }
      if (bitti && tam) {
        setKayitli((k) => ({ ...k, [seviye]: tam }));
        setAkan("");
        setDurum("Özet hazır.");
        setTimeout(() => baslik.current?.focus(), 50);
      } else if (!bitti && !tam) {
        setHata((h) => h || "Özet alınamadı. Lütfen tekrar deneyin.");
      }
    } catch {
      setHata("Sunucuya ulaşılamadı. Lütfen tekrar deneyin.");
      setDurum("");
    }
    setCalisiyor(false);
  }

  const varMi = Boolean(kayitli[seviye]);
  return (
    <section aria-labelledby="ozet-baslik" className="card" style={{ margin: "20px 0" }}>
      <h2 id="ozet-baslik" ref={baslik} tabIndex={-1} style={{ marginTop: 0 }}>Özet</h2>

      <div role="group" aria-label="Özet seviyesi" className="seg">
        {SEVIYELER.map((s) => (
          <button key={s.id} type="button" aria-pressed={seviye === s.id} disabled={calisiyor}
            onClick={() => { setSeviye(s.id); setAkan(""); setHata(""); setDurum(""); }}>
            {s.ad} <span className="hint" style={{ margin: 0 }}>({s.ipucu})</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        {!varMi && (
          <button type="button" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor} onClick={() => olustur(false)}>
            {calisiyor ? "Hazırlanıyor…" : "Özetle"}
          </button>
        )}
        {varMi && (
          <button type="button" className="btn sec" disabled={calisiyor} onClick={() => olustur(true)}>
            {calisiyor ? "Hazırlanıyor…" : "Yeniden oluştur"}
          </button>
        )}
      </div>

      {/* Her kelimeyi okutmamak için canlı bölge yalnızca durum mesajını duyurur */}
      <div role="status" aria-live="polite">{durum && <p className="hint">{durum}</p>}</div>
      <div role="alert" aria-live="assertive">{hata && <p className="msg err">{hata}</p>}</div>

      {(gosterilen || metin) && (
        <div className="ozet" ref={ozetKap} aria-busy={calisiyor} aria-label={`${SEVIYELER.find((s) => s.id === seviye)?.ad} özet`} role="region">
          <Ozet text={calisiyor ? akan : (kayitli[seviye] ?? akan)} kelimeler={!calisiyor && Boolean(kayitliMetin)} />
        </div>
      )}
      {!calisiyor && kayitli[seviye] && (
        <Oynatici key={`ozet-${seviye}-${kayitliMetin.length}`} docId={docId} source="summary" level={seviye} etiket="Özeti dinle"
          gorunen={gorunen} onAktif={isaretle}
          dosyaAdi={`${belgeAdi.replace(/\.[^.]+$/, "")} - özet.mp3`} />
      )}
      <p className="hint">Özet yapay zekâ tarafından üretilir ve hata içerebilir; önemli konularda asıl metni kontrol edin.</p>
    </section>
  );
}
