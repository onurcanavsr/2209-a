"use client";
import { useEffect, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { csvIndir, eylemAd, sayi, usd, type Ayarlar, type Kullanim, type KullaniciKullanimi } from "@/lib/admin";

const ARALIKLAR = [7, 30, 90];

export default function KullanimMaliyet() {
  const [gun, setGun] = useState(30);
  const [k, setK] = useState<Kullanim | null>(null);
  const [uk, setUk] = useState<KullaniciKullanimi | null>(null);
  const [ayar, setAyar] = useState<Ayarlar | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");

  useEffect(() => {
    let iptal = false;
    (async () => {
      setYukleniyor(true); setHata("");
      try {
        const [a, b, c] = await Promise.all([
          apiFetch(`/api/admin/usage?days=${gun}`), apiFetch(`/api/admin/usage/users?days=${gun}&limit=50`), apiFetch("/api/admin/limits"),
        ]);
        if (iptal) return;
        if (!a.ok) { setHata(await hataMesaji(a, "Kullanım verisi alınamadı.")); setYukleniyor(false); return; }
        setK(await a.json());
        if (b.ok) setUk(await b.json());
        if (c.ok) setAyar(await c.json());
      } catch { if (!iptal) setHata("Sunucuya ulaşılamadı."); }
      if (!iptal) setYukleniyor(false);
    })();
    return () => { iptal = true; };
  }, [gun]);

  const toplamIslem = k ? k.by_action.reduce((n, a) => n + a.calls, 0) : 0;
  const enYuksek = k ? Math.max(...k.daily.map((d) => d.est_cost), 0) : 0;

  return (
    <section aria-labelledby="km">
      <h2 id="km">Kullanım ve maliyet</h2>
      <div className="row">
        <div role="group" aria-label="Zaman aralığı" className="seg">
          {ARALIKLAR.map((d) => <button key={d} type="button" aria-pressed={gun === d} onClick={() => setGun(d)}>Son {d} gün</button>)}
        </div>
      </div>

      <div className="msg warn">
        <strong>Bu tutarlar tahmindir.</strong> Sistem gerçek token sayılarını değil, işlenen metin miktarını kaydeder; tutarlar bundan,
        aşağıdaki varsayımlarla hesaplanır. Gerçek fatura için Anthropic Console’a (ve Azure sesi kullanıyorsanız Azure panosuna) bakın.
        {ayar && (
          <ul style={{ margin: "8px 0 0" }}>
            <li>Ana model ({ayar.models.main}): {usd(ayar.cost_assumptions.llm_main_usd_per_mtok[0])} girdi / {usd(ayar.cost_assumptions.llm_main_usd_per_mtok[1])} çıktı (milyon token başına)</li>
            <li>Hızlı model ({ayar.models.fast}): {usd(ayar.cost_assumptions.llm_fast_usd_per_mtok[0])} / {usd(ayar.cost_assumptions.llm_fast_usd_per_mtok[1])}</li>
            <li>Sesli okuma: {ayar.models.tts_provider === "azure" ? `Azure, milyon karakter başına ${usd(ayar.cost_assumptions.tts_usd_per_mchar)}` : "Edge (ücretsiz sayılır)"}</li>
            <li>Kaba oran: token başına {ayar.cost_assumptions.chars_per_token} karakter. Bu değerler sunucudaki ortam değişkenlerinden (COST_*) ayarlanır.</li>
          </ul>
        )}
      </div>

      <div role="alert" aria-live="assertive">{hata && <p className="msg err">{hata}</p>}</div>
      {yukleniyor && !k && <p role="status">Yükleniyor…</p>}

      {k && (
        <div aria-busy={yukleniyor}>
          <dl className="stats">
            <div className="stat"><dt>Toplam tahmini maliyet</dt><dd>{usd(k.total_est_cost)}</dd><span className="hint">son {k.days} gün</span></div>
            <div className="stat"><dt>Toplam işlem</dt><dd>{sayi(toplamIslem)}</dd></div>
            <div className="stat"><dt>Günlük ortalama</dt><dd>{usd(k.total_est_cost / k.days)}</dd></div>
          </dl>

          <h3>Eylemlere göre</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">Eylemlere göre işlem sayısı ve tahmini maliyet</caption>
              <thead><tr><th scope="col">Eylem</th><th scope="col" className="sayi">İşlem</th><th scope="col" className="sayi">Birim</th><th scope="col" className="sayi">Tahmini maliyet</th></tr></thead>
              <tbody>
                {k.by_action.map((a) => (
                  <tr key={a.action}><th scope="row">{eylemAd(a.action)}</th><td className="sayi">{sayi(a.calls)}</td><td className="sayi">{sayi(a.units)}</td><td className="sayi">{usd(a.est_cost)}</td></tr>
                ))}
                {k.by_action.length === 0 && <tr><td colSpan={4}>Bu aralıkta işlem yok.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="hint">Birim: özet/test için belge karakteri, soru için modele giden istem karakteri, sesli okuma için karakter, yükleme için bayt. Soru-cevap birimi bu sürümden itibaren istem uzunluğudur; daha eski kayıtlarda yalnızca soru uzunluğudur, bu yüzden eski soru maliyetleri olduğundan düşük görünür.</p>

          <h3>Günlük tahmini maliyet</h3>
          {k.daily.length === 0 ? <p>Bu aralıkta veri yok.</p> : (
            <figure style={{ margin: 0 }}>
              <div className="bars" aria-hidden="true">
                {k.daily.map((d) => (
                  <div key={d.day} className="bar" title={`${d.day}: ${usd(d.est_cost)}`}
                    style={{ height: `${enYuksek > 0 ? Math.max(3, (d.est_cost / enYuksek) * 100) : 3}%` }} />
                ))}
              </div>
              <figcaption className="hint">En yüksek gün: {usd(enYuksek)}. Ayrıntılar aşağıdaki tabloda.</figcaption>
            </figure>
          )}
          <details>
            <summary>Günlük döküm tablosu</summary>
            <div className="tbl-wrap">
              <table className="tbl">
                <caption className="sr-only">Gün ve eylem bazında kullanım</caption>
                <thead><tr><th scope="col">Gün</th><th scope="col">Eylem</th><th scope="col" className="sayi">İşlem</th><th scope="col" className="sayi">Kullanıcı</th><th scope="col" className="sayi">Tahmini maliyet</th></tr></thead>
                <tbody>
                  {k.rows.map((r, i) => (
                    <tr key={`${r.day}-${r.action}-${i}`}><th scope="row">{r.day}</th><td>{eylemAd(r.action)}</td><td className="sayi">{sayi(r.calls)}</td><td className="sayi">{sayi(r.users)}</td><td className="sayi">{usd(r.est_cost)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn sec" disabled={k.rows.length === 0}
              onClick={() => csvIndir(`kullanim-son-${k.days}-gun.csv`, ["Gün", "Eylem", "İşlem", "Birim", "Kullanıcı", "Tahmini maliyet (USD)"],
                k.rows.map((r) => [r.day, eylemAd(r.action), r.calls, r.units, r.users, r.est_cost]))}>
              Günlük dökümü CSV indir
            </button>
          </div>

          <h3>En çok kullanan hesaplar</h3>
          {!uk || uk.items.length === 0 ? <p>Bu aralıkta veri yok.</p> : (
            <>
              <div className="tbl-wrap">
                <table className="tbl">
                  <caption className="sr-only">Tahmini maliyete göre en çok kullanan hesaplar</caption>
                  <thead><tr><th scope="col">Hesap</th><th scope="col" className="sayi">İşlem</th><th scope="col">Eylemler</th><th scope="col" className="sayi">Tahmini maliyet</th></tr></thead>
                  <tbody>
                    {uk.items.map((u) => (
                      <tr key={u.user_id}>
                        <th scope="row">{u.email ?? u.user_id}</th><td className="sayi">{sayi(u.calls)}</td>
                        <td>{Object.entries(u.by_action).map(([a, n]) => `${eylemAd(a)}: ${sayi(n)}`).join(" · ")}</td>
                        <td className="sayi">{usd(u.est_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button type="button" className="btn sec"
                  onClick={() => csvIndir(`kullanicilar-son-${uk.days}-gun.csv`, ["Hesap", "İşlem", "Tahmini maliyet (USD)"],
                    uk.items.map((u) => [u.email ?? u.user_id, u.calls, u.est_cost]))}>
                  Hesap dökümünü CSV indir
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
