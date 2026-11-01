"use client";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Araclar from "./Araclar";
import SesDugmesi from "./SesDugmesi";
import { BelgeBaglamSaglayici, useBelgeBilgi } from "./BelgeBaglam";
import { BOLUMLER, YONETIM, Ikon, belgeIdYoldan } from "@/lib/bolumler";
import { SITE_ADI } from "@/lib/site";

// Giriş yapmış kullanıcının çerçevesi: üst çubuk (belge etiketi, sesli komut, tema, yazı boyutu, hesap) + sol menü.
export default function Kabuk({ admin, eposta, children }: { admin: boolean; eposta: string; children: ReactNode }) {
  const [acik, setAcik] = useState(false);
  const kapat = useCallback(() => setAcik(false), []);
  const menuDugme = useRef<HTMLButtonElement>(null);
  const ustRef = useRef<HTMLElement>(null);

  // Üst çubuk yapışkan olduğu için yüksekliğini CSS'e bildiririz (yan menü ve odak kaydırması bunu kullanır)
  useEffect(() => {
    const el = ustRef.current;
    if (!el) return;
    const yaz = () => document.documentElement.style.setProperty("--ust-yuk", el.offsetHeight + "px");
    yaz();
    const ro = new ResizeObserver(yaz);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!acik) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setAcik(false); menuDugme.current?.focus(); } };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [acik]);

  return (
    <BelgeBaglamSaglayici>
      <div className="kabuk">
        <header ref={ustRef} className="ust">
          <button ref={menuDugme} type="button" className="menu-ac" aria-expanded={acik} aria-controls="kenar"
            onClick={() => setAcik((a) => !a)}>
            <span aria-hidden="true">☰</span> Menü
          </button>
          <Link href="/" className="brand"><span className="logo" aria-hidden="true">{SITE_ADI[0]}</span>{SITE_ADI}</Link>
          <BelgeEtiketi />
          <div className="tools">
            {process.env.NEXT_PUBLIC_SESLI_KOMUT === "true" && <SesDugmesi admin={admin} />}
            <Araclar />
            <KullaniciMenu eposta={eposta} />
          </div>
        </header>

        <aside id="kenar" className="kenar" data-acik={acik} aria-label="Yan menü">
          <div className="kenar-ic"><Suspense fallback={null}><KenarMenu admin={admin} kapat={kapat} /></Suspense></div>
        </aside>
        {acik && <div className="kenar-arka" onClick={kapat} aria-hidden="true" />}

        <main id="icerik">{children}</main>
      </div>
    </BelgeBaglamSaglayici>
  );
}

function BelgeEtiketi() {
  const { bilgi } = useBelgeBilgi();
  if (!bilgi) return <div className="belge-etiket-yer" />;
  return (
    <div className="belge-etiket" title={bilgi.baslik}>
      <Ikon ad="dosya" />
      <div>
        <strong>{bilgi.baslik}</strong>
        {bilgi.ayrinti && <span>{bilgi.ayrinti}</span>}
      </div>
    </div>
  );
}

function KenarMenu({ admin, kapat }: { admin: boolean; kapat: () => void }) {
  const yol = usePathname() ?? "/";
  const sp = useSearchParams();
  const yoldanId = belgeIdYoldan(yol);
  const [son, setSon] = useState<string | null>(null);

  // Belge sayfasında değilsek, en son açılan belgenin bölümlerine gidilir
  useEffect(() => {
    try { setSon(localStorage.getItem("sonBelge")); } catch {}
  }, [yol]);

  const aramaAnahtari = sp?.toString() ?? "";
  useEffect(() => { kapat(); }, [yol, aramaAnahtari, kapat]);

  const belgeId = yoldanId ?? son;
  const bolum = yoldanId ? (sp?.get("b") || "ozet") : null;

  return (
    <>
      <nav aria-label="Ana menü" className="kenar-nav">
        <ul>
          <li>
            <Link href="/" className="nav-oge" aria-current={yol === "/" ? "page" : undefined}><Ikon ad="ana" />Ana sayfa</Link>
          </li>
          {BOLUMLER.map((b) => {
            const etkin = bolum === b.id;
            return (
              <li key={b.id}>
                {belgeId ? (
                  <Link href={`/belge/${belgeId}?b=${b.id}`} className="nav-oge" aria-current={etkin ? "page" : undefined}>
                    <Ikon ad={b.ikon} />{b.ad}
                  </Link>
                ) : (
                  <Link href="/" className="nav-oge pasif"><Ikon ad={b.ikon} />{b.ad}<span className="sr-only"> (önce Ana sayfadan bir belge seçin)</span></Link>
                )}
              </li>
            );
          })}
        </ul>
        {!belgeId && <p className="hint kenar-not">Bölümleri kullanmak için Ana sayfadan bir belge açın.</p>}

        {admin && (
          <>
            <h2 className="kenar-baslik" id="yonetim-baslik">Yönetim</h2>
            <ul aria-labelledby="yonetim-baslik">
              {YONETIM.map((y) => {
                const etkin = y.href === "/admin" ? yol === "/admin" : yol.startsWith(y.href);
                return (
                  <li key={y.href}>
                    <Link href={y.href} className="nav-oge" aria-current={etkin ? "page" : undefined}><Ikon ad={y.ikon} />{y.ad}</Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>
      <div className="kenar-alt">
        <Link href="/hesap" className="nav-oge" aria-current={yol === "/hesap" ? "page" : undefined}><Ikon ad="hesap" />Hesabım</Link>
        <p className="hint"><Link href="/aydinlatma">Aydınlatma Metni</Link> · <Link href="/kullanim-sartlari">Kullanım Şartları</Link></p>
      </div>
    </>
  );
}

function KullaniciMenu({ eposta }: { eposta: string }) {
  const [acik, setAcik] = useState(false);
  const kap = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const bas = (eposta.trim()[0] ?? "?").toLocaleUpperCase("tr-TR") + (eposta.trim()[1] ?? "").toLocaleUpperCase("tr-TR");

  useEffect(() => {
    if (!acik) return;
    const dis = (e: MouseEvent) => { if (!kap.current?.contains(e.target as Node)) setAcik(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setAcik(false); dugme.current?.focus(); } };
    document.addEventListener("mousedown", dis);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", dis); document.removeEventListener("keydown", esc); };
  }, [acik]);

  return (
    <div className="kullanici" ref={kap}>
      <button ref={dugme} type="button" className="avatar" aria-expanded={acik} aria-haspopup="true"
        aria-label={`Hesap menüsü: ${eposta}`} onClick={() => setAcik((a) => !a)}>{bas}</button>
      {/* Menü kapalıyken de DOM'da kalır (hidden): "çıkış yap" sesli komutu çıkış formunu bulup gönderebilsin */}
      <div className="kullanici-menu" role="group" aria-label="Hesap" hidden={!acik}>
        <p className="hint" style={{ margin: "0 0 8px", wordBreak: "break-all" }}>{eposta}</p>
        <Link href="/hesap" onClick={() => setAcik(false)}>Hesabım</Link>
        <form action="/auth/cikis" method="post"><button type="submit">Çıkış</button></form>
      </div>
    </div>
  );
}
