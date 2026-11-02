"use client";
import { useEffect, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { eylemAd, sayi, usd, type Ozet } from "@/lib/admin";
import { useLang } from "@/lib/i18n/client";

function Kart({ baslik, deger, not }: { baslik: string; deger: string; not?: string }) {
  return (
    <div className="stat">
      <dt>{baslik}</dt>
      <dd>{deger}</dd>
      {not && <span className="hint">{not}</span>}
    </div>
  );
}

export default function GenelBakis() {
  const { lang, t } = useLang();
  const sy = (n: number) => sayi(n, lang), us = (n: number) => usd(n, lang);
  const [o, setO] = useState<Ozet | null>(null);
  const [hata, setHata] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch("/api/admin/overview");
        if (!r.ok) { setHata(await hataMesaji(r, t("Veriler alınamadı."))); return; }
        setO(await r.json());
      } catch { setHata(t("Sunucuya ulaşılamadı.")); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hata) return <p className="msg err" role="alert">{hata}</p>;
  if (!o) return <p role="status">{t("Yükleniyor…")}</p>;

  return (
    <section aria-labelledby="gb">
      <h2 id="gb">{t("Genel bakış")}</h2>
      <dl className="stats">
        <Kart baslik={t("Kullanıcı")} deger={sy(o.users)} not={t("{a} yönetici · {b} devre dışı", { a: o.admins, b: o.inactive_users })} />
        <Kart baslik={t("Son 7 günde etkin")} deger={sy(o.active_7d)} not={t("{n} yeni kayıt", { n: o.new_7d })} />
        <Kart baslik={t("Belge")} deger={sy(o.documents)} not={o.documents_failed ? t("{n} başarısız", { n: o.documents_failed }) : t("başarısız yok")} />
        <Kart baslik={t("Özet · Test · Soru")} deger={`${sy(o.summaries)} · ${sy(o.quizzes)} · ${sy(o.qa_messages)}`} />
        <Kart baslik={t("Bugünkü işlem")} deger={sy(o.today.calls)} />
        <Kart baslik={t("Tahmini maliyet (bugün)")} deger={us(o.today.est_cost)} />
        <Kart baslik={t("Tahmini maliyet (30 gün)")} deger={us(o.last_30d.est_cost)} not={t("{n} işlem", { n: sy(o.last_30d.calls) })} />
      </dl>
      <p className="hint">{t("Maliyetler tahmindir ve gerçek faturanın yerine geçmez; ayrıntı ve varsayımlar için “Kullanım ve maliyet” sayfasına bakın.")}</p>

      <h3>{t("Bugün eylemlere göre")}</h3>
      {o.today.by_action.length === 0 ? <p>{t("Bugün henüz işlem yok.")}</p> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">{t("Bugünkü işlemler ve tahmini maliyet")}</caption>
            <thead><tr><th scope="col">{t("Eylem")}</th><th scope="col" className="sayi">{t("İşlem")}</th><th scope="col" className="sayi">{t("Tahmini maliyet")}</th></tr></thead>
            <tbody>
              {o.today.by_action.map((a) => (
                <tr key={a.action}><th scope="row">{t(eylemAd(a.action))}</th><td className="sayi">{sy(a.calls)}</td><td className="sayi">{us(a.est_cost)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
