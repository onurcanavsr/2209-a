"use client";
import { useEffect, useState } from "react";

export default function Araclar() {
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

  return (
    <>
      <label htmlFor="tema" className="sr">Tema</label>
      <select id="tema" value={tema} onChange={(e) => uygula(e.target.value, boyut)}>
        <option value="auto">Tema: Otomatik</option>
        <option value="light">Açık</option>
        <option value="dark">Koyu</option>
      </select>
      <button type="button" aria-label="Yazı boyutunu küçült" onClick={() => uygula(tema, Math.max(14, boyut - 1))}>A−</button>
      <button type="button" aria-label="Yazı boyutunu büyüt" onClick={() => uygula(tema, Math.min(26, boyut + 1))}>A+</button>
    </>
  );
}
