"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { soruNoBul, testIstegi } from "@/lib/ses/komutlar";
import { onayIste, sesDuyur } from "@/lib/ses/kayit";
import { istekAl } from "@/lib/ses/bolumGecis";
import { useSesKomutlari, useSesMetin } from "@/lib/ses/useSesKomutlari";
import { useLang } from "@/lib/i18n/client";
import { gunYaz, type Lang } from "@/lib/i18n/core";

type Zorluk = "easy" | "medium" | "hard";
const ZORLUK: { id: Zorluk; ad: string }[] = [
  { id: "easy", ad: "Kolay" }, { id: "medium", ad: "Orta" }, { id: "hard", ad: "Zor" },
];
const ZORLUK_AD: Record<Zorluk, string> = { easy: "Kolay", medium: "Orta", hard: "Zor" };
const ADETLER = [5, 10];

type Test = { id: string; difficulty: Zorluk; question_count: number; created_at: string; questions: { question: string; options: string[] }[] };
type TestOzet = { id: string; difficulty: Zorluk; question_count: number; created_at: string };
type Sonuc = { score: number; total: number; saved: boolean; results: { index: number; chosen: number | null; correct: boolean; answer: number; explanation: string }[] };
type Deneme = { id: string; score: number; total: number; created_at: string };

