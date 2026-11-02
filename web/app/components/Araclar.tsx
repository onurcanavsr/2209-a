"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/client";
import { LANGS, LANG_LABEL, type Lang } from "@/lib/i18n/core";

export default function Araclar() {
  const { lang, t, setLang } = useLang();
  const [tema, setTema] = useState("auto");
  const [boyut, setBoyut] = useState(17);

  useEffect(() => {
    try {
      setTema(localStorage.getItem("tema") || "auto");
      setBoyut(Number(localStorage.getItem("boyut")) || 17);
    } catch {}
  }, []);

  function uygula(t: string, b: number) {
    const r = document.documentElement;
    if (t === "auto") r.removeAttribute("data-theme");
    else r.setAttribute("data-theme", t);
    r.style.setProperty("--fs", b + "px");
    setTema(t);
    setBoyut(b);
    try {
      localStorage.setItem("tema", t);
      localStorage.setItem("boyut", String(b));
    } catch {}
  }

  // Sesli komutlar (SesDugmesi) temayı ve yazı boyutunu buradan değiştirir; böylece seçim kutusu da güncel kalır
  useEffect(() => {
    function f(e: Event) {
      const d = (e as CustomEvent<{ tema?: string; boyutFark?: number }>).detail || {};
      uygula(d.tema ?? tema, Math.min(26, Math.max(14, boyut + (d.boyutFark ?? 0))));
    }
    window.addEventListener("araclar:ayarla", f);
    return () => window.removeEventListener("araclar:ayarla", f);
  });

  // Sesli komut ("switch to English" / "Türkçeye geç") dili buradan değiştirir
  useEffect(() => {
    function d(e: Event) {
      const l = (e as CustomEvent<{ lang?: Lang }>).detail?.lang;
      if (l) setLang(l);
    }
    window.addEventListener("araclar:dil", d);
    return () => window.removeEventListener("araclar:dil", d);
  });

  return (
    <>
      <label htmlFor="dil" className="sr">{t("Dil")}</label>
      <select id="dil" value={lang} lang={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map((l) => <option key={l} value={l} lang={l}>{LANG_LABEL[l]}</option>)}
      </select>
      <label htmlFor="tema" className="sr">{t("Tema")}</label>
      <select id="tema" value={tema} onChange={(e) => uygula(e.target.value, boyut)}>
        <option value="auto">{t("Tema: Otomatik")}</option>
        <option value="light">{t("Açık")}</option>
        <option value="dark">{t("Koyu")}</option>
      </select>
      <button type="button" aria-label={t("Yazı boyutunu küçült")} onClick={() => uygula(tema, Math.max(14, boyut - 1))}>A−</button>
      <button type="button" aria-label={t("Yazı boyutunu büyüt")} onClick={() => uygula(tema, Math.min(26, boyut + 1))}>A+</button>
    </>
  );
}
