"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { DENETIM_AD, sayi, tarih, tarihSaat, type DenetimKaydi, type KullaniciListesi } from "@/lib/admin";

const SAYFA_BOYUTU = 20;

export default function Kullanicilar() {
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
      if (!r.ok) { setHata(await hataMesaji(r, "Kullanıcılar alınamadı.")); setYukleniyor(false); return; }
      setListe(await r.json());
      if (a.ok) setDenetim(await a.json());
    } catch { setHata("Sunucuya ulaşılamadı."); }
    setYukleniyor(false);
  }, [q, sayfa]);

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
        if (j.ban_synced === false) ek = " Uyarı: Supabase tarafındaki yasaklama eşitlenemedi; API erişimi yine de kesildi.";
      }
      setDurum(basari + ek);
      await yukle();
    } catch { setHata("Sunucuya ulaşılamadı."); }
    setMesgul(false);
  }

  const json = { "Content-Type": "application/json" };
  const durumDegistir = (id: string, email: string, etkin: boolean) => {
    if (!etkin && !window.confirm(`${email} hesabı devre dışı bırakılsın mı? Kullanıcı giriş yapamaz ve mevcut oturumu da kapanır; verileri silinmez.`)) return;
    islem(`/api/admin/users/${id}/status`, { method: "PUT", headers: json, body: JSON.stringify({ is_active: etkin }) },
      etkin ? `${email} etkinleştirildi.` : `${email} devre dışı bırakıldı.`, "Durum değiştirilemedi.");
  };
  const rolDegistir = (id: string, email: string, rol: "student" | "admin") => {
    const ad = rol === "admin" ? "yönetici yapılsın" : "yöneticilikten çıkarılsın";
    if (!window.confirm(`${email} ${ad} mı? Yeni rol, kullanıcının oturumunu yenilemesiyle tam geçerli olur.`)) return;
    islem(`/api/admin/users/${id}/role`, { method: "PUT", headers: json, body: JSON.stringify({ role: rol }) },
      `${email}: rol ${rol === "admin" ? "yönetici" : "öğrenci"} olarak güncellendi.`, "Rol değiştirilemedi.");
  };
  const sil = (id: string, email: string) => {
    if (!window.confirm(`${email} hesabı ve TÜM verileri (belgeler, özetler, testler, ses dosyaları) kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;
    islem(`/api/admin/users/${id}`, { method: "DELETE" }, `${email} silindi.`, "Hesap silinemedi.");
  };

  const toplamSayfa = liste ? Math.max(1, Math.ceil(liste.total / liste.page_size)) : 1;

  return (
    <section aria-labelledby="kb">
      <h2 id="kb">Kullanıcılar</h2>
      <form onSubmit={(e) => { e.preventDefault(); setSayfa(1); setQ(girdi.trim()); }} role="search" className="row">
        <label htmlFor="ara" className="sr-only">E-posta ile ara</label>
        <input id="ara" type="search" value={girdi} maxLength={100} placeholder="E-posta ile ara" onChange={(e) => setGirdi(e.target.value)} />
        <button type="submit" className="btn" style={{ width: "auto", margin: 0 }}>Ara</button>
        {q && <button type="button" className="btn sec" onClick={() => { setGirdi(""); setQ(""); setSayfa(1); }}>Aramayı temizle</button>}
      </form>

      <div role="status" aria-live="polite">{durum && <p className="msg ok">{durum}</p>}</div>
      <div role="alert" aria-live="assertive">{hata && <p className="msg err">{hata}</p>}</div>

      {yukleniyor && !liste && <p role="status">Yükleniyor…</p>}
      {liste && (
        <>
          <p className="hint">{sayi(liste.total)} kullanıcı{q ? ` (“${q}” araması)` : ""} · Sayfa {liste.page} / {toplamSayfa}</p>
          <div className="tbl-wrap" aria-busy={yukleniyor}>
            <table className="tbl">
              <caption className="sr-only">Kullanıcı listesi</caption>
              <thead>
                <tr>
                  <th scope="col">E-posta</th><th scope="col">Rol</th><th scope="col">Durum</th>
                  <th scope="col" className="sayi">Belge</th><th scope="col">Son etkinlik</th><th scope="col">Kayıt</th><th scope="col">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {liste.items.map((u) => {
                  const ben = u.id === benimId;
                  const email = u.email ?? u.id;
                  const yonetici = u.role === "admin";
                  return (
                    <tr key={u.id}>
                      <th scope="row">{email}{ben && <span className="rozet"> (siz)</span>}</th>
                      <td>{yonetici ? "Yönetici" : "Öğrenci"}</td>
                      <td><span className={u.is_active ? "rozet ok" : "rozet err"}>{u.is_active ? "Etkin" : "Devre dışı"}</span></td>
                      <td className="sayi">{sayi(u.doc_count)}</td>
                      <td>{tarihSaat(u.last_activity)}</td>
                      <td>{tarih(u.created_at)}</td>
                      <td>
                        {ben ? <span className="hint">Kendi hesabınız</span> : (
                          <div className="row" style={{ gap: 6 }}>
                            {!yonetici && (
                              <button type="button" className="btn sec" disabled={mesgul} onClick={() => durumDegistir(u.id, email, !u.is_active)}
                                aria-label={`${email} hesabını ${u.is_active ? "devre dışı bırak" : "etkinleştir"}`}>
                                {u.is_active ? "Devre dışı bırak" : "Etkinleştir"}
                              </button>
                            )}
                            <button type="button" className="btn sec" disabled={mesgul || (!yonetici && !u.is_active)}
                              onClick={() => rolDegistir(u.id, email, yonetici ? "student" : "admin")}
                              aria-label={`${email} için ${yonetici ? "yöneticiliği kaldır" : "yönetici yap"}`}>
                              {yonetici ? "Yöneticiliği kaldır" : "Yönetici yap"}
                            </button>
                            {!yonetici && (
                              <button type="button" className="btn danger" style={{ width: "auto" }} disabled={mesgul}
                                onClick={() => sil(u.id, email)} aria-label={`${email} hesabını sil`}>Sil</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {liste.items.length === 0 && <tr><td colSpan={7}>Kullanıcı bulunamadı.</td></tr>}
              </tbody>
            </table>
          </div>
          <nav aria-label="Sayfalama" className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn sec" disabled={sayfa <= 1 || yukleniyor} onClick={() => setSayfa((p) => p - 1)}>← Önceki</button>
            <span>Sayfa {liste.page} / {toplamSayfa}</span>
            <button type="button" className="btn sec" disabled={sayfa >= toplamSayfa || yukleniyor} onClick={() => setSayfa((p) => p + 1)}>Sonraki →</button>
          </nav>
        </>
      )}

      <h3 style={{ marginTop: 28 }}>Son yönetici işlemleri</h3>
      {denetim.length === 0 ? <p className="hint">Henüz kayıt yok.</p> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Son yönetici işlemleri</caption>
            <thead><tr><th scope="col">Zaman</th><th scope="col">Yönetici</th><th scope="col">İşlem</th><th scope="col">Hesap</th></tr></thead>
            <tbody>
              {denetim.map((d) => (
                <tr key={d.id}>
                  <td>{tarihSaat(d.created_at)}</td><td>{d.admin_email ?? "—"}</td>
                  <td>{DENETIM_AD[d.action] ?? d.action}{d.action === "rol_degistir" && d.detail ? ` (${String(d.detail.eski)} → ${String(d.detail.yeni)})` : ""}</td>
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
