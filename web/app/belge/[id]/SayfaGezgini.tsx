"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/client";

// "Çıkarılan Metin" bölümünde sayfa (PDF) / slayt (PowerPoint) gezintisi: önceki, sonraki ve numaraya git.
// kompakt: yalnızca önceki/sonraki (metnin altında, sayfanın sonuna gelince tekrar yukarı çıkmadan ilerlemek için).
export default function SayfaGezgini({ sayfa, toplam, slayt, onGit, kompakt = false }:
  { sayfa: number; toplam: number; slayt: boolean; onGit: (sayfa: number) => void; kompakt?: boolean }) {
  const { t } = useLang();
  const [girdi, setGirdi] = useState(String(sayfa + 1));
  useEffect(() => setGirdi(String(sayfa + 1)), [sayfa]);

  function git(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(girdi);
    if (Number.isInteger(n) && n >= 1 && n <= toplam) onGit(n - 1);
    else setGirdi(String(sayfa + 1));            // geçersiz numara: mevcut sayfaya geri dön
  }

  const onceki = slayt ? t("Önceki slayt") : t("Önceki sayfa");
  const sonraki = slayt ? t("Sonraki slayt") : t("Sonraki sayfa");
  const kap = { display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" } as const;

  return (
    <nav aria-label={slayt ? t("Slayt gezintisi") : t("Sayfa gezintisi")} className={kompakt ? undefined : "alt-kart"} style={kap}>
      <button type="button" className="btn sec" style={{ width: "auto" }} disabled={sayfa <= 0} onClick={() => onGit(sayfa - 1)}>
        ← {onceki}
      </button>
      {kompakt ? (
        <span>{slayt ? t("Slayt {i} / {n}", { i: sayfa + 1, n: toplam }) : t("Sayfa {i} / {n}", { i: sayfa + 1, n: toplam })}</span>
      ) : (
        <form onSubmit={git} style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="sayfa-no">{slayt ? t("Slayt numarası (1–{n})", { n: toplam }) : t("Sayfa numarası (1–{n})", { n: toplam })}</label>
          <input id="sayfa-no" type="number" min={1} max={toplam} value={girdi} onChange={(e) => setGirdi(e.target.value)} style={{ width: "6rem" }} />
          <span aria-hidden="true">/ {toplam}</span>
          <button type="submit" className="btn sec" style={{ width: "auto" }}>{t("Git")}</button>
        </form>
      )}
      <button type="button" className="btn sec" style={{ width: "auto" }} disabled={sayfa >= toplam - 1} onClick={() => onGit(sayfa + 1)}>
        {sonraki} →
      </button>
    </nav>
  );
}
