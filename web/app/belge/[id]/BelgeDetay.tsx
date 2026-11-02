"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, hataMesaji, DURUM, type Belge } from "@/lib/api";
import { vurguIsaretle } from "@/lib/vurgu";
import { BOLUMLER, BOLUM_IDLERI, type BolumId } from "@/lib/bolumler";
import { useSesKomutlari, useSesMetin } from "@/lib/ses/useSesKomutlari";
import { dikteIste, onayIste } from "@/lib/ses/kayit";
import { testIstegi } from "@/lib/ses/komutlar";
import { istekBirak } from "@/lib/ses/bolumGecis";
import { kindAd, sayfaYazi, uzantisiz } from "@/lib/belgeTuru";
import { useBelgeBilgi } from "../../components/BelgeBaglam";
import { useLang } from "@/lib/i18n/client";
import { sayiYaz, type Lang } from "@/lib/i18n/core";
import Ozetleme from "./Ozetleme";
import Oynatici from "./Oynatici";
import SoruCevap from "./SoruCevap";
import Quiz from "./Quiz";
import Notlar from "./Notlar";
import Kartlar from "./Kartlar";
import YerImleri from "./YerImleri";
import VurguluMetin from "./VurguluMetin";

function boyutYazi(lang: Lang, b?: number | null) {
  if (!b) return "";
  return b >= 1048576
    ? `${sayiYaz(lang, b / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}


export default function BelgeDetay({ id }: { id: string }) {
  const { lang, t } = useLang();
  const router = useRouter();
  const sp = useSearchParams();
  const istenen = sp?.get("b") ?? "";
  const bolum = (BOLUM_IDLERI.includes(istenen) ? istenen : "ozet") as BolumId;
  const kParam = sp?.get("k");
  const hedef = kParam != null && /^\d+$/.test(kParam) ? Number(kParam) : null;
  const { ayarla } = useBelgeBilgi();

  const [doc, setDoc] = useState<Belge | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/documents/${id}`);
      if (r.status === 404) {
        try { if (localStorage.getItem("sonBelge") === id) localStorage.removeItem("sonBelge"); } catch {}
        return setError(t("Belge bulunamadı."));
      }
      if (!r.ok) return setError(await hataMesaji(r, t("Belge yüklenemedi.")));
      setDoc(await r.json());
    } catch {
      setError(t("Sunucuya ulaşılamadı."));
    }
  }, [id, t]);   // t değişince (dil değişince) belge yeniden alınır: not/hata iletileri sunucuda çevrilir

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (doc?.status !== "processing") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [doc, load]);

  // Üst çubuktaki belge etiketi + sol menünün "son belge" bilgisi
  useEffect(() => {
    if (!doc) return;
    const parcalar = [sayfaYazi(t, doc), boyutYazi(lang, doc.size_bytes)].filter(Boolean);
    ayarla({ baslik: doc.title, ayrinti: parcalar.join(" • ") });
    try { localStorage.setItem("sonBelge", id); } catch {}
  }, [doc, id, ayarla, t, lang]);
  useEffect(() => () => ayarla(null), [ayarla]);

  // ---- Sesli komutlar ----
  // Bölümlere geçiş (ör. "notlarım", "teste git"). Her bölümün kendi komutları (özetle, şık seç, soru sor…) o bölüm açıkken bağlanır.
  const git = (b: BolumId) => { router.push(`/belge/${id}?b=${b}`); return true; };
  useSesKomutlari({
    "bolum.soru": () => git("soru"),
    "bolum.ozet": () => git("ozet"),
    "bolum.test": () => git("test"),
    "bolum.dinle": () => git("dinle"),
    "bolum.metin": () => git("metin"),
    "bolum.notlar": () => git("notlar"),
    "bolum.kartlar": () => git("kartlar"),
    "bolum.imler": () => git("imler"),
    "belge.sil": () => { onayIste(t("Bu belge silinsin mi? Evet ya da hayır deyin."), () => sil(true)); },
    // Başka bölümdeyken de çalışsın: ilgili bölüme geçip işi orada başlatır (bölümde zaten açıksa bölümün kendi işleyicisi çalışır)
    ...(bolum !== "test" ? { "test.olustur": () => { istekBirak(id, { tur: "test" }); git("test"); } } : {}),
    ...(bolum !== "soru" ? {
      "soru.sor": () => {
        dikteIste({
          istem: t("Sorunuzu söyleyin."),
          uygula: (m) => { istekBirak(id, { tur: "soru", metin: m }); git("soru"); },
        });
      },
    } : {}),
  });
  // "10 soruluk zor test oluştur" başka bölümdeyken de anlaşılsın
  useSesMetin((metin) => {
    if (bolum === "test") return false;                // test bölümünde Quiz kendisi karşılar
    const p = testIstegi(metin, lang);
    if (!p) return false;
    istekBirak(id, { tur: "test", adet: p.adet, zorluk: p.zorluk });
    git("test");
    return true;
  });

  async function sil(onayli = false) {
    if (!onayli && !window.confirm(t("Bu belge silinsin mi? Bu işlem geri alınamaz."))) return;
    const r = await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
    if (r.ok) {
      try { if (localStorage.getItem("sonBelge") === id) localStorage.removeItem("sonBelge"); } catch {}
      router.replace("/");
    } else setError(await hataMesaji(r, t("Belge silinemedi.")));
  }

  if (error) return <div><p className="msg err" role="alert">{error}</p><p><Link href="/">← {t("Ana sayfaya dön")}</Link></p></div>;
  if (!doc) return <p>{t("Yükleniyor…")}</p>;

  const bolumAd = t(BOLUMLER.find((b) => b.id === bolum)?.ad ?? "");
  return (
    <div className="belge-sayfa">
      <nav aria-label={t("Konum")} className="kirinti">
        <Link href="/">{t("Çalışma Alanı")}</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{bolumAd}</span>
      </nav>
      <h1 className="belge-baslik">{doc.title}</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        {kindAd(doc.kind)}
        {doc.page_count ? ` · ${sayfaYazi(t, doc)}` : ""}
        {doc.char_count ? ` · ${t("{n} karakter", { n: sayiYaz(lang, doc.char_count) })}` : ""}
        {" · "}<span className={`badge ${doc.status}`}>{t(DURUM[doc.status])}</span>
      </p>
      <div role="status" aria-live="polite">
        {doc.status === "processing" && <p className="msg ok">{t("Belge işleniyor, bu sayfa otomatik güncellenir…")}</p>}
      </div>
      {doc.status === "failed" && <p className="msg err" role="alert">{doc.error}</p>}
      {doc.note && doc.status === "ready" && <p className="msg warn">{doc.note}</p>}

      {doc.status === "ready" && (
        <>
          {bolum === "soru" && <SoruCevap docId={id} />}
          {bolum === "ozet" && <Ozetleme docId={id} baslik={doc.title} />}
          {bolum === "test" && <Quiz docId={id} />}
          {(bolum === "dinle" || bolum === "metin") && <MetinPaneli key={bolum} id={id} doc={doc} mod={bolum} hedef={hedef} />}
          {bolum === "notlar" && <Notlar docId={id} />}
          {bolum === "kartlar" && <Kartlar docId={id} />}
          {bolum === "imler" && <YerImleri docId={id} />}
        </>
      )}
      <p style={{ marginTop: 24 }}><button type="button" className="btn danger" style={{ width: "auto" }} onClick={() => sil()}>{t("Belgeyi sil")}</button></p>
    </div>
  );
}

