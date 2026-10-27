"use client";
import { useEffect, useId, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { hizala, kelimeBul, oranHesapla, takipHazirla, type Takip } from "@/lib/takip";
import { useMikrofonAcilinca, useSesKomutlari } from "@/lib/ses/useSesKomutlari";

type Props = {
  docId: string;
  source: "summary" | "text";
  level?: string;
  etiket: string;       // örn. "Özeti dinle"
  dosyaAdi: string;     // indirilen MP3'ün adı
  indirilebilir?: boolean;
  gorunen?: string[];             // ekranda gösterilen metnin kelimeleri (okunan kelime bunlarla eşleştirilir)
  onAktif?: (i: number) => void;  // okunan kelimenin ekrandaki sırası; vurgu bitince -1
};
const HIZLAR = [0.75, 1, 1.25, 1.5, 1.75, 2];
// Sayfada iki oynatıcı olabilir (özet, metin): sesli komut en son kullanılana gider
let sonAktifOynatici: string | null = null;

// Bölüm bölüm (cümle gruplarıyla) çalar: ilk bölüm hazır olur olmaz başlar, sıradaki önceden hazırlanır.
export default function Oynatici({ docId, source, level, etiket, dosyaAdi, indirilebilir = true, gorunen, onAktif }: Props) {
  const [voices, setVoices] = useState<Record<string, string>>({});
  const [voice, setVoice] = useState("");
  const [rate, setRate] = useState(1);
  const [total, setTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [sure, setSure] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [goster, setGoster] = useState(true);                // kelime vurgusu açık mı

  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<number, Promise<string>>());
  const idxRef = useRef(0);
  const totalRef = useRef(0);
  const voiceRef = useRef("");
  const rateRef = useRef(1);
  const hasSrc = useRef(false);
  const alive = useRef(true);
  const takipRef = useRef<Takip | null>(null);
  const aktifRef = useRef(-1);
  const tokenRef = useRef(0);   // hızlı bölüm değişiminde eski yanıtlar yenisini ezmesin
  const gosterRef = useRef(true);
  const onAktifRef = useRef<Props["onAktif"]>(undefined);
  const gorunenRef = useRef<string[] | null>(null);
  const konusulanRef = useRef<{ seg: string[]; starts: number[] } | null>(null);  // seslendirilen bölüm metinleri
  const eslesmeRef = useRef<Int32Array | null>(null);                              // seslendirilen kelime → ekran kelimesi
  const konusulanSoz = useRef<Promise<void> | null>(null);
  gosterRef.current = goster;
  onAktifRef.current = onAktif;
  const benId = useId();

  const qs = () => {
    const p = new URLSearchParams({ source });
    if (level) p.set("level", level);
    if (voiceRef.current) p.set("voice", voiceRef.current);
    return p.toString();
  };

  function temizle() {
    urls.current.forEach((p) => p.then((u) => URL.revokeObjectURL(u)).catch(() => {}));
    urls.current.clear();
  }

  // Seslendirilen metin (tüm bölümler) bir kez alınır. Başarısız olursa yalnızca vurgu çalışmaz, ses etkilenmez.
  function konusulanYukle(): Promise<void> {
    if (!konusulanSoz.current) {
      konusulanSoz.current = (async () => {
        try {
          const r = await apiFetch(`/api/documents/${docId}/audio/text?${qs()}`);
          if (!r.ok) { konusulanSoz.current = null; return; }
          const j: { segments: string[] } = await r.json();
          const starts: number[] = [];
          let acc = 0;
          for (const s of j.segments) { starts.push(acc); acc += s.split(/\s+/).filter(Boolean).length; }
          konusulanRef.current = { seg: j.segments, starts };
          eslemeHazirla();
        } catch { konusulanSoz.current = null; }
      })();
    }
    return konusulanSoz.current;
  }

  // Seslendirilen kelimeleri ekrandaki kelimelerle eşleştirir (metinler biçim olarak birebir aynı değildir).
  function eslemeHazirla() {
    const k = konusulanRef.current, g = gorunenRef.current;
    eslesmeRef.current = k && g ? hizala(k.seg.flatMap((s) => s.split(/\s+/).filter(Boolean)), g) : null;
  }

  function yeniTakip(t: Takip | null) {
    takipRef.current = t;
  }

  function vurguTemizle() {
    aktifRef.current = -1;
    onAktifRef.current?.(-1);
  }

  function guncelle() {
    const a = audio.current, t = takipRef.current, k = konusulanRef.current, m = eslesmeRef.current;
    if (!gosterRef.current || !a || !t || !k || !m || !isFinite(a.duration) || a.duration <= 0) return;
    const yerel = kelimeBul(t, oranHesapla(a.currentTime, a.duration));
    const d = m[k.starts[idxRef.current] + yerel] ?? -1;
    if (d >= 0 && d !== aktifRef.current) { aktifRef.current = d; onAktifRef.current?.(d); }
  }

  function fetchSeg(n: number): Promise<string> {
    const mevcut = urls.current.get(n);
    if (mevcut) return mevcut;
    const p = (async () => {
      const r = await apiFetch(`/api/documents/${docId}/audio/segment/${n}?${qs()}`);
      if (!r.ok) throw new Error(await hataMesaji(r, "Ses hazırlanamadı."));
      return URL.createObjectURL(await r.blob());
    })();
    urls.current.set(n, p);
    p.catch(() => urls.current.delete(n));
    return p;
  }

  async function manifestYukle() {
    const r = await apiFetch(`/api/documents/${docId}/audio/manifest?${qs()}`);
    if (!r.ok) throw new Error(await hataMesaji(r, "Ses bilgisi alınamadı."));
    const m = await r.json();
    totalRef.current = m.segments;
    setTotal(m.segments);
    setSure(m.est_seconds);
    setVoices(m.voices);
    if (!voiceRef.current) { voiceRef.current = m.voice; setVoice(m.voice); }
  }

  function getAudio() {
    if (!audio.current) {
      const a = new Audio();
      a.preservesPitch = true;
      a.onseeked = guncelle;                                  // duraklatılmışken ilerletince de vurgu güncellensin
      a.onended = () => {
        const n = idxRef.current + 1;
        if (n < totalRef.current) startAt(n);
        else { setPlaying(false); setStatus("Okuma tamamlandı."); idxRef.current = 0; setIdx(0); hasSrc.current = false; setStarted(false); yeniTakip(null); vurguTemizle(); }
      };
      audio.current = a;
    }
    return audio.current;
  }

  async function startAt(n: number) {
    setError(""); setBusy(true);
    const my = ++tokenRef.current;
    idxRef.current = n; setIdx(n);
    try {
      const [src] = await Promise.all([fetchSeg(n), gorunenRef.current ? konusulanYukle() : Promise.resolve()]);
      if (!alive.current || my !== tokenRef.current) return;
      const metin = konusulanRef.current?.seg[n];
      yeniTakip(metin ? takipHazirla(metin) : null);        // ses ve metin birlikte hazır olunca değişir
      const a = getAudio();
      a.src = src;
      a.playbackRate = rateRef.current;
      await a.play();
      hasSrc.current = true; setStarted(true); setPlaying(true);
      if (n + 1 < totalRef.current) fetchSeg(n + 1).catch(() => {});   // sıradaki bölümü önceden hazırla
      urls.current.forEach((p, k) => {                                   // bellek: eski bölümleri serbest bırak
        if (k < n - 2) { p.then((u) => URL.revokeObjectURL(u)).catch(() => {}); urls.current.delete(k); }
      });
    } catch (e) {
      setPlaying(false);
      const err = e as Error;
      setError(err.name === "NotAllowedError" ? "Tarayıcı oynatmayı engelledi. Düğmeye tekrar basın." : err.message || "Ses oynatılamadı.");
    } finally {
      if (alive.current && my === tokenRef.current) setBusy(false);
    }
  }

  async function toggle() {
    sonAktifOynatici = benId;
    const a = getAudio();
    if (playing) { a.pause(); setPlaying(false); setStatus("Duraklatıldı."); return; }
    setError("");
    try {
      if (totalRef.current === 0) await manifestYukle();
    } catch (e) { setError((e as Error).message); return; }
    if (hasSrc.current && a.paused && !a.ended) {
      try { await a.play(); setPlaying(true); setStatus("Okunuyor."); } catch { setError("Oynatılamadı."); }
      return;
    }
    setStatus("Okuma başlıyor.");
    await startAt(idxRef.current);
  }

  function atla(sn: number) {
    const a = getAudio();
    if (!hasSrc.current) return;
    const t = a.currentTime + sn;
    if (t < 0) { if (idxRef.current > 0) startAt(idxRef.current - 1); else a.currentTime = 0; }
    else if (isFinite(a.duration) && t >= a.duration) { const n = idxRef.current + 1; if (n < totalRef.current) startAt(n); }
    else { a.currentTime = t; guncelle(); }
  }

  function bolum(d: number) {
    const n = idxRef.current + d;
    if (n >= 0 && n < totalRef.current) { setStatus(`Bölüm ${n + 1}.`); startAt(n); }
  }

  function vurguDegistir() {
    const yeni = !goster;
    gosterRef.current = yeni; setGoster(yeni);
    try { localStorage.setItem("takip-vurgu", yeni ? "1" : "0"); } catch {}
    if (yeni) guncelle(); else vurguTemizle();
  }

  function hizDegistir(v: number) {
    rateRef.current = v; setRate(v);
    if (audio.current) audio.current.playbackRate = v;
  }

  function sesDegistir(v: string) {
    audio.current?.pause();
    tokenRef.current++;   // bekleyen eski istek yeni sesi ezmesin
    setPlaying(false); hasSrc.current = false; setStarted(false);
    temizle();
    voiceRef.current = v; setVoice(v);
    idxRef.current = 0; setIdx(0); yeniTakip(null); vurguTemizle();
    setStatus("Ses değişti. Dinlemek için düğmeye basın.");
    manifestYukle().catch(() => {});
  }

  async function indir() {
    setBusy(true); setError(""); setStatus("MP3 hazırlanıyor, bu bir süre alabilir…");
    try {
      const r = await apiFetch(`/api/documents/${docId}/audio/download?${qs()}`);
      if (!r.ok) throw new Error(await hataMesaji(r, "MP3 hazırlanamadı."));
      const u = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = u; a.download = dosyaAdi;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 10000);
      setStatus("MP3 indirildi.");
    } catch (e) {
      setStatus(""); setError((e as Error).message);
    }
    if (alive.current) setBusy(false);
  }

  useEffect(() => {
    alive.current = true;
    manifestYukle().catch(() => {});
    return () => {
      alive.current = false;
      audio.current?.pause();
      temizle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { if (localStorage.getItem("takip-vurgu") === "0") setGoster(false); } catch {}
  }, []);

  // Çalarken her karede konuma bakar; yalnızca kelime değişince yeniden çizer
  useEffect(() => {
    if (!playing || !goster) return;
    let raf = 0;
    const tick = () => { guncelle(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, goster]);

  // Ekrandaki metin değişirse (ör. özet yeniden üretildi) eşleştirme yeniden yapılır
  useEffect(() => {
    gorunenRef.current = gorunen ?? null;
    eslemeHazirla();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gorunen]);

  // ---- Sesli komutlar ----
  useEffect(() => () => { if (sonAktifOynatici === benId) sonAktifOynatici = null; }, [benId]);
  const benimMi = () => sonAktifOynatici === null || sonAktifOynatici === benId;
  useMikrofonAcilinca(() => {          // mikrofon açılırken kendi sesimizi duymayalım
    if (playing) { audio.current?.pause(); setPlaying(false); }
  });
  useSesKomutlari({
    "oku.baslat": () => {
      if (!benimMi()) return false;
      if (!playing && !busy) void toggle();
      return true;
    },
    "oku.durdur": () => {
      if (!playing) return false;      // başka oynatıcı çalıyor olabilir: sıradakine bırak
      void toggle();
      return true;
    },
    "oku.ileri": () => { if (!started || !benimMi()) return false; atla(10); return true; },
    "oku.geri": () => { if (!started || !benimMi()) return false; atla(-10); return true; },
    "oku.sonraki": () => { if (!started || !benimMi() || idx + 1 >= total) return false; bolum(1); return true; },
    "oku.onceki": () => { if (!started || !benimMi() || idx === 0) return false; bolum(-1); return true; },
    "oku.hizli": () => {
      const i = HIZLAR.indexOf(rate);
      if (i < 0 || i >= HIZLAR.length - 1 || !benimMi()) return false;
      hizDegistir(HIZLAR[i + 1]); setStatus(`Hız ${HIZLAR[i + 1]} kat.`); return true;
    },
    "oku.yavas": () => {
      const i = HIZLAR.indexOf(rate);
      if (i <= 0 || !benimMi()) return false;
      hizDegistir(HIZLAR[i - 1]); setStatus(`Hız ${HIZLAR[i - 1]} kat.`); return true;
    },
  }, source === "summary" ? 2 : 1);

  const dk = Math.max(1, Math.round(sure / 60));
  return (
    <div role="group" aria-label={etiket} className="player">
      <div className="row">
        <button type="button" className="btn pbtn" onClick={toggle} disabled={busy && !playing}>
          {playing ? "⏸ Duraklat" : busy ? "Hazırlanıyor…" : `▶ ${etiket}`}
        </button>
        <button type="button" className="btn sec" onClick={() => atla(-10)} disabled={!started} aria-label="10 saniye geri">⏪ 10 sn</button>
        <button type="button" className="btn sec" onClick={() => atla(10)} disabled={!started} aria-label="10 saniye ileri">10 sn ⏩</button>
        <button type="button" className="btn sec" onClick={() => bolum(-1)} disabled={!started || idx === 0} aria-label="Önceki bölüm">⏮</button>
        <button type="button" className="btn sec" onClick={() => bolum(1)} disabled={!started || idx + 1 >= total} aria-label="Sonraki bölüm">⏭</button>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label htmlFor={`hiz-${source}`} style={{ margin: 0, fontWeight: 400 }}>Hız</label>
        <select id={`hiz-${source}`} value={rate} onChange={(e) => hizDegistir(Number(e.target.value))}>
          {HIZLAR.map((h) => <option key={h} value={h}>{h}x</option>)}
        </select>
        {Object.keys(voices).length > 0 && (
          <>
            <label htmlFor={`ses-${source}`} style={{ margin: 0, fontWeight: 400 }}>Ses</label>
            <select id={`ses-${source}`} value={voice} onChange={(e) => sesDegistir(e.target.value)} disabled={busy}>
              {Object.entries(voices).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </>
        )}
        {gorunen && gorunen.length > 0 && (
          <button type="button" className="btn sec" aria-pressed={goster} onClick={vurguDegistir}>
            Kelime vurgusu
          </button>
        )}
        {indirilebilir && (
          <button type="button" className="btn sec" onClick={indir} disabled={busy}>MP3 indir</button>
        )}
      </div>
      {total > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="pbar" role="progressbar" aria-label="Okuma ilerlemesi" aria-valuemin={1} aria-valuemax={total}
               aria-valuenow={Math.min(idx + 1, total)} aria-valuetext={`Bölüm ${Math.min(idx + 1, total)} / ${total}`}>
            <i style={{ width: `${((Math.min(idx + 1, total)) / total) * 100}%` }} />
          </div>
          <span className="hint">Bölüm {Math.min(idx + 1, total)} / {total} · yaklaşık {dk} dk</span>
        </div>
      )}
      {/* Vurgu ekrandaki metnin üzerinde yapılır (canlı bölge DEĞİLDİR; ekran okuyucu sesi/metni kendi kullanır) */}
      {started && goster && gorunen && gorunen.length > 0 && (
        <p className="hint">Okunan kelime metin üzerinde vurgulanır. Vurgu ses süresine göre hesaplanır, bu yüzden bazen birkaç kelime sapabilir.</p>
      )}
      {/* Canlı bölge yalnızca önemli anları (başla/duraklat/bitti/hata) duyurur; her bölümü değil */}
      <div role="status" aria-live="polite">{status && <p className="hint">{status}</p>}</div>
      <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
    </div>
  );
}
