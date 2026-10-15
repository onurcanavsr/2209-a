"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, hataMesaji, DURUM, type Belge } from "@/lib/api";

const MAX_MB = 10;
const UZANTILAR = ["pdf", "docx", "pptx"];

export default function Calisma() {
  const [docs, setDocs] = useState<Belge[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const prev = useRef<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);

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

  async function sil(d: Belge) {
    if (!window.confirm(`“${d.title}” silinsin mi? Bu işlem geri alınamaz.`)) return;
    const r = await apiFetch(`/api/documents/${d.id}`, { method: "DELETE" });
    if (r.ok) { setStatus(`“${d.title}” silindi.`); delete prev.current[d.id]; await load(); }
    else setError(await hataMesaji(r, "Belge silinemedi."));
  }

  return (
    <div>
      <h1>Çalışma Alanı</h1>
      <p className="sub">PDF, Word veya PowerPoint belgenizi yükleyin; metni çıkaralım.</p>

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
                    {d.kind.toUpperCase()}
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