// "Sesli Okuma" ve "Çıkarılan Metin" bölümleri aynı metin kutusunu paylaşır:
// dinlerken okunan kelime işaretlenir; metin bölümünde bir kelime seçilip yer imi eklenebilir.
function MetinPaneli({ id, doc, mod, hedef }: { id: string; doc: Belge; mod: "dinle" | "metin"; hedef: number | null }) {
  const { lang, t } = useLang();
  const metinKap = useRef<HTMLDivElement>(null);
  const onceki = useRef(-1);
  // Slayt işareti çıkarmada [Slayt n] olarak saklanır; İngilizce arayüzde [Slide n] gösterilir (kelime sayısı aynı kalır → yer imi sıraları bozulmaz)
  const gosterilenMetin = useMemo(() => (lang === "en" ? (doc.text_preview ?? "").replace(/\[Slayt (\d+)\]/g, "[Slide $1]") : (doc.text_preview ?? "")), [doc.text_preview, lang]);
  const kelimeler = useMemo(() => gosterilenMetin.split(/\s+/).filter(Boolean), [gosterilenMetin]);
  const isaretle = useCallback((i: number) => {
    vurguIsaretle(metinKap.current, onceki.current, i);
    onceki.current = i;
  }, []);

  const [secili, setSecili] = useState<number | null>(null);   // 0 tabanlı kelime sırası
  const [etiket, setEtiket] = useState("");
  const [kaydediyor, setKaydediyor] = useState(false);
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");

  const ozet = useCallback((i: number) => kelimeler.slice(i, i + 6).join(" ").slice(0, 60), [kelimeler]);

  function sec(i: number) {
    setSecili(i);
    setEtiket(ozet(i));
    setHata("");
    setDurum(t("Seçilen yer: kelime {n}, “{kelime}”.", { n: i + 1, kelime: kelimeler[i] ?? "" }));
  }

  // Seçili kelimeyi metin üzerinde işaretle (VurguluMetin memo olduğundan sınıf doğrudan DOM'da değiştirilir)
  useEffect(() => {
    const kap = metinKap.current;
    if (!kap) return;
    kap.querySelectorAll(".k.sec").forEach((e) => e.classList.remove("sec"));
    if (secili !== null) kap.querySelector(`[data-w="${secili}"]`)?.classList.add("sec");
  }, [secili]);

  // Yer imi bağlantısından gelindiyse o kelimeye git
  useEffect(() => {
    if (mod !== "metin" || hedef === null) return;
    if (hedef >= kelimeler.length) { setHata(t("Bu yer imi, ekranda gösterilen metin bölümünün dışında kalıyor.")); return; }
    setSecili(hedef);
    setEtiket(ozet(hedef));
    metinKap.current?.querySelector<HTMLElement>(`[data-w="${hedef}"]`)?.scrollIntoView({ block: "center", behavior: "auto" });
    setDurum(t("Yer imine gidildi: “{metin}”.", { metin: kelimeler.slice(hedef, hedef + 8).join(" ") }));
  }, [mod, hedef, kelimeler, ozet, t]);

  function tikla(e: React.MouseEvent) {
    if (mod !== "metin") return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-w]");
    const n = el ? Number(el.dataset.w) : NaN;
    if (Number.isInteger(n)) sec(n);
  }

  async function yerImiEkle(e: React.FormEvent) {
    e.preventDefault();
    if (secili === null || !etiket.trim() || kaydediyor) return;
    setHata(""); setDurum(""); setKaydediyor(true);
    try {
      const r = await apiFetch(`/api/documents/${id}/bookmarks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: etiket.trim(), word_index: secili, snippet: kelimeler.slice(secili, secili + 25).join(" ").slice(0, 200) }),
      });
      if (!r.ok) setHata(await hataMesaji(r, t("Yer imi eklenemedi.")));
      else setDurum(t("Yer imi eklendi. Yer İmleri bölümünden ulaşabilirsiniz."));
    } catch { setHata(t("Sunucuya ulaşılamadı.")); }
    setKaydediyor(false);
  }

  const uzun = doc.truncated || (doc.char_count ?? 0) > (doc.text_preview?.length ?? 0);
  const baslikId = mod === "dinle" ? "dinle-baslik" : "metin-baslik";
  return (
    <section aria-labelledby={baslikId} className="panel">
      <h2 id={baslikId} className="panel-h">{mod === "dinle" ? t("Sesli Okuma") : t("Çıkarılan Metin")}</h2>
      <p className="panel-alt">
        {mod === "dinle"
          ? t("Belgenin metnini sesli dinleyin; okunan kelime aşağıdaki metinde işaretlenir.")
          : t("Belgeden çıkarılan metin. Bir kelimeye tıklayarak o yere yer imi ekleyebilirsiniz.")}
      </p>

      {mod === "dinle" && (
        <>
          <Oynatici key={`metin-${lang}`} docId={id} source="text" etiket={t("Sesli okuma")}
            gorunen={kelimeler} onAktif={isaretle}
            dosyaAdi={`${uzantisiz(doc.title)} - ${t("metin")}.mp3`} indirilebilir={(doc.char_count ?? 0) <= 60000} />
          <p className="hint">{t("Metnin tamamını dinlemek günlük sesli okuma kotanızdan düşer; özeti dinlemek çok daha kısadır.")}</p>
        </>
      )}

      {mod === "metin" && (
        <form onSubmit={yerImiEkle} className="alt-kart" aria-labelledby="yer-imi-baslik">
          <h3 id="yer-imi-baslik" className="liste-baslik" style={{ marginTop: 0 }}>{t("Yer imi ekle")}</h3>
          <div className="iki-sutun">
            <div>
              <label htmlFor="yi-sira">{t("Kelime sırası (1–{n})", { n: kelimeler.length })}</label>
              <input id="yi-sira" type="number" min={1} max={Math.max(1, kelimeler.length)} value={secili === null ? "" : secili + 1}
                onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= kelimeler.length) sec(n - 1); }} />
              <p className="hint">{t("Metinde bir kelimeye tıklayın ya da sırasını yazın.")}</p>
            </div>
            <div>
              <label htmlFor="yi-ad">{t("Yer imi adı")}</label>
              <input id="yi-ad" type="text" value={etiket} onChange={(e) => setEtiket(e.target.value)} maxLength={120} disabled={secili === null} />
            </div>
          </div>
          <button type="submit" className="btn" style={{ width: "auto" }} disabled={secili === null || !etiket.trim() || kaydediyor}>{t("Yer imi ekle")}</button>
        </form>
      )}

      <div role="status" aria-live="polite">{durum && <p className="msg ok">{durum}</p>}</div>
      <div role="alert">{hata && <p className="msg err">{hata}</p>}</div>

      <div className={"doctext" + (mod === "metin" ? " tiklanir" : "")} ref={metinKap} tabIndex={0} role="region" onClick={tikla}
        aria-label={t("Çıkarılan metin (okumak için ok tuşlarını kullanın)")}>
        <VurguluMetin text={gosterilenMetin} />
      </div>
      {uzun && <p className="hint">{t("Burada metnin yalnızca ilk bölümü gösteriliyor. Özetleme ve sesli okuma tüm metni kullanacak; kelime vurgusu ve yer imleri yalnızca burada gösterilen bölümde çalışır.")}</p>}
    </section>
  );
}
