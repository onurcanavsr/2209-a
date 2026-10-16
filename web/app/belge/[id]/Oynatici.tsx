"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";

type Props = {
  docId: string;
  source: "summary" | "text";
  level?: string;
  etiket: string;       // örn. "Özeti dinle"
  dosyaAdi: string;     // indirilen MP3'ün adı
  indirilebilir?: boolean;
};
const HIZLAR = [0.75, 1, 1.25, 1.5, 1.75, 2];

// Bölüm bölüm (cümle gruplarıyla) çalar: ilk bölüm hazır olur olmaz başlar, sıradaki önceden hazırlanır.
export default function Oynatici({ docId, source, level, etiket, dosyaAdi, indirilebilir = true }: Props) {
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

  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<number, Promise<string>>());
  const idxRef = useRef(0);
  const totalRef = useRef(0);
  const voiceRef = useRef("");
  const rateRef = useRef(1);
  const hasSrc = useRef(false);
  const alive = useRef(true);

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
      a.onended = () => {
        const n = idxRef.current + 1;
        if (n < totalRef.current) startAt(n);
        else { setPlaying(false); setStatus("Okuma tamamlandı."); idxRef.current = 0; setIdx(0); hasSrc.current = false; setStarted(false); }
      };
      audio.current = a;
    }
    return audio.current;
  }

  async function startAt(n: number) {
    setError(""); setBusy(true);
    idxRef.current = n; setIdx(n);
    try {
      const src = await fetchSeg(n);
      if (!alive.current) return;
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
      if (alive.current) setBusy(false);
    }
  }

  async function toggle() {
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
    else a.currentTime = t;
  }

  function bolum(d: number) {
    const n = idxRef.current + d;
    if (n >= 0 && n < totalRef.current) { setStatus(`Bölüm ${n + 1}.`); startAt(n); }
  }

  function hizDegistir(v: number) {
    rateRef.current = v; setRate(v);
    if (audio.current) audio.current.playbackRate = v;
  }

  function sesDegistir(v: string) {
    audio.current?.pause();
    setPlaying(false); hasSrc.current = false; setStarted(false);
    temizle();
    voiceRef.current = v; setVoice(v);
    idxRef.current = 0; setIdx(0);
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
      {/* Canlı bölge yalnızca önemli anları (başla/duraklat/bitti/hata) duyurur; her bölümü değil */}
      <div role="status" aria-live="polite">{status && <p className="hint">{status}</p>}</div>
      <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
    </div>
  );
}
