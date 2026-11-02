"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, hataMesaji, DURUM, type Belge } from "@/lib/api";
import { belgeAra, belgeFiil, baslikOku } from "@/lib/ses/belgeAra";
import { kindAd, sayfaYazi } from "@/lib/belgeTuru";
import { dikteIste, onayIste, sesDuyur } from "@/lib/ses/kayit";
import { useSesIpuclari, useSesKomutlari, useSesMetin } from "@/lib/ses/useSesKomutlari";
import { useLang } from "@/lib/i18n/client";
import { sayiYaz, tarihYaz } from "@/lib/i18n/core";

const MAX_MB = 10;
const UZANTILAR = ["pdf", "docx", "pptx"];

export default function Calisma() {
  const { lang, t } = useLang();
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
        if (before === "processing" && d.status === "ready") setStatus(t("“{ad}” hazır.", { ad: d.title }));
        if (before === "processing" && d.status === "failed") setStatus(t("“{ad}” işlenemedi.", { ad: d.title }));
        prev.current[d.id] = d.status;
      }
      setDocs(list);
    } catch {
      setError(t("Belgeler yüklenemedi. Lütfen sayfayı yenileyin."));
    }
  }, [t]);   // dil değişince liste yeniden alınır (not/hata iletileri sunucuda çevrilir)

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!docs?.some((d) => d.status === "processing")) return;
    const iv = setInterval(load, 2500);
    return () => clearInterval(iv);
  }, [docs, load]);

  async function gonder(file: File) {
    setError(""); setStatus("");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!UZANTILAR.includes(ext)) return setError(t("Desteklenen türler: PDF, Word (.docx) ve PowerPoint (.pptx)."));
    if (file.size === 0) return setError(t("Dosya boş."));
    if (file.size > MAX_MB * 1024 * 1024) return setError(t("Dosya en fazla {mb} MB olabilir.", { mb: MAX_MB }));
    setBusy(true);
    setStatus(t("“{ad}” yükleniyor…", { ad: file.name }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch("/api/documents", { method: "POST", body: fd });
      if (!r.ok) { setStatus(""); setError(await hataMesaji(r, t("Yükleme başarısız oldu."))); }
      else {
        const j = await r.json();
        setStatus(j.cached ? t("Bu dosya daha önce yüklenmişti, hazır belge kullanıldı.") : t("“{ad}” yüklendi, işleniyor…", { ad: file.name }));
        await load();
      }
    } catch {
      setStatus(""); setError(t("Sunucuya ulaşılamadı. Lütfen tekrar deneyin."));
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function youtubeEkle(e: React.FormEvent) {
    e.preventDefault();
    const url = yt.trim();
    if (!url || ytBusy) return;
    setError(""); setStatus(t("YouTube bağlantısı alınıyor…")); setYtBusy(true);
    try {
      const r = await apiFetch("/api/documents/youtube", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      if (!r.ok) { setStatus(""); setError(await hataMesaji(r, t("Video eklenemedi."))); }
      else {
        const j = await r.json();
        setStatus(j.cached ? t("Bu video daha önce eklenmişti, hazır belge kullanıldı.") : t("Video eklendi, transkript alınıyor…"));
        setYt("");
        await load();
      }
    } catch {
      setStatus(""); setError(t("Sunucuya ulaşılamadı. Lütfen tekrar deneyin."));
    }
    setYtBusy(false);
  }

  async function sil(d: Belge, onayli = false) {
    if (!onayli && !window.confirm(t("“{ad}” silinsin mi? Bu işlem geri alınamaz.", { ad: d.title }))) return;
    const r = await apiFetch(`/api/documents/${d.id}`, { method: "DELETE" });
    if (r.ok) { setStatus(t("“{ad}” silindi.", { ad: d.title })); delete prev.current[d.id]; await load(); }
    else setError(await hataMesaji(r, t("Belge silinemedi.")));
  }

  // ---- Sesli komutlar ----
  function belgeAc(d: Belge) {
    sesDuyur(t("“{ad}” açılıyor.", { ad: baslikOku(d.title) }));
    router.push(`/belge/${d.id}`);
  }
  function belgeSilSesli(d: Belge) {
    onayIste(t("“{ad}” silinsin mi? Evet ya da hayır deyin.", { ad: baslikOku(d.title) }), () => sil(d, true));
  }

  useSesIpuclari(() => (docs ?? []).slice(0, 15).map((d) => baslikOku(d.title)));   // dosya adlarını tanıyıcıya ipucu ver
  useSesKomutlari({
    "belge.listele": () => {
      if (docs === null) sesDuyur(t("Belgeler yükleniyor, birazdan tekrar deneyin."));
      else if (docs.length === 0) sesDuyur(t("Henüz belge yüklemediniz."));
      else {
        const ilk = docs.slice(0, 10).map((d, i) => `${i + 1}. ${baslikOku(d.title)}, ${t(DURUM[d.status])}`).join(". ");
        sesDuyur(t("{n} belgeniz var. {liste}.{devam} Açmak için adını ya da sırasını söyleyin.", { n: docs.length, liste: ilk, devam: docs.length > 10 ? " " + t("Ve {n} belge daha.", { n: docs.length - 10 }) : "" }));
      }
    },
    "belge.yukle": () => {
      if (busy) return false;
      input.current?.focus();
      sesDuyur(t("Dosya seçme düğmesine odaklandım. Dosya penceresini açmak için Boşluk ya da Enter tuşuna basın."));
    },
  });
  useSesMetin((metin) => {
    if (!docs || docs.length === 0) return false;
    const s = belgeAra(metin, docs, lang);
    if (s.durum === "yok") return false;
    const eylem = belgeFiil(metin, lang) === "sil" ? belgeSilSesli : belgeAc;
    if (s.durum === "ok") { eylem(s.belge); return true; }
    // benzer adlı birden çok belge: tahmin yürütme, sor
    dikteIste({
      istem: t("Birden çok belge eşleşti: {liste}. Hangisi?", { liste: s.adaylar.map((b) => baslikOku(b.title)).join(", ") }),
      uygula: (m) => {
        const r = belgeAra(m, s.adaylar, lang);
        if (r.durum === "ok") eylem(r.belge);
        else sesDuyur(t("Hangi belge olduğu anlaşılamadı, işlem yapılmadı."));
      },
    });
    return true;
  });

  return (
    <div>
      <h1>{t("Çalışma Alanı")}</h1>
      <p className="sub">{t("PDF, Word veya PowerPoint belgenizi yükleyin ya da bir YouTube bağlantısı ekleyin; metni çıkaralım.")}</p>

      <section className="card" aria-labelledby="yukle-baslik">
        <h2 id="yukle-baslik" style={{ marginTop: 0 }}>{t("Belge yükle")}</h2>
        <div className={"drop" + (drag ? " drag" : "")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) gonder(f); }}>
          <p style={{ margin: "0 0 12px" }}>{t("Dosyayı buraya sürükleyin veya seçin (en fazla {mb} MB)", { mb: MAX_MB })}</p>
          <label htmlFor="dosya" className="btn" style={{ display: "inline-block", width: "auto", margin: 0, cursor: "pointer" }}>
            {busy ? t("Yükleniyor…") : t("Dosya seç")}
          </label>
          <input id="dosya" ref={input} type="file" accept=".pdf,.docx,.pptx" className="sr-file" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) gonder(f); }} />
          <p className="hint">{t("Taranmış PDF’ler OCR ile okunur ve hata içerebilir.")}</p>
        </div>
        <form onSubmit={youtubeEkle} aria-labelledby="yt-baslik" style={{ marginTop: 20 }}>
          <h3 id="yt-baslik" style={{ margin: "0 0 8px" }}>{t("YouTube videosu ekle")}</h3>
          <label htmlFor="yt-url">{t("YouTube bağlantısı")}</label>
          <div className="row">
            <input id="yt-url" type="text" inputMode="url" autoComplete="off" placeholder="https://www.youtube.com/watch?v=…"
              value={yt} onChange={(e) => setYt(e.target.value)} disabled={ytBusy} style={{ flex: "1 1 18rem" }} />
            <button type="submit" className="btn" style={{ width: "auto", margin: 0 }} disabled={ytBusy || !yt.trim()}>
              {ytBusy ? t("Ekleniyor…") : t("Transkripti al")}
            </button>
          </div>
          <p className="hint">{t("Videonun altyazısı (transkript) belge olarak kaydedilir; altyazısı olmayan videolar çalışmaz. Otomatik altyazılarda yazım hataları olabilir.")}</p>
        </form>
        <div role="status" aria-live="polite">{status && <p className="msg ok">{status}</p>}</div>
        <div role="alert" aria-live="assertive">{error && <p className="msg err">{error}</p>}</div>
      </section>

      <section aria-labelledby="liste-baslik" style={{ marginTop: 24 }}>
        <h2 id="liste-baslik">{t("Belgelerim")}</h2>
        {docs === null && !error && <p>{t("Yükleniyor…")}</p>}
        {docs?.length === 0 && <p className="hint">{t("Henüz belge yüklemediniz.")}</p>}
        <ul className="doclist">
          {docs?.map((d) => (
            <li key={d.id} className="card">
              <div className="docrow">
                <div>
                  <Link href={`/belge/${d.id}`} className="doctitle">{d.title}</Link>
                  <div className="hint">
                    {kindAd(d.kind)}
                    {d.page_count ? ` · ${sayfaYazi(t, d)}` : ""}
                    {d.char_count ? ` · ${t("{n} karakter", { n: sayiYaz(lang, d.char_count) })}` : ""}
                    {" · "}{tarihYaz(lang, d.created_at)}
                  </div>
                </div>
                <div className="row">
                  <span className={`badge ${d.status}`}>{t(DURUM[d.status])}</span>
                  <button type="button" className="btn sec" onClick={() => sil(d)} aria-label={t("{ad} belgesini sil", { ad: d.title })}>{t("Sil")}</button>
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
