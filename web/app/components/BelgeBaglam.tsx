"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// Açık belgenin adı ve ayrıntısı üst çubuktaki belge etiketinde gösterilir; BelgeDetay doldurur.
export type BelgeBilgi = { baslik: string; ayrinti: string };
type Baglam = { bilgi: BelgeBilgi | null; ayarla: (b: BelgeBilgi | null) => void };

const Ctx = createContext<Baglam>({ bilgi: null, ayarla: () => {} });

export function BelgeBaglamSaglayici({ children }: { children: ReactNode }) {
  const [bilgi, setBilgi] = useState<BelgeBilgi | null>(null);
  const ayarla = useCallback((b: BelgeBilgi | null) => {
    // Aynı bilgi tekrar gelirse yeniden çizim yapma
    setBilgi((o) => (o && b && o.baslik === b.baslik && o.ayrinti === b.ayrinti ? o : b));
  }, []);
  const deger = useMemo(() => ({ bilgi, ayarla }), [bilgi, ayarla]);
  return <Ctx.Provider value={deger}>{children}</Ctx.Provider>;
}

export const useBelgeBilgi = () => useContext(Ctx);
