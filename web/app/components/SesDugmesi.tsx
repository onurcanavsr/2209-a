"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, hataMesaji } from "@/lib/api";
import { benzerlik, esles, komutlari, normalize } from "@/lib/ses/komutlar";
import { useLang } from "@/lib/i18n/client";
import { calistir, dikteAl, duyuruAyarla, duyuruSayaci, ipuclari, metinDene, mikrofonuBildir, sesDuyur, uygunIdler } from "@/lib/ses/kayit";
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
  const { lang, t } = useLang();
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
  // Bileşenler (test, soru-cevap, çalışma alanı) sonuçlarını aynı canlı bölge üzerinden duyurur
  useEffect(() => duyuruAyarla(duyur), []);

  function yardimAc() {
    const var_ = uygunIdler();
    setYardim(komutlari(lang).filter((k) => var_.has(k.id)).map((k) => ({ id: k.id, ad: k.ad, soyle: k.ifadeler[0] })));
    dlg.current?.showModal();
  }

  // Her sayfada geçerli komutlar (belgeye özgü olanları ilgili bileşenler kendi bağlar)
  useSesKomutlari({
    "git.calisma": () => { router.push("/"); },
    "git.hesap": () => { router.push("/hesap"); },
    ...(admin ? { "git.yonetim": () => { router.push("/admin"); } } : {}),
    "geri.sayfa": () => { router.back(); },
    "cikis": () => { document.querySelector<HTMLFormElement>('form[action="/auth/cikis"]')?.requestSubmit(); },
    "yazi.buyut": () => { ayarla({ boyutFark: 2 }); },
    "yazi.kucult": () => { ayarla({ boyutFark: -2 }); },
    "tema.koyu": () => { ayarla({ tema: "dark" }); },
    "tema.acik": () => { ayarla({ tema: "light" }); },
    "tema.otomatik": () => { ayarla({ tema: "auto" }); },
    "yardim": () => { yardimAc(); },
    "dil.tr": () => { window.dispatchEvent(new CustomEvent("araclar:dil", { detail: { lang: "tr" } })); sesDuyur("Türkçeye geçildi."); },
    "dil.en": () => { window.dispatchEvent(new CustomEvent("araclar:dil", { detail: { lang: "en" } })); sesDuyur("Switched to English."); },
  });

  async function isle(metin: string) {
    const s = esles(metin, uygunIdler(), lang);
    const calis = async (id: string, ad: string) => {
      const once = duyuruSayaci();
      const tamam = await calistir(id);
      // Bileşen kendi sonucunu duyurduysa ("B şıkkı işaretlendi. Soru 3…") genel onay mesajı eklenmez
      if (!tamam) duyur(t("{ad} şu an kullanılamıyor.", { ad }));
      else if (duyuruSayaci() === once) duyur(t("Anlaşıldı: {ad}.", { ad }));
    };
    // 1) birebir sabit komut  2) serbest cümle (belge adı, "3. soruya git" …)  3) yaklaşık sabit komut
    if (s.durum === "ok" && s.skor >= 0.999) return calis(s.id, s.ad);
    if (await metinDene(metin)) return;
    if (s.durum === "ok") return calis(s.id, s.ad);
    if (s.durum === "belirsiz") duyur(t("Emin olamadım. {liste} demek istediniz? Lütfen tekrar söyleyin.", { liste: lang === "en" ? s.adaylar.join(" or ") : s.adaylar.map((a) => a + " mı").join(", ") }));
    else if (s.durum === "yok") duyur(t("“{metin}” anlaşılamadı. Komutlar için “yardım” deyin.", { metin }));
    else duyur(t("Ses algılanmadı. Tekrar deneyin."));
  }

  /** Bir kayıt al, sunucuda metne çevir. Hata/boşlukta kullanıcıya bildirip null döner. */
  async function kaydetVeCoz(ac: AbortController): Promise<string | null> {
    await bip(880, 110);   // "dinliyorum" işareti; kayıt bundan SONRA başlar, bip kayda karışmaz
    if (ac.signal.aborted) { duyur(t("Dinleme iptal edildi.")); return null; }
    setDurum("dinliyor");  // dinlerken canlı bölge güncellenmez: ekran okuyucu mikrofona konuşmasın
    const k = await kayitYap({ signal: ac.signal });
    if (k.neden === "iptal") { duyur(t("Dinleme iptal edildi.")); return null; }
    await bip(520, 110);   // "bitti" işareti
    if (!k.blob) { duyur(t("Ses algılanmadı. Tekrar deneyin.")); return null; }
    setDurum("isleniyor");
    const fd = new FormData();
    fd.append("audio", k.blob, `komut.${uzanti(k.blob.type)}`);
    fd.append("hints", JSON.stringify(ipuclari()));   // belge başlıkları gibi özel adlar: tanımayı iyileştirir
    const r = await apiFetch("/api/voice/transcribe", { method: "POST", body: fd });
    if (!r.ok) {
      if (r.status === 429) setKalan(0);
      duyur(await hataMesaji(r, t("Ses anlaşılamadı.")));
      return null;
    }
    const { text }: { text: string } = await r.json();
    setKalan((n) => (n === null ? n : Math.max(n - 1, 0)));
    setDuyulan(text);
    return text;
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
      const metin = await kaydetVeCoz(ac);
      if (metin === null) return;
      await isle(metin);

      // Takip konuşmaları (soru metni, evet/hayır, "hangisi?"): düğmeye yeniden basmadan mikrofon kendiliğinden açılır
      for (let tur = 0; tur < 3 && !ac.signal.aborted; tur++) {
        const d = dikteAl();
        if (!d) break;
        duyur(d.istem);
        // İstem ekran okuyucuyla okunuyorsa bitmesini bekle (mikrofon onu duymasın): süre metin uzunluğuna göre
        await new Promise((r) => setTimeout(r, Math.min(6000, 1200 + d.istem.length * 65)));
        const yanit = await kaydetVeCoz(ac);
        if (yanit === null) break;
        // Mikrofon istemin kendisini yakaladıysa yanıt sayma
        if (benzerlik(normalize(yanit), normalize(d.istem)) > 0.6) { duyur(t("Ses algılanmadı. Tekrar deneyin.")); break; }
        await d.uygula(yanit);
      }
    } catch (e) {
      duyur(e instanceof MikrofonHatasi ? e.message : t("Sesli komut çalışmadı. Lütfen tekrar deneyin."));
    } finally {
      dikteAl();             // yarım kalmış takip isteği sonraki komuta sızmasın
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
        {bitti ? t("Sesli komut (günlük hak doldu)") : durum === "dinliyor" ? t("Dinleniyor, iptal") : durum === "isleniyor" ? t("Anlaşılıyor…") : t("Sesli komut")}
      </button>
      <button type="button" onClick={yardimAc}>{t("Komutlar")}</button>

      {/* Sonuç duyuruları: yalnızca dinleme BİTTİKTEN sonra güncellenir */}
      <div role="status" aria-live="polite" className="sr-only"><span key={duyuru.n}>{duyuru.metin}</span></div>
      {duyulan && <span className="ses-duyulan" aria-hidden="true">“{duyulan}”</span>}

      <dialog ref={dlg} aria-labelledby="ses-yardim-baslik" className="ses-dlg">
        <h2 id="ses-yardim-baslik" style={{ marginTop: 0 }}>{t("Sesli komutlar")}</h2>
        <p>{t("“Sesli komut” düğmesine basın, bip sesinden sonra komutu söyleyin. Konuşmanız bitince kendiliğinden algılanır; Esc ile iptal edebilirsiniz. Okuma sürerken düğmeye basarsanız okuma duraklar, devam için “devam et” deyin.")}</p>
        <ul>
          {yardim.map((k) => <li key={k.id}><strong>“{k.soyle}”</strong> — {k.ad}</li>)}
        </ul>
        <p className="hint">{t("Çalışma alanında bir belgeyi açmak için adını söylemeniz yeterli (ör. “staj raporu”); “ikinci belge” gibi sıra numarası da olur. Silme gibi geri alınamaz işlemlerde sizden “evet” demeniz istenir.")}</p>
        <p className="hint">{t("Komutları söylediğiniz dil, arayüz dilidir. Dili değiştirmek için üstteki dil seçiciyi ya da “İngilizceye geç” komutunu kullanın.")}</p>
        {kalan !== null && <p className="hint">{t("Bugün kalan sesli komut hakkınız: {kalan}", { kalan })}</p>}
        <p className="hint">{t("Ses sunucumuzda saklanmaz; komutun anlaşılması için bir yapay zekâ konuşma tanıma servisine iletilir.")}{" "}
          {t("Ayrıntı:")} <Link href="/aydinlatma">{t("Aydınlatma Metni")}</Link>.</p>
        <form method="dialog"><button className="btn sec">{t("Kapat")}</button></form>
      </dialog>
    </>
  );
}
