"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

type Kart = { id: string; front: string; back: string; source: "manual" | "ai"; created_at: string };

function karistir(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Kartlar({ docId }: { docId: string }) {
  const t = useT();
  const [kartlar, setKartlar] = useState<Kart[] | null>(null);
  const [on, setOn] = useState("");
  const [arka, setArka] = useState("");
  const [adet, setAdet] = useState(8);
  const [uretiyor, setUretiyor] = useState(false);
  const [ekliyor, setEkliyor] = useState(false);
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");
  // Çalışma modu
  const [sira, setSira] = useState<number[]>([]);
  const [konum, setKonum] = useState(0);
  const [arkaGoster, setArkaGoster] = useState(false);
  const calismaBaslik = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/documents/${docId}/flashcards`);
        if (r.ok) setKartlar(await r.json());
        else setHata(await hataMesaji(r, t("Kartlar yüklenemedi.")));
      } catch { setHata(t("Sunucuya ulaşılamadı.")); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // Kart sayısı değişince çalışma sırası yenilenir (silinen kart sırada kalmaz)
  const sayi = kartlar?.length ?? 0;
  useEffect(() => {
    setSira(Array.from({ length: sayi }, (_, i) => i));
    setKonum((k) => Math.min(k, Math.max(0, sayi - 1)));
    setArkaGoster(false);
  }, [sayi]);

  const aktif = useMemo(() => (kartlar && sira.length ? kartlar[sira[Math.min(konum, sira.length - 1)]] ?? null : null), [kartlar, sira, konum]);

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    if (!on.trim() || !arka.trim() || ekliyor) return;
    setHata(""); setDurum(""); setEkliyor(true);
    try {
      const r = await apiFetch(`/api/documents/${docId}/flashcards`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ front: on.trim(), back: arka.trim() }),
      });
      if (!r.ok) setHata(await hataMesaji(r, t("Kart eklenemedi.")));
      else { const k: Kart = await r.json(); setKartlar((l) => [...(l ?? []), k]); setOn(""); setArka(""); setDurum(t("Kart eklendi.")); }
    } catch { setHata(t("Sunucuya ulaşılamadı.")); }
    setEkliyor(false);
  }

  async function uret() {
    if (uretiyor) return;
    setHata(""); setDurum(t("Kartlar hazırlanıyor, bu yarım dakika kadar sürebilir…")); setUretiyor(true);
    try {
      const r = await apiFetch(`/api/documents/${docId}/flashcards/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: adet }),
      });
      if (!r.ok) { setDurum(""); setHata(await hataMesaji(r, t("Kartlar hazırlanamadı."))); }
      else { const yeni: Kart[] = await r.json(); setKartlar((l) => [...(l ?? []), ...yeni]); setDurum(t("{n} kart eklendi.", { n: yeni.length })); }
    } catch { setDurum(""); setHata(t("Sunucuya ulaşılamadı.")); }
    setUretiyor(false);
  }

  async function sil(k: Kart) {
    if (!window.confirm(t("Bu kart silinsin mi?"))) return;
    setHata(""); setDurum("");
    try {
      const r = await apiFetch(`/api/flashcards/${k.id}`, { method: "DELETE" });
      if (!r.ok) setHata(await hataMesaji(r, t("Kart silinemedi.")));
      else { setKartlar((l) => (l ?? []).filter((x) => x.id !== k.id)); setDurum(t("Kart silindi.")); }
    } catch { setHata(t("Sunucuya ulaşılamadı.")); }
  }

  async function hepsiniSil() {
    if (!window.confirm(t("Bu belgedeki tüm kartlar silinsin mi? Bu işlem geri alınamaz."))) return;
    setHata(""); setDurum("");
    try {
      const r = await apiFetch(`/api/documents/${docId}/flashcards`, { method: "DELETE" });
      if (!r.ok) setHata(await hataMesaji(r, t("Kartlar silinemedi.")));
      else { setKartlar([]); setDurum(t("Tüm kartlar silindi.")); }
    } catch { setHata(t("Sunucuya ulaşılamadı.")); }
  }

  function git(fark: number) {
    if (!sira.length) return;
    setKonum((k) => (k + fark + sira.length) % sira.length);
    setArkaGoster(false);
  }

  function calismaTusu(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") { e.preventDefault(); git(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); git(-1); }
  }

  return (
    <section aria-labelledby="kartlar-baslik" className="panel">
      <h2 id="kartlar-baslik" className="panel-h">{t("Öğrenme Kartları")}</h2>
      <p className="panel-alt">{t("Kendi kartlarınızı ekleyin ya da belgeden otomatik kart oluşturun, sonra kartlarla çalışın.")}</p>

      <div role="status" aria-live="polite">{durum && <p className="msg ok">{durum}</p>}</div>
      <div role="alert">{hata && <p className="msg err">{hata}</p>}</div>

      <div className="alt-kart" aria-labelledby="calis-baslik" role="region">
        <h3 id="calis-baslik" ref={calismaBaslik} tabIndex={-1} className="liste-baslik" style={{ marginTop: 0 }}>{t("Kartlarla çalış")}</h3>
        {kartlar === null && !hata && <p>{t("Yükleniyor…")}</p>}
        {kartlar && !aktif && <p className="hint">{t("Çalışmak için önce kart ekleyin veya belgeden oluşturun.")}</p>}
        {aktif && (
          <div onKeyDown={calismaTusu}>
            <p className="hint" id="kart-konum">{t("Kart {i} / {n} · Gezinmek için sol/sağ ok tuşlarını kullanabilirsiniz.", { i: Math.min(konum, sira.length - 1) + 1, n: sira.length })}</p>
            <div className={"kart-yuz" + (arkaGoster ? " arka" : "")} aria-live="polite" aria-atomic="true" aria-describedby="kart-konum">
              <span className="kart-etiket">{arkaGoster ? t("Arka yüz (cevap)") : t("Ön yüz (soru)")}</span>
              <p>{arkaGoster ? aktif.back : aktif.front}</p>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn sec" onClick={() => git(-1)} disabled={sira.length < 2}>{t("Önceki")}</button>
              <button type="button" className="btn" style={{ width: "auto", margin: 0 }} onClick={() => setArkaGoster((g) => !g)}>
                {arkaGoster ? t("Ön yüzü göster") : t("Cevabı göster")}
              </button>
              <button type="button" className="btn sec" onClick={() => git(1)} disabled={sira.length < 2}>{t("Sonraki")}</button>
              <button type="button" className="btn sec" disabled={sira.length < 2}
                onClick={() => { setSira(karistir(sira.length)); setKonum(0); setArkaGoster(false); setDurum(t("Kartlar karıştırıldı.")); }}>{t("Karıştır")}</button>
            </div>
          </div>
        )}
      </div>

      <div className="iki-sutun">
        <form onSubmit={ekle} className="alt-kart" aria-labelledby="kart-ekle-baslik">
          <h3 id="kart-ekle-baslik" className="liste-baslik" style={{ marginTop: 0 }}>{t("Kart ekle")}</h3>
          <label htmlFor="kart-on">{t("Ön yüz (soru veya terim)")}</label>
          <input id="kart-on" type="text" value={on} onChange={(e) => setOn(e.target.value)} maxLength={500} />
          <label htmlFor="kart-arka">{t("Arka yüz (cevap)")}</label>
          <textarea id="kart-arka" value={arka} onChange={(e) => setArka(e.target.value)} rows={3} maxLength={1000} />
          <button type="submit" className="btn" style={{ width: "auto" }} disabled={ekliyor || !on.trim() || !arka.trim()}>{t("Kartı ekle")}</button>
        </form>

        <div className="alt-kart">
          <h3 className="liste-baslik" style={{ marginTop: 0 }}>{t("Belgeden oluştur")}</h3>
          <p className="hint" style={{ marginTop: 0 }}>{t("Kartlar yalnızca bu belgeye dayanır. Günlük bir üretim sınırı vardır.")}</p>
          <label htmlFor="kart-adet">{t("Kart sayısı")}</label>
          <select id="kart-adet" value={adet} onChange={(e) => setAdet(Number(e.target.value))} disabled={uretiyor}>
            {[5, 8, 12, 15].map((n) => <option key={n} value={n}>{t("{n} kart", { n })}</option>)}
          </select>
          <button type="button" className="btn" style={{ width: "auto" }} onClick={uret} disabled={uretiyor}>
            {uretiyor ? t("Hazırlanıyor…") : t("Belgeden kart oluştur")}
          </button>
        </div>
      </div>

      <h3 className="liste-baslik">{t("Tüm kartlar")}{kartlar ? ` (${kartlar.length})` : ""}</h3>
      {kartlar && kartlar.length > 0 && (
        <p><button type="button" className="btn sec" onClick={hepsiniSil}>{t("Tüm kartları sil")}</button></p>
      )}
      <ul className="oge-liste">
        {kartlar?.map((k) => (
          <li key={k.id} className="oge">
            <p className="oge-baslik">{k.front}</p>
            <p>{k.back}</p>
            <div className="oge-alt">
              <span className="hint">{k.source === "ai" ? t("Yapay zekâ ile oluşturuldu") : t("Elle eklendi")}</span>
              <button type="button" className="btn sec" onClick={() => sil(k)} aria-label={t("Kartı sil: {kart}", { kart: k.front.slice(0, 40) })}>{t("Sil")}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