const harf = (j: number) => String.fromCharCode(65 + j);
const tarih = (lang: Lang, s: string) => gunYaz(lang, s, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function Quiz({ docId }: { docId: string }) {
  const { lang, t: tl } = useLang();   // `t` bu dosyada Test nesneleri için kullanıldığından çevirici `tl`
  const [zorluk, setZorluk] = useState<Zorluk>("medium");
  const [adet, setAdet] = useState(5);
  const [liste, setListe] = useState<TestOzet[]>([]);
  const [test, setTest] = useState<Test | null>(null);
  const [cevaplar, setCevaplar] = useState<(number | null)[]>([]);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [denemeler, setDenemeler] = useState<Deneme[]>([]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");
  const baslik = useRef<HTMLHeadingElement>(null);
  const sonucBaslik = useRef<HTMLHeadingElement>(null);
  const [aktif, setAktif] = useState(0);        // sesle çözerken şu anki soru
  const seslide = useRef(false);                 // test sesle başlatıldıysa hazır olunca soru okunur

  async function listeyiYukle() {
    try {
      const r = await apiFetch(`/api/documents/${docId}/quizzes`);
      if (r.ok) setListe(await r.json());
    } catch {}
  }
  useEffect(() => { listeyiYukle(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [docId]);
  // Başka bölümdeyken "10 soruluk zor test oluştur" denildiyse bu bölüme geçilmiş ve istek bırakılmıştır: testi başlat
  useEffect(() => {
    const i = istekAl(docId, "test");
    if (!i) return;
    seslide.current = true;
    void olustur(i.adet ?? adet, i.zorluk ?? zorluk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  function testiAc(t: Test) {
    setTest(t); setCevaplar(t.questions.map(() => null)); setSonuc(null); setHata(""); setAktif(0);
    setTimeout(() => baslik.current?.focus(), 50);
  }

  async function olustur(adetP = adet, zorlukP = zorluk) {
    const sesli = seslide.current;
    seslide.current = false;
    setAdet(adetP); setZorluk(zorlukP);
    setHata(""); setSonuc(null); setCalisiyor(true); setDurum(tl("Test hazırlanıyor, bu yarım dakika kadar sürebilir…"));
    try {
      const r = await apiFetch(`/api/documents/${docId}/quizzes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: adetP, difficulty: zorlukP }),
      });
      if (!r.ok) { setHata(await hataMesaji(r, tl("Test hazırlanamadı."))); setDurum(""); setCalisiyor(false); return; }
      const t: Test = await r.json();
      setDenemeler([]); testiAc(t); setDurum(tl("Test hazır: {n} soru.", { n: t.question_count }));
      if (sesli) sesDuyur(tl("Test hazır: {n} soru. {soru}", { n: t.question_count, soru: soruMetni(t, 0, true) }));
      listeyiYukle();
    } catch {
      setHata(tl("Sunucuya ulaşılamadı. Lütfen tekrar deneyin.")); setDurum("");
    }
    setCalisiyor(false);
  }

  async function ac(id: string) {
    setHata(""); setDurum("");
    try {
      const [r, d] = await Promise.all([apiFetch(`/api/quizzes/${id}`), apiFetch(`/api/quizzes/${id}/attempts`)]);
      if (!r.ok) { setHata(await hataMesaji(r, tl("Test açılamadı."))); return; }
      setDenemeler(d.ok ? await d.json() : []);
      testiAc(await r.json());
    } catch { setHata(tl("Sunucuya ulaşılamadı.")); }
  }

  async function bitir(onayli = false, sesli = false) {
    if (!test) return;
    const bos = cevaplar.filter((c) => c === null).length;
    if (bos > 0 && !onayli && !window.confirm(tl("{n} soruyu boş bıraktınız. Yine de bitirmek istiyor musunuz?", { n: bos }))) return;
    setHata(""); setCalisiyor(true);
    try {
      const r = await apiFetch(`/api/quizzes/${test.id}/attempts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: cevaplar }),
      });
      if (!r.ok) { setHata(await hataMesaji(r, tl("Sonuç hesaplanamadı."))); setCalisiyor(false); return; }
      const s: Sonuc = await r.json();
      setSonuc(s);
      if (sesli) sesDuyur(sonucMetni(s));
      else setTimeout(() => sonucBaslik.current?.focus(), 50);
      const d = await apiFetch(`/api/quizzes/${test.id}/attempts`);
      if (d.ok) setDenemeler(await d.json());
    } catch { setHata(tl("Sunucuya ulaşılamadı.")); }
    setCalisiyor(false);
  }

  async function sil(onayli = false) {
    if (!test || (!onayli && !window.confirm(tl("Bu test silinsin mi?")))) return;
    const r = await apiFetch(`/api/quizzes/${test.id}`, { method: "DELETE" });
    if (!r.ok) { setHata(await hataMesaji(r, tl("Test silinemedi."))); return; }
    setTest(null); setSonuc(null); setDurum(tl("Test silindi.")); listeyiYukle();
  }

  // ---- Sesli kullanım ----
  function soruMetni(t: Test, i: number, ilk = false) {
    const q = t.questions[i];
    const sikler = q.options.map((o, j) => `${harf(j)}: ${o}`).join(". ");
    return tl("Soru {i} / {n}. {soru} {sikler}.{ipucu}", { i: i + 1, n: t.questions.length, soru: q.question, sikler, ipucu: ilk ? " " + tl("Cevabı şık harfiyle ya da birinci, ikinci diye söyleyin.") : "" });
  }
  function sonucMetni(s: Sonuc) {
    const yanlis = s.results.map((r, i) => (r.correct ? 0 : i + 1)).filter(Boolean);
    return tl("{total} sorudan {score} tanesini doğru yaptınız.", { total: s.total, score: s.score }) + " " +
      (yanlis.length ? tl("Yanlış ya da boş: soru {liste}. Açıklamalar için “yanlışları oku” deyin.", { liste: yanlis.join(", ") }) : tl("Hepsi doğru, tebrikler."));
  }
  function git(i: number) {
    if (!test) return false;
    if (i < 0) { sesDuyur(tl("Zaten ilk sorudasınız.")); return true; }
    if (i >= test.questions.length) { sesDuyur(tl("Son sorudasınız. Bitirmek için “testi bitir” deyin.")); return true; }
    setAktif(i);
    const c = cevaplar[i];
    sesDuyur(soruMetni(test, i) + (c !== null ? " " + tl("Daha önce {harf} şıkkını işaretlemiştiniz.", { harf: harf(c) }) : ""));
    return true;
  }
  function sec(j: number) {
    if (!test || sonuc || calisiyor) return false;
    const i = aktif;
    setCevaplar((c) => c.map((v, k) => (k === i ? j : v)));
    if (i + 1 < test.questions.length) {          // işaretleyince sıradaki soruya geç ve oku
      setAktif(i + 1);
      sesDuyur(tl("{harf} şıkkı işaretlendi. {soru}", { harf: harf(j), soru: soruMetni(test, i + 1) }));
    } else {
      const bos = cevaplar.filter((c, k) => c === null && k !== i).length;
      sesDuyur(tl("{harf} şıkkı işaretlendi. Son soruydu.{bos} Bitirmek için “testi bitir” deyin.", { harf: harf(j), bos: bos ? " " + tl("{n} soru boş.", { n: bos }) : "" }));
    }
    return true;
  }
  function bitirSesli() {
    if (!test || calisiyor) return false;
    const bos = cevaplar.filter((c) => c === null).length;
    if (bos > 0) onayIste(tl("{n} soruyu boş bıraktınız. Yine de bitirilsin mi? Evet ya da hayır deyin.", { n: bos }), () => bitir(true, true));
    else void bitir(true, true);
    return true;
  }
  function yanlislariOku() {
    if (!test || !sonuc) return false;
    const p = sonuc.results.map((r, i) => ({ r, i })).filter((x) => !x.r.correct).map(({ r, i }) => {
      const q = test.questions[i];
      return tl("Soru {i}: {soru} Doğru cevap {harf}: {dogru}.", { i: i + 1, soru: q.question, harf: harf(r.answer), dogru: q.options[r.answer] }) + " " +
        `${r.chosen === null ? tl("Boş bırakmıştınız.") : tl("Sizin cevabınız {harf} idi.", { harf: harf(r.chosen) })} ${r.explanation}`;
    });
    sesDuyur(p.length ? p.join(" ... ") : tl("Yanlış cevabınız yok."));
    return true;
  }

  useEffect(() => {      // sesle gezerken şu anki soruyu görünür kıl (aktif=0: ilk açılışta sayfayı oynatma)
    if (!test || sonuc || aktif === 0) return;
    const azalt = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    document.getElementById(`soru-${aktif}`)?.scrollIntoView?.({ block: "center", behavior: azalt ? "auto" : "smooth" });
  }, [aktif, test, sonuc]);

  useSesKomutlari({
    "test.olustur": () => { if (calisiyor) return false; seslide.current = true; void olustur(); },
    "test.kolay": () => { setZorluk("easy"); sesDuyur(tl("Zorluk kolay olarak ayarlandı.")); },
    "test.orta": () => { setZorluk("medium"); sesDuyur(tl("Zorluk orta olarak ayarlandı.")); },
    "test.zor": () => { setZorluk("hard"); sesDuyur(tl("Zorluk zor olarak ayarlandı.")); },
    "test.bes": () => { setAdet(5); sesDuyur(tl("Beş soru olarak ayarlandı.")); },
    "test.on": () => { setAdet(10); sesDuyur(tl("On soru olarak ayarlandı.")); },
    ...(test && !sonuc ? {
      "sik.1": () => sec(0), "sik.2": () => sec(1), "sik.3": () => sec(2), "sik.4": () => sec(3),
      "test.sonraki": () => git(aktif + 1),
      "test.onceki": () => git(aktif - 1),
      "test.oku": () => git(aktif),
      "test.bitir": () => bitirSesli(),
    } : {}),
    ...(test && sonuc ? {
      "test.sonuc": () => { sesDuyur(sonucMetni(sonuc)); },
      "test.yanlis": () => yanlislariOku(),
      "test.tekrar": () => { testiAc(test); sesDuyur(tl("Aynı test yeniden başladı. {soru}", { soru: soruMetni(test, 0, true) })); },
    } : {}),
    ...(test ? {
      "test.sil": () => { if (calisiyor) return false; onayIste(tl("Test silinsin mi? Evet ya da hayır deyin."), () => sil(true)); },
    } : {}),
  });
  // "10 soruluk zor test oluştur", "3. soruya git"
  useSesMetin((metin) => {
    const p = testIstegi(metin, lang);
    if (p) {
      if (calisiyor) return false;
      seslide.current = true;
      void olustur(p.adet ?? adet, p.zorluk ?? zorluk);
      return true;
    }
    if (test && !sonuc) {
      const n = soruNoBul(metin, lang);
      if (n !== null) {
        if (n > test.questions.length) sesDuyur(tl("Testte {n} soru var.", { n: test.questions.length }));
        else git(n - 1);
        return true;
      }
    }
    return false;
  });

  return (
    <section aria-labelledby="quiz-baslik" className="panel">
      <h2 id="quiz-baslik" ref={baslik} tabIndex={-1} className="panel-h">{tl("Pekiştirme Testi")}</h2>
      <p className="panel-alt">{tl("Belgeden çoktan seçmeli sorular hazırlayın ve öğrendiklerinizi sınayın.")}</p>

      <div className="row">
        <div role="group" aria-label={tl("Zorluk")} className="seg">
          {ZORLUK.map((z) => (
            <button key={z.id} type="button" aria-pressed={zorluk === z.id} disabled={calisiyor} onClick={() => setZorluk(z.id)}>{tl(z.ad)}</button>
          ))}
        </div>
        <div role="group" aria-label={tl("Soru sayısı")} className="seg">
          {ADETLER.map((n) => (
            <button key={n} type="button" aria-pressed={adet === n} disabled={calisiyor} onClick={() => setAdet(n)}>{tl("{n} soru", { n })}</button>
          ))}
        </div>
        <button type="button" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor} onClick={() => olustur()}>
          {calisiyor && !test?.id ? tl("Hazırlanıyor…") : tl("Yeni test oluştur")}
        </button>
      </div>

      <div role="status" aria-live="polite">{durum && <p className="hint">{durum}</p>}</div>
      <div role="alert" aria-live="assertive">{hata && <p className="msg err">{hata}</p>}</div>

      {liste.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary>{tl("Önceki testler ({n})", { n: liste.length })}</summary>
          <ul>
            {liste.map((q) => (
              <li key={q.id}>
                <button type="button" className="btn sec" onClick={() => ac(q.id)}>
                  {tl(ZORLUK_AD[q.difficulty])} · {tl("{n} soru", { n: q.question_count })} · {tarih(lang, q.created_at)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {test && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 4px" }}>{tl("{zorluk} test · {n} soru", { zorluk: tl(ZORLUK_AD[test.difficulty]), n: test.question_count })}</h3>
          {denemeler.length > 0 && !sonuc && (
            <p className="hint">{tl("Önceki denemeleriniz: {liste}", { liste: denemeler.slice(0, 5).map((d) => `${d.score}/${d.total}`).join(", ") })}</p>
          )}

          {sonuc && (
            <div role="status" className="msg ok">
              <h3 ref={sonucBaslik} tabIndex={-1} style={{ margin: 0 }}>
                {tl("{total} sorudan {score} tanesini doğru yaptınız.", { total: sonuc.total, score: sonuc.score })}
              </h3>
              {!sonuc.saved && <p className="hint">{tl("Sonuç kaydedilemedi, ancak aşağıda görebilirsiniz.")}</p>}
            </div>
          )}

          {test.questions.map((q, i) => {
            const s = sonuc?.results[i];
            return (
              <fieldset key={i} id={`soru-${i}`} className={i === aktif && !sonuc ? "aktif-soru" : undefined}>
                <legend>{tl("Soru {i}/{n}: {soru}", { i: i + 1, n: test.question_count, soru: q.question })}</legend>
                {q.options.map((o, j) => {
                  const dogruSik = s && s.answer === j;
                  const yanlisSecim = s && s.chosen === j && !s.correct;
                  return (
                    <label key={j} className={`opt${dogruSik ? " dogru" : ""}${yanlisSecim ? " yanlis" : ""}`}>
                      <input type="radio" name={`soru-${i}`} checked={cevaplar[i] === j} disabled={Boolean(sonuc) || calisiyor}
                        onChange={() => { setCevaplar((c) => c.map((v, k) => (k === i ? j : v))); setAktif(i); }} />
                      <span>
                        <strong>{harf(j)})</strong> {o}
                        {dogruSik && <strong> ({tl("Doğru cevap")})</strong>}
                        {yanlisSecim && <strong> ({tl("Sizin cevabınız — yanlış")})</strong>}
                      </span>
                    </label>
                  );
                })}
                {s && (
                  <p className="hint" style={{ marginTop: 8 }}>
                    {s.chosen === null ? tl("Bu soruyu boş bıraktınız.") : s.correct ? tl("Doğru.") : tl("Yanlış.")}{" "}
                    {s.explanation}
                  </p>
                )}
              </fieldset>
            );
          })}

          <div className="row" style={{ marginTop: 12 }}>
            {!sonuc && (
              <button type="button" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor} onClick={() => bitir()}>
                {calisiyor ? tl("Hesaplanıyor…") : tl("Testi bitir")}
              </button>
            )}
            {sonuc && (
              <button type="button" className="btn sec" onClick={() => testiAc(test)}>{tl("Aynı testi tekrar çöz")}</button>
            )}
            <button type="button" className="btn sec" disabled={calisiyor} onClick={() => sil()}>{tl("Testi sil")}</button>
          </div>
        </div>
      )}
      <p className="hint">{tl("Sorular yapay zekâ tarafından belgeden üretilir ve hata içerebilir; şüphe duyduğunuzda asıl metni kontrol edin.")}</p>
    </section>
  );
}
