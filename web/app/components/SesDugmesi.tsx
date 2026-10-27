"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, hataMesaji } from "@/lib/api";
import { KOMUTLAR, esles } from "@/lib/ses/komutlar";
import { calistir, mikrofonuBildir, uygunIdler } from "@/lib/ses/kayit";
import { useSesKomutlari } from "@/lib/ses/useSesKomutlari";
import { desteklenir, kayitYap, MikrofonHatasi, uzanti } from "@/lib/ses/kaydedici";
import { bip, bipHazirla } from "@/lib/ses/bip";

type Durum = "bosta" | "dinliyor" | "isleniyor";
type Yardim = { id: string; ad: string; soyle: string };

function ayarla(detail: { tema?: string; boyutFark?: number }) {
  window.dispatchEvent(new CustomEvent("araclar:ayarla", { detail }));
}

/** Sesli komut düğmesi. Basınca bip → konuşun → sessizlikte kendiliğinden biter → sunucuda metne çevrilir →
 *  komut çalışır. Ses tarayıcıda kaydedilip sunucuda tanındığı için Chrome, Edge, Brave, Opera, Firefox ve
 *  Safari'de aynı çalışır. */
export default function SesDugmesi({ admin }: { admin: boolean }) {
  const router = useRouter();
  const [hazir, setHazir] = useState(false);
  const [kalan, setKalan] = useState<number | null>(null);
  const [durum, setDurum] = useState<Durum>("bosta");
  const [duyuru, setDuyuru] = useState({ n: 0, metin: "" });
  const [duyulan, setDuyulan] = useState("");
  const [yardim, setYardim] = useState<Yardim[]>([]);
  const dlg = useRef<HTMLDialogElement>(null);
  const iptal = useRef<AbortController | null>(null);
  const mesgul = useRef(false);

  // Özellik açık mı (sunucuda anahtar tanımlı mı) ve kalan günlük hak
  useEffect(() => {
    let canli = true;
    if (!desteklenir()) return;
    (async () => {
      try {
        const r = await apiFetch("/api/voice/status");
        if (!r.ok) return;
        const j: { enabled: boolean; remaining: number } = await r.json();
        if (canli) { setHazir(j.enabled); setKalan(j.remaining); }
      } catch {}
    })();
    return () => { canli = false; };
  }, []);

  // Esc: dinlemeyi iptal et
  useEffect(() => {
    if (durum !== "dinliyor") return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") iptal.current?.abort(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [durum]);

  function duyur(metin: string) {
    setDuyuru((d) => ({ n: d.n + 1, metin }));
  }

  function yardimAc() {
    const var_ = uygunIdler();
    setYardim(KOMUTLAR.filter((k) => var_.has(k.id)).map((k) => ({ id: k.id, ad: k.ad, soyle: k.ifadeler[0] })));
    dlg.current?.showModal();
  }

  // Her sayfada geçerli komutlar (belgeye özgü olanları ilgili bileşenler kendi bağlar)
  useSesKomutlari({
    "git.calisma": () => { router.push("/"); },
    "git.hesap": () => { router.push("/hesap"); },
    ...(admin ? { "git.yonetim": () => { router.push("/admin"); } } : {}),
    "geri.sayfa": () => { router.back(); },
    "yazi.buyut": () => { ayarla({ boyutFark: 2 }); },
    "yazi.kucult": () => { ayarla({ boyutFark: -2 }); },
    "tema.koyu": () => { ayarla({ tema: "dark" }); },
    "tema.acik": () => { ayarla({ tema: "light" }); },
    "tema.otomatik": () => { ayarla({ tema: "auto" }); },
    "yardim": () => { yardimAc(); },
  });

  async function isle(metin: string) {
    const s = esles(metin, uygunIdler());
    if (s.durum === "ok") {
      const tamam = await calistir(s.id);
      duyur(tamam ? `Anlaşıldı: ${s.ad}.` : `${s.ad} şu an kullanılamıyor.`);
    } else if (s.durum === "belirsiz") {
      duyur(`Emin olamadım. ${s.adaylar.join(" mı, ")} mı demek istediniz? Lütfen tekrar söyleyin.`);
    } else if (s.durum === "yok") {
      duyur(`“${metin}” anlaşılamadı. Komutlar için “yardım” deyin.`);
    } else {
      duyur("Ses algılanmadı. Tekrar deneyin.");
    }
  }

  async function dinle() {
    if (mesgul.current) { iptal.current?.abort(); return; }   // dinlerken tekrar basmak iptal eder
    mesgul.current = true;
    bipHazirla();            // tıklama anında: tarayıcı sesi ancak böyle açar
    mikrofonuBildir();       // sesli okuma kendi sesini komut sanmasın diye duraklar
    setDuyulan("");
    const ac = new AbortController();
    iptal.current = ac;
    try {
      await bip(880, 110);   // "dinliyorum" işareti; kayıt bundan SONRA başlar, bip kayda karışmaz
      setDurum("dinliyor");  // dinlerken canlı bölge güncellenmez: ekran okuyucu mikrofona konuşmasın
      const k = await kayitYap({ signal: ac.signal });
      if (k.neden === "iptal") { duyur("Dinleme iptal edildi."); return; }
      await bip(520, 110);   // "bitti" işareti
      if (!k.blob) { duyur("Ses algılanmadı. Tekrar deneyin."); return; }
      setDurum("isleniyor");
      const fd = new FormData();
      fd.append("audio", k.blob, `komut.${uzanti(k.blob.type)}`);
      const r = await apiFetch("/api/voice/transcribe", { method: "POST", body: fd });
      if (!r.ok) {
        if (r.status === 429) setKalan(0);
        duyur(await hataMesaji(r, "Ses anlaşılamadı."));
        return;
      }
      const { text }: { text: string } = await r.json();
      setKalan((n) => (n === null ? n : Math.max(n - 1, 0)));
      setDuyulan(text);
      await isle(text);
    } catch (e) {
      duyur(e instanceof MikrofonHatasi ? e.message : "Sesli komut çalışmadı. Lütfen tekrar deneyin.");
    } finally {
      mesgul.current = false;
      setDurum("bosta");
    }
  }

  if (!hazir) return null;
  const bitti = kalan === 0;
  return (
    <>
      <button type="button" onClick={dinle} disabled={durum === "isleniyor" || bitti}
        className={`ses-btn${durum === "dinliyor" ? " dinliyor" : ""}`}>
        <span aria-hidden="true">🎤 </span>
        {bitti ? "Sesli komut (günlük hak doldu)" : durum === "dinliyor" ? "Dinleniyor, iptal" : durum === "isleniyor" ? "Anlaşılıyor…" : "Sesli komut"}
      </button>
      <button type="button" onClick={yardimAc}>Komutlar</button>

      {/* Sonuç duyuruları: yalnızca dinleme BİTTİKTEN sonra güncellenir */}
      <div role="status" aria-live="polite" className="sr-only"><span key={duyuru.n}>{duyuru.metin}</span></div>
      {duyulan && <span className="ses-duyulan" aria-hidden="true">“{duyulan}”</span>}

      <dialog ref={dlg} aria-labelledby="ses-yardim-baslik" className="ses-dlg">
        <h2 id="ses-yardim-baslik" style={{ marginTop: 0 }}>Sesli komutlar</h2>
        <p>“Sesli komut” düğmesine basın, bip sesinden sonra komutu söyleyin. Konuşmanız bitince kendiliğinden algılanır; Esc ile iptal edebilirsiniz.
          Okuma sürerken düğmeye basarsanız okuma duraklar, devam için “devam et” deyin.</p>
        <ul>
          {yardim.map((k) => <li key={k.id}><strong>“{k.soyle}”</strong> — {k.ad}</li>)}
        </ul>
        {kalan !== null && <p className="hint">Bugün kalan sesli komut hakkınız: {kalan}</p>}
        <p className="hint">Ses sunucumuzda saklanmaz; komutun anlaşılması için bir yapay zekâ konuşma tanıma servisine iletilir.
          Ayrıntı: <Link href="/aydinlatma">Aydınlatma Metni</Link>.</p>
        <form method="dialog"><button className="btn sec">Kapat</button></form>
      </dialog>
    </>
  );
}
