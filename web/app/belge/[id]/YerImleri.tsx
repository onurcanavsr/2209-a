"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, hataMesaji } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export type YerImi = { id: string; label: string; word_index: number; snippet: string; created_at: string };

export default function YerImleri({ docId }: { docId: string }) {
  const t = useT();
  const [imler, setImler] = useState<YerImi[] | null>(null);
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/documents/${docId}/bookmarks`);
        if (r.ok) setImler(await r.json());
        else setHata(await hataMesaji(r, t("Yer imleri yüklenemedi.")));
      } catch { setHata(t("Sunucuya ulaşılamadı.")); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  async function sil(im: YerImi) {
    if (!window.confirm(t("“{ad}” yer imi silinsin mi?", { ad: im.label }))) return;
    setHata(""); setDurum("");
    try {
      const r = await apiFetch(`/api/bookmarks/${im.id}`, { method: "DELETE" });
      if (!r.ok) setHata(await hataMesaji(r, t("Yer imi silinemedi.")));
      else { setImler((l) => (l ?? []).filter((x) => x.id !== im.id)); setDurum(t("Yer imi silindi.")); }
    } catch { setHata(t("Sunucuya ulaşılamadı.")); }
  }

  return (
    <section aria-labelledby="imler-baslik" className="panel">
      <h2 id="imler-baslik" className="panel-h">{t("Yer İmleri")}</h2>
      <p className="panel-alt">
        {t("Yer imlerini")} <Link href={`/belge/${docId}?b=metin`}>{t("Çıkarılan Metin")}</Link> {t("bölümünde bir kelimeyi seçerek ekleyebilirsiniz.")}
      </p>
      <div role="status" aria-live="polite">{durum && <p className="msg ok">{durum}</p>}</div>
      <div role="alert">{hata && <p className="msg err">{hata}</p>}</div>
      {imler === null && !hata && <p>{t("Yükleniyor…")}</p>}
      {imler?.length === 0 && <p className="hint">{t("Henüz yer imi eklemediniz.")}</p>}
      <ul className="oge-liste">
        {imler?.map((im) => (
          <li key={im.id} className="oge">
            <p className="oge-baslik">{im.label}</p>
            {im.snippet && <p className="hint">“{im.snippet}”</p>}
            <div className="oge-alt">
              <span className="hint">{t("Kelime {n}", { n: im.word_index + 1 })}</span>
              <span className="row">
                <Link className="btn sec baglanti-btn" href={`/belge/${docId}?b=metin&k=${im.word_index}`}>
                  {t("Metinde göster")}<span className="sr-only">: {im.label}</span>
                </Link>
                <button type="button" className="btn sec" onClick={() => sil(im)} aria-label={t("Yer imini sil: {ad}", { ad: im.label })}>{t("Sil")}</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
