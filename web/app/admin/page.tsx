"use client";
import { useEffect, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { eylemAd, sayi, usd, type Ozet } from "@/lib/admin";

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
  const [o, setO] = useState<Ozet | null>(null);
  const [hata, setHata] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch("/api/admin/overview");
        if (!r.ok) { setHata(await hataMesaji(r, "Veriler alınamadı.")); return; }
        setO(await r.json());
      } catch { setHata("Sunucuya ulaşılamadı."); }
    })();
  }, []);

  if (hata) return <p className="msg err" role="alert">{hata}</p>;
  if (!o) return <p role="status">Yükleniyor…</p>;

  return (
    <section aria-labelledby="gb">
      <h2 id="gb">Genel bakış</h2>
      <dl className="stats">
        <Kart baslik="Kullanıcı" deger={sayi(o.users)} not={`${o.admins} yönetici · ${o.inactive_users} devre dışı`} />
        <Kart baslik="Son 7 günde etkin" deger={sayi(o.active_7d)} not={`${o.new_7d} yeni kayıt`} />
        <Kart baslik="Belge" deger={sayi(o.documents)} not={o.documents_failed ? `${o.documents_failed} başarısız` : "başarısız yok"} />
        <Kart baslik="Özet · Test · Soru" deger={`${sayi(o.summaries)} · ${sayi(o.quizzes)} · ${sayi(o.qa_messages)}`} />
        <Kart baslik="Bugünkü işlem" deger={sayi(o.today.calls)} />
        <Kart baslik="Tahmini maliyet (bugün)" deger={usd(o.today.est_cost)} />
        <Kart baslik="Tahmini maliyet (30 gün)" deger={usd(o.last_30d.est_cost)} not={`${sayi(o.last_30d.calls)} işlem`} />
      </dl>
      <p className="hint">Maliyetler tahmindir ve gerçek faturanın yerine geçmez; ayrıntı ve varsayımlar için “Kullanım ve maliyet” sayfasına bakın.</p>

      <h3>Bugün eylemlere göre</h3>
      {o.today.by_action.length === 0 ? <p>Bugün henüz işlem yok.</p> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Bugünkü işlemler ve tahmini maliyet</caption>
            <thead><tr><th scope="col">Eylem</th><th scope="col" className="sayi">İşlem</th><th scope="col" className="sayi">Tahmini maliyet</th></tr></thead>
            <tbody>
              {o.today.by_action.map((a) => (
                <tr key={a.action}><th scope="row">{eylemAd(a.action)}</th><td className="sayi">{sayi(a.calls)}</td><td className="sayi">{usd(a.est_cost)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
