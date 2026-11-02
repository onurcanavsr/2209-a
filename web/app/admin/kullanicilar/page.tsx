"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { DENETIM_AD, sayi, tarih, tarihSaat, type DenetimKaydi, type KullaniciListesi } from "@/lib/admin";
import { useLang } from "@/lib/i18n/client";

const SAYFA_BOYUTU = 20;

export default function Kullanicilar() {
  const { lang, t } = useLang();
  const sy = (n: number) => sayi(n, lang);
  const [benimId, setBenimId] = useState("");
  const [girdi, setGirdi] = useState("");
  const [q, setQ] = useState("");
  const [sayfa, setSayfa] = useState(1);
  const [liste, setListe] = useState<KullaniciListesi | null>(null);
  const [denetim, setDenetim] = useState<DenetimKaydi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");
  const [durum, setDurum] = useState("");

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata("");
    try {
      const p = new URLSearchParams({ page: String(sayfa), page_size: String(SAYFA_BOYUTU) });
      if (q) p.set("q", q);
      const [r, a] = await Promise.all([apiFetch(`/api/admin/users?${p}`), apiFetch("/api/admin/audit?limit=20")]);
      if (!r.ok) { setHata(await hataMesaji(r, t("Kullanıcılar alınamadı."))); setYukleniyor(false); return; }
      setListe(await r.json());
      if (a.ok) setDenetim(await a.json());
    } catch { setHata(t("Sunucuya ulaşılamadı.")); }
    setYukleniyor(false);
  }, [q, sayfa, t]);

  useEffect(() => { yukle(); }, [yukle]);
  useEffect(() => {
    (async () => { try { const r = await apiFetch("/api/me"); if (r.ok) setBenimId((await r.json()).id); } catch {} })();
  }, []);

  async function islem(yol: string, init: RequestInit, basari: string, hataVarsayilan: string) {
    setMesgul(true); setHata(""); setDurum("");
    try {
      const r = await apiFetch(yol, init);
      if (!r.ok) { setHata(await hataMesaji(r, hataVarsayilan)); setMesgul(false); return; }
      let ek = "";
      if (r.status !== 204) {
        const j = await r.json().catch(() => ({}));
        if (j.ban_synced === false) ek = " " + t("Uyarı: Supabase tarafındaki yasaklama eşitlenemedi; API erişimi yine de kesildi.");
      }
      setDurum(basari + ek);
      await yukle();
    } catch { setHata(t("Sunucuya ulaşılamadı.")); }
    setMesgul(false);
  }

  const json = { "Content-Type": "application/json" };
  const durumDegistir = (id: string, email: string, etkin: boolean) => {
    if (!etkin && !window.confirm(t("{email} hesabı devre dışı bırakılsın mı? Kullanıcı giriş yapamaz ve mevcut oturumu da kapanır; verileri silinmez.", { email }))) return;
    islem(`/api/admin/users/${id}/status`, { method: "PUT", headers: json, body: JSON.stringify({ is_active: etkin }) },
      etkin ? t("{email} etkinleştirildi.", { email }) : t("{email} devre dışı bırakıldı.", { email }), t("Durum değiştirilemedi."));
  };
  const rolDegistir = (id: string, email: string, rol: "student" | "admin") => {
    const soru = rol === "admin" ? t("{email} yönetici yapılsın mı? Yeni rol, kullanıcının oturumunu yenilemesiyle tam geçerli olur.", { email })
      : t("{email} yöneticilikten çıkarılsın mı? Yeni rol, kullanıcının oturumunu yenilemesiyle tam geçerli olur.", { email });
    if (!window.confirm(soru)) return;
    islem(`/api/admin/users/${id}/role`, { method: "PUT", headers: json, body: JSON.stringify({ role: rol }) },
      t("{email}: rol {rol} olarak güncellendi.", { email, rol: rol === "admin" ? t("yönetici") : t("öğrenci") }), t("Rol değiştirilemedi."));
  };
  const sil = (id: string, email: string) => {
    if (!window.confirm(t("{email} hesabı ve TÜM verileri (belgeler, özetler, testler, ses dosyaları) kalıcı olarak silinsin mi? Bu işlem geri alınamaz.", { email }))) return;
    islem(`/api/admin/users/${id}`, { method: "DELETE" }, t("{email} silindi.", { email }), t("Hesap silinemedi."));
  };

  const toplamSayfa = liste ? Math.max(1, Math.ceil(liste.total / liste.page_size)) : 1;

  return (
    <section aria-labelledby="kb">
      <h2 id="kb">{t("Kullanıcılar")}</h2>
      <form onSubmit={(e) => { e.preventDefault(); setSayfa(1); setQ(girdi.trim()); }} role="search" className="row">
        <label htmlFor="ara" className="sr-only">{t("E-posta ile ara")}</label>
        <input id="ara" type="search" value={girdi} maxLength={100} placeholder={t("E-posta ile ara")} onChange={(e) => setGirdi(e.target.value)} />
        <button type="submit" className="btn" style={{ width: "auto", margin: 0 }}>{t("Ara")}</button>
        {q && <button type="button" className="btn sec" onClick={() => { setGirdi(""); setQ(""); setSayfa(1); }}>{t("Aramayı temizle")}</button>}
      </form>

      <div role="status" aria-live="polite">{durum && <p className="msg ok">{durum}</p>}</div>
      <div role="alert" aria-live="assertive">{hata && <p className="msg err">{hata}</p>}</div>

      {yukleniyor && !liste && <p role="status">{t("Yükleniyor…")}</p>}
      {liste && (
        <>
          <p className="hint">{t("{n} kullanıcı", { n: sy(liste.total) })}{q ? ` (${t("“{q}” araması", { q })})` : ""} · {t("Sayfa {i} / {n}", { i: liste.page, n: toplamSayfa })}</p>
          <div className="tbl-wrap" aria-busy={yukleniyor}>
            <table className="tbl">
              <caption className="sr-only">{t("Kullanıcı listesi")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("E-posta")}</th><th scope="col">{t("Rol")}</th><th scope="col">{t("Durum")}</th>
                  <th scope="col" className="sayi">{t("Belge")}</th><th scope="col">{t("Son etkinlik")}</th><th scope="col">{t("Kayıt")}</th><th scope="col">{t("İşlemler")}</th>
                </tr>
              </thead>
              <tbody>
                {liste.items.map((u) => {
                  const ben = u.id === benimId;
                  const email = u.email ?? u.id;
                  const yonetici = u.role === "admin";
                  return (
                    <tr key={u.id}>
                      <th scope="row">{email}{ben && <span className="rozet"> ({t("siz")})</span>}</th>
                      <td>{yonetici ? t("Yönetici") : t("Öğrenci")}</td>
                      <td><span className={u.is_active ? "rozet ok" : "rozet err"}>{u.is_active ? t("Etkin") : t("Devre dışı")}</span></td>
                      <td className="sayi">{sy(u.doc_count)}</td>
                      <td>{tarihSaat(u.last_activity, lang)}</td>
                      <td>{tarih(u.created_at, lang)}</td>
                      <td>
                        {ben ? <span className="hint">{t("Kendi hesabınız")}</span> : (
                          <div className="row" style={{ gap: 6 }}>
                            {!yonetici && (
                              <button type="button" className="btn sec" disabled={mesgul} onClick={() => durumDegistir(u.id, email, !u.is_active)}
                                aria-label={u.is_active ? t("{email} hesabını devre dışı bırak", { email }) : t("{email} hesabını etkinleştir", { email })}>
                                {u.is_active ? t("Devre dışı bırak") : t("Etkinleştir")}
                              </button>
                            )}
                            <button type="button" className="btn sec" disabled={mesgul || (!yonetici && !u.is_active)}
                              onClick={() => rolDegistir(u.id, email, yonetici ? "student" : "admin")}
                              aria-label={yonetici ? t("{email} için yöneticiliği kaldır", { email }) : t("{email} için yönetici yap", { email })}>
                              {yonetici ? t("Yöneticiliği kaldır") : t("Yönetici yap")}
                            </button>
                            {!yonetici && (
                              <button type="button" className="btn danger" style={{ width: "auto" }} disabled={mesgul}
                                onClick={() => sil(u.id, email)} aria-label={t("{email} hesabını sil", { email })}>{t("Sil")}</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {liste.items.length === 0 && <tr><td colSpan={7}>{t("Kullanıcı bulunamadı.")}</td></tr>}
              </tbody>
            </table>
          </div>
          <nav aria-label={t("Sayfalama")} className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn sec" disabled={sayfa <= 1 || yukleniyor} onClick={() => setSayfa((p) => p - 1)}>← {t("Önceki")}</button>
            <span>{t("Sayfa {i} / {n}", { i: liste.page, n: toplamSayfa })}</span>
            <button type="button" className="btn sec" disabled={sayfa >= toplamSayfa || yukleniyor} onClick={() => setSayfa((p) => p + 1)}>{t("Sonraki")} →</button>
          </nav>
        </>
      )}

      <h3 style={{ marginTop: 28 }}>{t("Son yönetici işlemleri")}</h3>
      {denetim.length === 0 ? <p className="hint">{t("Henüz kayıt yok.")}</p> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">{t("Son yönetici işlemleri")}</caption>
            <thead><tr><th scope="col">{t("Zaman")}</th><th scope="col">{t("Yönetici")}</th><th scope="col">{t("İşlem")}</th><th scope="col">{t("Hesap")}</th></tr></thead>
            <tbody>
              {denetim.map((d) => (
                <tr key={d.id}>
                  <td>{tarihSaat(d.created_at, lang)}</td><td>{d.admin_email ?? "—"}</td>
                  <td>{t(DENETIM_AD[d.action] ?? d.action)}{d.action === "rol_degistir" && d.detail ? ` (${String(d.detail.eski)} → ${String(d.detail.yeni)})` : ""}</td>
                  <td>{d.target_email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
