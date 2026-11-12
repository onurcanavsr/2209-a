"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { useLang } from "@/lib/i18n/client";

type Gorsel = { page: number; st: "ok" | "empty" | "skip" };
type Veri = { n: number; metin: string; st: Gorsel["st"] };

// "Çıkarılan Metin" bölümünde, belgedeki görsellerden (resim, fotoğraf, ekran görüntüsü) OCR ile okunan metni ayrı bir kutuda
// gösterir; görseller arasında ileri-geri gezilir. Metin kutusundan bağımsızdır (gorsel/onGit üstten yönetilir).
export default function GorselKutusu({ docId, gorseller, gorsel, onGit, onSayfa, slayt }:
  { docId: string; gorseller: Gorsel[]; gorsel: number; onGit: (i: number) => void; onSayfa: (sayfa: number) => void; slayt: boolean }) {
  const { t } = useLang();
  const toplam = gorseller.length;
  const [veri, setVeri] = useState<Veri | null>(null);
  const [hata, setHata] = useState("");
  const [girdi, setGirdi] = useState(String(gorsel + 1));
  const onbellek = useRef(new Map<number, Veri>());

  useEffect(() => setGirdi(String(gorsel + 1)), [gorsel]);

  // Seçilen görselin metnini getir (bir kez getirilen önbellekte kalır)
  useEffect(() => {
    setHata("");
    if (onbellek.current.has(gorsel)) return;
    let iptal = false;
    (async () => {
      let r: Response;
      try { r = await apiFetch(`/api/documents/${docId}/images/${gorsel + 1}`); }
      catch { if (!iptal) setHata(t("Sunucuya ulaşılamadı.")); return; }
      if (!r.ok) { const m = await hataMesaji(r, t("Görsel metni yüklenemedi.")); if (!iptal) setHata(m); return; }
      const j = await r.json();
      const v: Veri = { n: gorsel, metin: j.text ?? "", st: j.st };
      onbellek.current.set(gorsel, v);
      if (!iptal) setVeri(v);
    })();
    return () => { iptal = true; };
  }, [docId, gorsel, t]);

  const guncel = veri && veri.n === gorsel ? veri : onbellek.current.get(gorsel) ?? null;
  const sayfa = gorseller[gorsel]?.page ?? 0;
  const kap = { display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" } as const;

  function git(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(girdi);
    if (Number.isInteger(n) && n >= 1 && n <= toplam) onGit(n - 1);
    else setGirdi(String(gorsel + 1));
  }

  return (
    <section id="gorsel-kutusu" tabIndex={-1} className="alt-kart" aria-label={t("Görsellerden okunan metin")}>
      <h3 style={{ marginTop: 0 }}>{t("Görsellerden okunan metin")}</h3>
      <nav aria-label={t("Görsel gezintisi")} style={kap}>
        <button type="button" className="btn sec" style={{ width: "auto" }} disabled={gorsel <= 0} onClick={() => onGit(gorsel - 1)}>
          ← {t("Önceki görsel")}
        </button>
        <form onSubmit={git} style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="gorsel-no">{t("Görsel numarası (1–{n})", { n: toplam })}</label>
          <input id="gorsel-no" type="number" min={1} max={toplam} value={girdi} onChange={(e) => setGirdi(e.target.value)} style={{ width: "6rem" }} />
          <span aria-hidden="true">/ {toplam}</span>
          <button type="submit" className="btn sec" style={{ width: "auto" }}>{t("Git")}</button>
        </form>
        <button type="button" className="btn sec" style={{ width: "auto" }} disabled={gorsel >= toplam - 1} onClick={() => onGit(gorsel + 1)}>
          {t("Sonraki görsel")} →
        </button>
      </nav>
      <p className="hint" style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" }}>
        <span>{t("Görsel {i} / {n}", { i: gorsel + 1, n: toplam })} · {slayt ? t("Bu görsel {n}. slaytta.", { n: sayfa + 1 }) : t("Bu görsel {n}. sayfada.", { n: sayfa + 1 })}</span>
        <button type="button" className="btn sec" style={{ width: "auto" }} onClick={() => onSayfa(sayfa)}>
          {slayt ? t("{n}. slayda git", { n: sayfa + 1 }) : t("{n}. sayfaya git", { n: sayfa + 1 })}
        </button>
      </p>
      {guncel?.st === "ok" && (
        <p className="hint" role="note" style={{ borderLeft: "4px solid currentColor", paddingLeft: "0.6rem" }}>
          <strong>OCR</strong> — {t("Bu görsel OCR ile okundu; okuma hataları olabilir.")}
        </p>
      )}
      {hata && <p className="msg err" role="alert">{hata}</p>}
      <div className="doctext" tabIndex={0} role="region" aria-busy={!guncel && !hata} aria-label={t("Görselden okunan metin")}>
        {!guncel ? (hata ? null : <p className="hint">{t("Görsel metni yükleniyor…")}</p>)
          : guncel.st === "ok" ? <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{guncel.metin}</p>
          : guncel.st === "skip" ? <p className="hint">{t("Bu görsel, görsel sayısı sınırı aşıldığı için okunmadı.")}</p>
          : <p className="hint">{t("Bu görselde okunabilir metin bulunamadı (fotoğraf veya çizim olabilir).")}</p>}
      </div>
    </section>
  );
}
