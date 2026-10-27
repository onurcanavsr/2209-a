import { useEffect, useRef } from "react";
import { kaydet, mikrofonAcilinca, type Isleyici } from "./kayit";

/** Bileşenin komutlarını bağlar. İşleyiciler her çizimde güncellenir (eski durumu yakalamaz). */
export function useSesKomutlari(isleyiciler: Record<string, Isleyici>, oncelik = 0) {
  const ref = useRef(isleyiciler);
  ref.current = isleyiciler;
  const anahtar = Object.keys(isleyiciler).join("|");
  useEffect(() => {
    const sil = anahtar.split("|").filter(Boolean).map((id) => kaydet(id, () => ref.current[id]?.(), oncelik));
    return () => sil.forEach((f) => f());
  }, [anahtar, oncelik]);
}

export function useMikrofonAcilinca(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => mikrofonAcilinca(() => ref.current()), []);
}
