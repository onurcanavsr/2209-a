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
import { kindAd, uzantisiz } from "@/lib/belgeTuru";
import { useBelgeBilgi } from "../../components/BelgeBaglam";
import Ozetleme from "./Ozetleme";
import Oynatici from "./Oynatici";
import SoruCevap from "./SoruCevap";
import Quiz from "./Quiz";
import Notlar from "./Notlar";
import Kartlar from "./Kartlar";
import YerImleri from "./YerImleri";
import VurguluMetin from "./VurguluMetin";

function boyutYazi(b?: number | null) {
  if (!b) return "";
  return b >= 1048576
    ? `${(b / 1048576).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export default function BelgeDetay({ id }: { id: string }) {
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
        return setError("Belge bulunamadı.");
      }
      if (!r.ok) return setError(await hataMesaji(r, "Belge yüklenemedi."));
      setDoc(await r.json());
    } catch {
      setError("Sunucuya ulaşılamadı.");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (doc?.status !== "processing") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [doc, load]);

  // Üst çubuktaki belge etiketi + sol menünün "son belge" bilgisi
  useEffect(() => {
    if (!doc) return;
    const parcalar = [
      doc.page_count ? `${doc.page_count} ${doc.kind === "pptx" ? "slayt" : "sayfa"}` : "",
      boyutYazi(doc.size_bytes),
    ].filter(Boolean);
    ayarla({ baslik: doc.title, ayrinti: parcalar.join(" • ") });
    try { localStorage.setItem("sonBelge", id); } catch {}
  }, [doc, id, ayarla]);
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
    "belge.sil": () => { onayIste("Bu belge silinsin mi? Evet ya da hayır deyin.", () => sil(true)); },
    // Başka bölümdeyken de çalışsın: ilgili bölüme geçip işi orada başlatır (bölümde zaten açıksa bölümün kendi işleyicisi çalışır)
    ...(bolum !== "test" ? { "test.olustur": () => { istekBirak(id, { tur: "test" }); git("test"); } } : {}),
    ...(bolum !== "soru" ? {
      "soru.sor": () => {
        dikteIste({
          istem: "Sorunuzu söyleyin.",
          uygula: (m) => { istekBirak(id, { tur: "soru", metin: m }); git("soru"); },
        });
      },
    } : {}),
  });
  // "10 soruluk zor test oluştur" başka bölümdeyken de anlaşılsın
  useSesMetin((metin) => {
    if (bolum === "test") return false;                // test bölümünde Quiz kendisi karşılar
    const p = testIstegi(metin);
    if (!p) return false;
    istekBirak(id, { tur: "test", adet: p.adet, zorluk: p.zorluk });
    git("test");
    return true;
  });

  async function sil(onayli = false) {
    if (!onayli && !window.confirm("Bu belge silinsin mi? Bu işlem geri alınamaz.")) return;
    const r = await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
    if (r.ok) {
      try { if (localStorage.getItem("sonBelge") === id) localStorage.removeItem("sonBelge"); } catch {}
      router.replace("/");
    } else setError(await hataMesaji(r, "Belge silinemedi."));
  }

  if (error) return <div><p className="msg err" role="alert">{error}</p><p><Link href="/">← Ana sayfaya dön</Link></p></div>;
  if (!doc) return <p>Yükleniyor…</p>;

  const bolumAd = BOLUMLER.find((b) => b.id === bolum)?.ad ?? "";
  return (
    <div className="belge-sayfa">
      <nav aria-label="Konum" className="kirinti">
        <Link href="/">Çalışma Alanı</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{bolumAd}</span>
      </nav>
      <h1 className="belge-baslik">{doc.title}</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        {kindAd(doc.kind)}
        {doc.page_count ? ` · ${doc.page_count} ${doc.kind === "pptx" ? "slayt" : "sayfa"}` : ""}
        {doc.char_count ? ` · ${doc.char_count.toLocaleString("tr-TR")} karakter` : ""}
        {" · "}<span className={`badge ${doc.status}`}>{DURUM[doc.status]}</span>
      </p>
      <div role="status" aria-live="polite">
        {doc.status === "processing" && <p className="msg ok">Belge işleniyor, bu sayfa otomatik güncellenir…</p>}
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
      <p style={{ marginTop: 24 }}><button type="button" className="btn danger" style={{ width: "auto" }} onClick={() => sil()}>Belgeyi sil</button></p>
    </div>
  );
}

// "Metni Dinle" ve "Çıkarılan Metin" bölümleri aynı metin kutusunu paylaşır:
// dinlerken okunan kelime işaretlenir; metin bölümünde bir kelime seçilip yer imi eklenebilir.
function MetinPaneli({ id, doc, mod, hedef }: { id: string; doc: Belge; mod: "dinle" | "metin"; hedef: number | null }) {
  const metinKap = useRef<HTMLDivElement>(null);
  const onceki = useRef(-1);
  const kelimeler = useMemo(() => (doc.text_preview ?? "").split(/\s+/).filter(Boolean), [doc.text_preview]);
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
    setDurum(`Seçilen yer: kelime ${i + 1}, “${kelimeler[i] ?? ""}”.`);
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
    if (hedef >= kelimeler.length) { setHata("Bu yer imi, ekranda gösterilen metin bölümünün dışında kalıyor."); return; }
    setSecili(hedef);
    setEtiket(ozet(hedef));
    metinKap.current?.querySelector<HTMLElement>(`[data-w="${hedef}"]`)?.scrollIntoView({ block: "center", behavior: "auto" });
    setDurum(`Yer imine gidildi: “${kelimeler.slice(hedef, hedef + 8).join(" ")}”.`);
  }, [mod, hedef, kelimeler, ozet]);

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
      if (!r.ok) setHata(await hataMesaji(r, "Yer imi eklenemedi."));
      else setDurum("Yer imi eklendi. Yer İmleri bölümünden ulaşabilirsiniz.");
    } catch { setHata("Sunucuya ulaşılamadı."); }
    setKaydediyor(false);
  }

  const uzun = doc.truncated || (doc.char_count ?? 0) > (doc.text_preview?.length ?? 0);
  const baslikId = mod === "dinle" ? "dinle-baslik" : "metin-baslik";
  return (
    <section aria-labelledby={baslikId} className="panel">
      <h2 id={baslikId} className="panel-h">{mod === "dinle" ? "Metni Dinle" : "Çıkarılan Metin"}</h2>
      <p className="panel-alt">
        {mod === "dinle"
          ? "Belgenin metnini sesli dinleyin; okunan kelime aşağıdaki metinde işaretlenir."
          : "Belgeden çıkarılan metin. Bir kelimeye tıklayarak o yere yer imi ekleyebilirsiniz."}
      </p>

      {mod === "dinle" && (
        <>
          <Oynatici key="metin" docId={id} source="text" etiket="Metni dinle"
            gorunen={kelimeler} onAktif={isaretle}
            dosyaAdi={`${uzantisiz(doc.title)} - metin.mp3`} indirilebilir={(doc.char_count ?? 0) <= 60000} />
          <p className="hint">Metnin tamamını dinlemek günlük sesli okuma kotanızdan düşer; özeti dinlemek çok daha kısadır.</p>
        </>
      )}

      {mod === "metin" && (
        <form onSubmit={yerImiEkle} className="alt-kart" aria-labelledby="yer-imi-baslik">
          <h3 id="yer-imi-baslik" className="liste-baslik" style={{ marginTop: 0 }}>Yer imi ekle</h3>
          <div className="iki-sutun">
            <div>
              <label htmlFor="yi-sira">Kelime sırası (1–{kelimeler.length})</label>
              <input id="yi-sira" type="number" min={1} max={Math.max(1, kelimeler.length)} value={secili === null ? "" : secili + 1}
                onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= kelimeler.length) sec(n - 1); }} />
              <p className="hint">Metinde bir kelimeye tıklayın ya da sırasını yazın.</p>
            </div>
            <div>
              <label htmlFor="yi-ad">Yer imi adı</label>
              <input id="yi-ad" type="text" value={etiket} onChange={(e) => setEtiket(e.target.value)} maxLength={120} disabled={secili === null} />
            </div>
          </div>
          <button type="submit" className="btn" style={{ width: "auto" }} disabled={secili === null || !etiket.trim() || kaydediyor}>Yer imi ekle</button>
        </form>
      )}

      <div role="status" aria-live="polite">{durum && <p className="msg ok">{durum}</p>}</div>
      <div role="alert">{hata && <p className="msg err">{hata}</p>}</div>

      <div className={"doctext" + (mod === "metin" ? " tiklanir" : "")} ref={metinKap} tabIndex={0} role="region" onClick={tikla}
        aria-label="Çıkarılan metin (okumak için ok tuşlarını kullanın)">
        <VurguluMetin text={doc.text_preview ?? ""} />
      </div>
      {uzun && <p className="hint">Burada metnin yalnızca ilk bölümü gösteriliyor. Özetleme ve sesli okuma tüm metni kullanacak; kelime vurgusu ve yer imleri yalnızca burada gösterilen bölümde çalışır.</p>}
    </section>
  );
}
