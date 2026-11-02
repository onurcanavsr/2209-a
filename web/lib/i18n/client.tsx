"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, makeT, normLang, type Lang, type TFn } from "./core";

type Ctx = { lang: Lang; t: TFn; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: "tr", t: makeT("tr"), setLang: () => {} });

/** Kök düzende sunucunun belirlediği dille sarar. Dil değişince çerez yazılır ve sunucu bileşenleri yenilenir. */
export function LangProvider({ lang: initial, children }: { lang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const router = useRouter();
  const setLang = useCallback((l: Lang) => {
    const next = normLang(l);
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    try { localStorage.setItem("lang", next); } catch {}
    document.documentElement.lang = next;
    setLangState(next);
    router.refresh();   // sunucu bileşenleri (başlıklar, sayfa metinleri) yeni dille yeniden çizilir
  }, [router]);
  const value = useMemo(() => ({ lang, t: makeT(lang), setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const useT = () => useContext(LangContext).t;
