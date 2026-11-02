"use client";
import { useEffect, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { csvIndir, eylemAd, sayi, usd, type Ayarlar, type Kullanim, type KullaniciKullanimi } from "@/lib/admin";
import { useLang } from "@/lib/i18n/client";

const ARALIKLAR = [7, 30, 90];

export default function KullanimMaliyet() {
  const { lang, t } = useLang();
  const sy = (n: number) => sayi(n, lang), us = (n: number) => usd(n, lang);
  const ea = (a: string) => t(eylemAd(a));
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
        if (!a.ok) { setHata(await hataMesaji(a, t("Kullanım verisi alınamadı."))); setYukleniyor(false); return; }
        setK(await a.json());
        if (b.ok) setUk(await b.json());
        if (c.ok) setAyar(await c.json());
      } catch { if (!iptal) setHata(t("Sunucuya ulaşılamadı.")); }
      if (!iptal) setYukleniyor(false);
    })();
    return () => { iptal = true; };
  }, [gun, t]);

  const toplamIslem = k ? k.by_action.reduce((n, a) => n + a.calls, 0) : 0;
  const enYuksek = k ? Math.max(...k.daily.map((d) => d.est_cost), 0) : 0;

  return (
    <section aria-labelledby="km">
      <h2 id="km">{t("Kullanım ve maliyet")}</h2>
      <div className="row">
        <div role="group" aria-label={t("Zaman aralığı")} className="seg">
          {ARALIKLAR.map((d) => <button key={d} type="button" aria-pressed={gun === d} onClick={() => setGun(d)}>{t("Son {d} gün", { d })}</button>)}
        </div>
      </div>

      <div className="msg warn">
        <strong>{t("Bu tutarlar tahmindir.")}</strong> {t("Sistem gerçek token sayılarını değil, işlenen metin miktarını kaydeder; tutarlar bundan, aşağıdaki varsayımlarla hesaplanır. Gerçek fatura için Anthropic Console’a (ve Azure sesi kullanıyorsanız Azure panosuna) bakın.")}
        {ayar && (
          <ul style={{ margin: "8px 0 0" }}>
            <li>{t("Ana model ({model}): {girdi} girdi / {cikti} çıktı (milyon token başına)", { model: ayar.models.main, girdi: us(ayar.cost_assumptions.llm_main_usd_per_mtok[0]), cikti: us(ayar.cost_assumptions.llm_main_usd_per_mtok[1]) })}</li>
            <li>{t("Hızlı model ({model}): {a} / {b}", { model: ayar.models.fast, a: us(ayar.cost_assumptions.llm_fast_usd_per_mtok[0]), b: us(ayar.cost_assumptions.llm_fast_usd_per_mtok[1]) })}</li>
            <li>{t("Sesli okuma:")} {ayar.models.tts_provider === "azure" ? t("Azure, milyon karakter başına {tutar}", { tutar: us(ayar.cost_assumptions.tts_usd_per_mchar) }) : t("Edge (ücretsiz sayılır)")}</li>
            <li>{t("Kaba oran: token başına {n} karakter. Bu değerler sunucudaki ortam değişkenlerinden (COST_*) ayarlanır.", { n: ayar.cost_assumptions.chars_per_token })}</li>
          </ul>
        )}
      </div>

      <div role="alert" aria-live="assertive">{hata && <p className="msg err">{hata}</p>}</div>
      {yukleniyor && !k && <p role="status">{t("Yükleniyor…")}</p>}

      {k && (
        <div aria-busy={yukleniyor}>
          <dl className="stats">
            <div className="stat"><dt>{t("Toplam tahmini maliyet")}</dt><dd>{us(k.total_est_cost)}</dd><span className="hint">{t("son {n} gün", { n: k.days })}</span></div>
            <div className="stat"><dt>{t("Toplam işlem")}</dt><dd>{sy(toplamIslem)}</dd></div>
            <div className="stat"><dt>{t("Günlük ortalama")}</dt><dd>{us(k.total_est_cost / k.days)}</dd></div>
          </dl>

          <h3>{t("Eylemlere göre")}</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">{t("Eylemlere göre işlem sayısı ve tahmini maliyet")}</caption>
              <thead><tr><th scope="col">{t("Eylem")}</th><th scope="col" className="sayi">{t("İşlem")}</th><th scope="col" className="sayi">{t("Birim")}</th><th scope="col" className="sayi">{t("Tahmini maliyet")}</th></tr></thead>
              <tbody>
                {k.by_action.map((a) => (
                  <tr key={a.action}><th scope="row">{ea(a.action)}</th><td className="sayi">{sy(a.calls)}</td><td className="sayi">{sy(a.units)}</td><td className="sayi">{us(a.est_cost)}</td></tr>
                ))}
                {k.by_action.length === 0 && <tr><td colSpan={4}>{t("Bu aralıkta işlem yok.")}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="hint">{t("Birim: özet/test için belge karakteri, soru için modele giden istem karakteri, sesli okuma için karakter, yükleme için bayt. Soru-cevap birimi bu sürümden itibaren istem uzunluğudur; daha eski kayıtlarda yalnızca soru uzunluğudur, bu yüzden eski soru maliyetleri olduğundan düşük görünür.")}</p>

          <h3>{t("Günlük tahmini maliyet")}</h3>
          {k.daily.length === 0 ? <p>{t("Bu aralıkta veri yok.")}</p> : (
            <figure style={{ margin: 0 }}>
              <div className="bars" aria-hidden="true">
                {k.daily.map((d) => (
                  <div key={d.day} className="bar" title={`${d.day}: ${us(d.est_cost)}`}
                    style={{ height: `${enYuksek > 0 ? Math.max(3, (d.est_cost / enYuksek) * 100) : 3}%` }} />
                ))}
              </div>
              <figcaption className="hint">{t("En yüksek gün: {tutar}. Ayrıntılar aşağıdaki tabloda.", { tutar: us(enYuksek) })}</figcaption>
            </figure>
          )}
          <details>
            <summary>{t("Günlük döküm tablosu")}</summary>
            <div className="tbl-wrap">
              <table className="tbl">
                <caption className="sr-only">{t("Gün ve eylem bazında kullanım")}</caption>
                <thead><tr><th scope="col">{t("Gün")}</th><th scope="col">{t("Eylem")}</th><th scope="col" className="sayi">{t("İşlem")}</th><th scope="col" className="sayi">{t("Kullanıcı")}</th><th scope="col" className="sayi">{t("Tahmini maliyet")}</th></tr></thead>
                <tbody>
                  {k.rows.map((r, i) => (
                    <tr key={`${r.day}-${r.action}-${i}`}><th scope="row">{r.day}</th><td>{ea(r.action)}</td><td className="sayi">{sy(r.calls)}</td><td className="sayi">{sy(r.users)}</td><td className="sayi">{us(r.est_cost)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn sec" disabled={k.rows.length === 0}
              onClick={() => csvIndir(`${t("kullanim")}-${t("son-{n}-gun", { n: k.days })}.csv`, [t("Gün"), t("Eylem"), t("İşlem"), t("Birim"), t("Kullanıcı"), t("Tahmini maliyet (USD)")],
                k.rows.map((r) => [r.day, ea(r.action), r.calls, r.units, r.users, r.est_cost]))}>
              {t("Günlük dökümü CSV indir")}
            </button>
          </div>

          <h3>{t("En çok kullanan hesaplar")}</h3>
          {!uk || uk.items.length === 0 ? <p>{t("Bu aralıkta veri yok.")}</p> : (
            <>
              <div className="tbl-wrap">
                <table className="tbl">
                  <caption className="sr-only">{t("Tahmini maliyete göre en çok kullanan hesaplar")}</caption>
                  <thead><tr><th scope="col">{t("Hesap")}</th><th scope="col" className="sayi">{t("İşlem")}</th><th scope="col">{t("Eylemler")}</th><th scope="col" className="sayi">{t("Tahmini maliyet")}</th></tr></thead>
                  <tbody>
                    {uk.items.map((u) => (
                      <tr key={u.user_id}>
                        <th scope="row">{u.email ?? u.user_id}</th><td className="sayi">{sy(u.calls)}</td>
                        <td>{Object.entries(u.by_action).map(([a, n]) => `${ea(a)}: ${sy(n)}`).join(" · ")}</td>
                        <td className="sayi">{us(u.est_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button type="button" className="btn sec"
                  onClick={() => csvIndir(`${t("kullanicilar")}-${t("son-{n}-gun", { n: uk.days })}.csv`, [t("Hesap"), t("İşlem"), t("Tahmini maliyet (USD)")],
                    uk.items.map((u) => [u.email ?? u.user_id, u.calls, u.est_cost]))}>
                  {t("Hesap dökümünü CSV indir")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
