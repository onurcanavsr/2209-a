"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, hataMesaji, DURUM, type Belge } from "@/lib/api";
import { belgeAra, belgeFiil, baslikOku } from "@/lib/ses/belgeAra";
import { kindAd } from "@/lib/belgeTuru";
import { dikteIste, onayIste, sesDuyur } from "@/lib/ses/kayit";
import { useSesIpuclari, useSesKomutlari, useSesMetin } from "@/lib/ses/useSesKomutlari";

const MAX_MB = 10;
const UZANTILAR = ["pdf", "docx", "pptx"];

export default function Calisma() {
  const router = useRouter();
  const [docs, setDocs] = useState<Belge[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const prev = useRef<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const [yt, setYt] = useState("");
  const [ytBusy, setYtBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/documents");
      if (!r.ok) throw new Error();
      const list: Belge[] = await r.json();
      for (const d of list) {  // işlem bitince ekran okuyucuya duyur
        const before = prev.current[d.id];
        if (before === "processing" && d.status === "ready") setStatus(`“${d.title}” hazır.`);
        if (before === "processing" && d.status === "failed") setStatus(`“${d.title}” işlenemedi.`);
        prev.current[d.id] = d.status;
      }
      setDocs(list);
    } catch {
      setError("Belgeler yüklenemedi. Lütfen sayfayı yenileyin.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!docs?.some((d) => d.status === "processing")) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [docs, load]);

  async function gonder(file: File) {
    setError(""); setStatus("");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!UZANTILAR.includes(ext)) return setError("Desteklenen türler: PDF, Word (.docx) ve PowerPoint (.pptx).");
    if (file.size === 0) return setError("Dosya boş.");
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Dosya en fazla ${MAX_MB} MB olabilir.`);
    setBusy(true);
    setStatus(`“${file.name}” yükleniyor…`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch("/api/documents", { method: "POST", body: fd });
      if (!r.ok) { setStatus(""); setError(await hataMesaji(r, "Yükleme başarısız oldu.")); }
      else {
        const j = await r.json();
        setStatus(j.cached ? "Bu dosya daha önce yüklenmişti, hazır belge kullanıldı." : `“${file.name}” yüklendi, işleniyor…`);
        await load();
      }
    } catch {
      setStatus(""); setError("Sunucuya ulaşılamadı. Lütfen tekrar deneyin.");
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function youtubeEkle(e: React.FormEvent) {
    e.preventDefault();
    const url = yt.trim();
    if (!url || ytBusy) return;
    setError(""); setStatus("YouTube bağlantısı alınıyor…"); setYtBusy(true);
    try {
      const r = await apiFetch("/api/documents/youtube", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      if (!r.ok) { setStatus(""); setError(await hataMesaji(r, "Video eklenemedi.")); }
      else {
        const j = await r.json();
        setStatus(j.cached ? "Bu video daha önce eklenmişti, hazır belge kullanıldı." : "Video eklendi, transkript alınıyor…");
        setYt("");
        await load();
      }
    } catch {
      setStatus(""); setError("Sunucuya ulaşılamadı. Lütfen tekrar deneyin.");
    }
    setYtBusy(false);
  }

  async function sil(d: Belge, onayli = false) {
    if (!onayli && !window.confirm(`“${d.title}” silinsin mi? Bu işlem geri alınamaz.`)) return;
    const r = await apiFetch(`/api/documents/${d.id}`, { method: "DELETE" });
    if (r.ok) { setStatus(`“${d.title}” silindi.`); delete prev.current[d.id]; await load(); }
    else setError(await hataMesaji(r, "Belge silinemedi."));
  }

  // ---- Sesli komutlar ----
  function belgeAc(d: Belge) {
    sesDuyur(`“${baslikOku(d.title)}” açılıyor.`);
    router.push(`/belge/${d.id}`);
  }
  function belgeSilSesli(d: Belge) {
    onayIste(`“${baslikOku(d.title)}” silinsin mi? Evet ya da hayır deyin.`, () => sil(d, true));
  }

  useSesIpuclari(() => (docs ?? []).slice(0, 15).map((d) => baslikOku(d.title)));   // dosya adlarını tanıyıcıya ipucu ver
  useSesKomutlari({
    "belge.listele": () => {
      if (docs === null) sesDuyur("Belgeler yükleniyor, birazdan tekrar deneyin.");
      else if (docs.length === 0) sesDuyur("Henüz belge yüklemediniz.");
      else {
        const ilk = docs.slice(0, 10).map((d, i) => `${i + 1}. ${baslikOku(d.title)}, ${DURUM[d.status]}`).join(". ");
        sesDuyur(`${docs.length} belgeniz var. ${ilk}.${docs.length > 10 ? ` Ve ${docs.length - 10} belge daha.` : ""} Açmak için adını ya da sırasını söyleyin.`);
      }
    },
    "belge.yukle": () => {
      if (busy) return false;
      input.current?.focus();
      sesDuyur("Dosya seçme düğmesine odaklandım. Dosya penceresini açmak için Boşluk ya da Enter tuşuna basın.");
    },
  });
  useSesMetin((metin) => {
    if (!docs || docs.length === 0) return false;
    const s = belgeAra(metin, docs);
    if (s.durum === "yok") return false;
    const eylem = belgeFiil(metin) === "sil" ? belgeSilSesli : belgeAc;
    if (s.durum === "ok") { eylem(s.belge); return true; }
    // benzer adlı birden çok belge: tahmin yürütme, sor
    dikteIste({
      istem: `Birden çok belge eşleşti: ${s.adaylar.map((b) => baslikOku(b.title)).join(", ")}. Hangisi?`,
      uygula: (m) => {
        const r = belgeAra(m, s.adaylar);
        if (r.durum === "ok") eylem(r.belge);
        else sesDuyur("Hangi belge olduğu anlaşılamadı, işlem yapılmadı.");
      },
    });
    return true;
  });

  return (
    <div>
      <h1>Çalışma Alanı</h1>
      <p className="sub">PDF, Word veya PowerPoint belgenizi yükleyin ya da bir YouTube bağlantısı ekleyin; metni çıkaralım.</p>

      <section className="card" aria-labelledby="yukle-baslik">
        <h2 id="yukle-baslik" style={{ marginTop: 0 }}>Belge yükle</h2>
        <div className={"drop" + (drag ? " drag" : "")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) gonder(f); }}>
          <p style={{ margin: "0 0 12px" }}>Dosyayı buraya sürükleyin veya seçin (en fazla {MAX_MB} MB)</p>
          <label htmlFor="dosya" className="btn" style={{ display: "inline-block", width: "auto", margin: 0, cursor: "pointer" }}>
            {busy ? "Yükleniyor…" : "Dosya seç"}
          </label>
          <input id="dosya" ref={input} type="file" accept=".pdf,.docx,.pptx" className="sr-file" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) gonder(f); }} />
          <p className="hint">Taranmış PDF&apos;ler OCR ile okunur ve hata içerebilir.</p>
        </div>
        <form onSubmit={youtubeEkle} aria-labelledby="yt-baslik" style={{ marginTop: 20 }}>
          <h3 id="yt-baslik" style={{ margin: "0 0 8px" }}>YouTube videosu ekle</h3>
          <label htmlFor="yt-url">YouTube bağlantısı</label>
          <div className="row">
            <input id="yt-url" type="text" inputMode="url" autoComplete="off" placeholder="https://www.youtube.com/watch?v=…"
              value={yt} onChange={(e) => setYt(e.target.value)} disabled={ytBusy} style={{ flex: "1 1 18rem" }} />
            <button type="submit" className="btn" style={{ width: "auto", margin: 0 }} disabled={ytBusy || !yt.trim()}>
              {ytBusy ? "Ekleniyor…" : "Transkripti al"}
            </button>
          </div>
          <p className="hint">Videonun altyazısı (transkript) belge olarak kaydedilir; altyazısı olmayan videolar çalışmaz. Otomatik altyazılarda yazım hataları olabilir.</p>
        </form>
        <div role="status" aria-live="polite">{status && <p className="msg ok">{status}</p>}</div>
        <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
      </section>

      <section aria-labelledby="liste-baslik" style={{ marginTop: 24 }}>
        <h2 id="liste-baslik">Belgelerim</h2>
        {docs === null && !error && <p>Yükleniyor…</p>}
        {docs?.length === 0 && <p className="hint">Henüz belge yüklemediniz.</p>}
        <ul className="doclist">
          {docs?.map((d) => (
            <li key={d.id} className="card">
              <div className="docrow">
                <div>
                  <Link href={`/belge/${d.id}`} className="doctitle">{d.title}</Link>
                  <div className="hint">
                    {kindAd(d.kind)}
                    {d.page_count ? ` · ${d.page_count} ${d.kind === "pptx" ? "slayt" : "sayfa"}` : ""}
                    {d.char_count ? ` · ${d.char_count.toLocaleString("tr-TR")} karakter` : ""}
                    {" · "}{new Date(d.created_at).toLocaleString("tr-TR")}
                  </div>
                </div>
                <div className="row">
                  <span className={`badge ${d.status}`}>{DURUM[d.status]}</span>
                  <button type="button" className="btn sec" onClick={() => sil(d)} aria-label={`${d.title} belgesini sil`}>Sil</button>
                </div>
              </div>
              {d.status === "failed" && d.error && <p className="msg err">{d.error}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
