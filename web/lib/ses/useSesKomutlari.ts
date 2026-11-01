import { useEffect, useRef } from "react";
import { ipucuKaydet, kaydet, metinKaydet, mikrofonAcilinca, type Isleyici } from "./kayit";

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

/** Serbest cümle işleyicisi (belge adı, "3. soruya git" …). `false`: bende değil. */
export function useSesMetin(fn: (metin: string) => boolean | Promise<boolean>, oncelik = 0) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => metinKaydet((m) => ref.current(m), oncelik), [oncelik]);
}

/** Tanıyıcıya verilecek özel adlar (belge başlıkları gibi). */
export function useSesIpuclari(fn: () => string[]) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => ipucuKaydet(() => ref.current()), []);
}

export function useMikrofonAcilinca(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => mikrofonAcilinca(() => ref.current()), []);
}
