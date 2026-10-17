// Ekrandaki metinde okunan kelimeyi işaretler. React'i yeniden çizdirmez (yüzlerce kelime, saniyede birkaç kez):
// yalnızca ilgili <span data-w="n"> üzerindeki "on" sınıfını değiştirir.

let sonKullaniciKaydirmasi = 0;
if (typeof window !== "undefined") {
  const KAYDIRMA_TUSLARI = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
  const isaretle = () => { sonKullaniciKaydirmasi = Date.now(); };
  window.addEventListener("wheel", isaretle, { passive: true });
  window.addEventListener("touchmove", isaretle, { passive: true });
  window.addEventListener("keydown", (e) => { if (KAYDIRMA_TUSLARI.has(e.key)) isaretle(); }, { passive: true });
}

function kaydirilabilirAta(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

// Kelime görünür alanın (ekran ∩ varsa kaydırılabilir kutu) dışındaysa ortaya getirir.
// Kullanıcı son 4 sn içinde kendisi kaydırdıysa karışmaz.
function gorunurYap(el: HTMLElement) {
  if (Date.now() - sonKullaniciKaydirmasi < 4000) return;
  let ust = 0, alt = window.innerHeight;
  const kap = kaydirilabilirAta(el);
  if (kap) { const r = kap.getBoundingClientRect(); ust = Math.max(ust, r.top); alt = Math.min(alt, r.bottom); }
  const r = el.getBoundingClientRect();
  if (r.top < ust + 40 || r.bottom > alt - 80) {
    const azalt = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: azalt ? "auto" : "smooth" });
  }
}

export function vurguIsaretle(kap: HTMLElement | null, onceki: number, yeni: number) {
  if (!kap) return;
  if (onceki >= 0) kap.querySelector(`[data-w="${onceki}"]`)?.classList.remove("on");
  if (yeni >= 0) {
    const el = kap.querySelector<HTMLElement>(`[data-w="${yeni}"]`);
    if (el) { el.classList.add("on"); gorunurYap(el); }
  }
}
