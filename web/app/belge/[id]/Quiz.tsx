"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";
import { soruNoBul, testIstegi } from "@/lib/ses/komutlar";
import { onayIste, sesDuyur } from "@/lib/ses/kayit";
import { istekAl } from "@/lib/ses/bolumGecis";
import { useSesKomutlari, useSesMetin } from "@/lib/ses/useSesKomutlari";

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
const tarih = (s: string) => new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function Quiz({ docId }: { docId: string }) {
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
    setHata(""); setSonuc(null); setCalisiyor(true); setDurum("Test hazırlanıyor, bu yarım dakika kadar sürebilir…");
    try {
      const r = await apiFetch(`/api/documents/${docId}/quizzes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: adetP, difficulty: zorlukP }),
      });
      if (!r.ok) { setHata(await hataMesaji(r, "Test hazırlanamadı.")); setDurum(""); setCalisiyor(false); return; }
      const t: Test = await r.json();
      setDenemeler([]); testiAc(t); setDurum(`Test hazır: ${t.question_count} soru.`);
      if (sesli) sesDuyur(`Test hazır: ${t.question_count} soru. ${soruMetni(t, 0, true)}`);
      listeyiYukle();
    } catch {
      setHata("Sunucuya ulaşılamadı. Lütfen tekrar deneyin."); setDurum("");
    }
    setCalisiyor(false);
  }

  async function ac(id: string) {
    setHata(""); setDurum("");
    try {
      const [r, d] = await Promise.all([apiFetch(`/api/quizzes/${id}`), apiFetch(`/api/quizzes/${id}/attempts`)]);
      if (!r.ok) { setHata(await hataMesaji(r, "Test açılamadı.")); return; }
      setDenemeler(d.ok ? await d.json() : []);
      testiAc(await r.json());
    } catch { setHata("Sunucuya ulaşılamadı."); }
  }

  async function bitir(onayli = false, sesli = false) {
    if (!test) return;
    const bos = cevaplar.filter((c) => c === null).length;
    if (bos > 0 && !onayli && !window.confirm(`${bos} soruyu boş bıraktınız. Yine de bitirmek istiyor musunuz?`)) return;
    setHata(""); setCalisiyor(true);
    try {
      const r = await apiFetch(`/api/quizzes/${test.id}/attempts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: cevaplar }),
      });
      if (!r.ok) { setHata(await hataMesaji(r, "Sonuç hesaplanamadı.")); setCalisiyor(false); return; }
      const s: Sonuc = await r.json();
      setSonuc(s);
      if (sesli) sesDuyur(sonucMetni(s));
      else setTimeout(() => sonucBaslik.current?.focus(), 50);
      const d = await apiFetch(`/api/quizzes/${test.id}/attempts`);
      if (d.ok) setDenemeler(await d.json());
    } catch { setHata("Sunucuya ulaşılamadı."); }
    setCalisiyor(false);
  }

  async function sil(onayli = false) {
    if (!test || (!onayli && !window.confirm("Bu test silinsin mi?"))) return;
    const r = await apiFetch(`/api/quizzes/${test.id}`, { method: "DELETE" });
    if (!r.ok) { setHata(await hataMesaji(r, "Test silinemedi.")); return; }
    setTest(null); setSonuc(null); setDurum("Test silindi."); listeyiYukle();
  }

  // ---- Sesli kullanım ----
  function soruMetni(t: Test, i: number, ilk = false) {
    const q = t.questions[i];
    const sikler = q.options.map((o, j) => `${harf(j)}: ${o}`).join(". ");
    return `Soru ${i + 1} / ${t.questions.length}. ${q.question} ${sikler}.${ilk ? " Cevabı şık harfiyle ya da birinci, ikinci diye söyleyin." : ""}`;
  }
  function sonucMetni(s: Sonuc) {
    const yanlis = s.results.map((r, i) => (r.correct ? 0 : i + 1)).filter(Boolean);
    return `${s.total} sorudan ${s.score} tanesini doğru yaptınız. ` +
      (yanlis.length ? `Yanlış ya da boş: soru ${yanlis.join(", ")}. Açıklamalar için “yanlışları oku” deyin.` : "Hepsi doğru, tebrikler.");
  }
  function git(i: number) {
    if (!test) return false;
    if (i < 0) { sesDuyur("Zaten ilk sorudasınız."); return true; }
    if (i >= test.questions.length) { sesDuyur("Son sorudasınız. Bitirmek için “testi bitir” deyin."); return true; }
    setAktif(i);
    const c = cevaplar[i];
    sesDuyur(soruMetni(test, i) + (c !== null ? ` Daha önce ${harf(c)} şıkkını işaretlemiştiniz.` : ""));
    return true;
  }
  function sec(j: number) {
    if (!test || sonuc || calisiyor) return false;
    const i = aktif;
    setCevaplar((c) => c.map((v, k) => (k === i ? j : v)));
    if (i + 1 < test.questions.length) {          // işaretleyince sıradaki soruya geç ve oku
      setAktif(i + 1);
      sesDuyur(`${harf(j)} şıkkı işaretlendi. ${soruMetni(test, i + 1)}`);
    } else {
      const bos = cevaplar.filter((c, k) => c === null && k !== i).length;
      sesDuyur(`${harf(j)} şıkkı işaretlendi. Son soruydu.${bos ? ` ${bos} soru boş.` : ""} Bitirmek için “testi bitir” deyin.`);
    }
    return true;
  }
  function bitirSesli() {
    if (!test || calisiyor) return false;
    const bos = cevaplar.filter((c) => c === null).length;
    if (bos > 0) onayIste(`${bos} soruyu boş bıraktınız. Yine de bitirilsin mi? Evet ya da hayır deyin.`, () => bitir(true, true));
    else void bitir(true, true);
    return true;
  }
  function yanlislariOku() {
    if (!test || !sonuc) return false;
    const p = sonuc.results.map((r, i) => ({ r, i })).filter((x) => !x.r.correct).map(({ r, i }) => {
      const q = test.questions[i];
      return `Soru ${i + 1}: ${q.question} Doğru cevap ${harf(r.answer)}: ${q.options[r.answer]}. ` +
        `${r.chosen === null ? "Boş bırakmıştınız." : `Sizin cevabınız ${harf(r.chosen)} idi.`} ${r.explanation}`;
    });
    sesDuyur(p.length ? p.join(" ... ") : "Yanlış cevabınız yok.");
    return true;
  }

  useEffect(() => {      // sesle gezerken şu anki soruyu görünür kıl (aktif=0: ilk açılışta sayfayı oynatma)
    if (!test || sonuc || aktif === 0) return;
    const azalt = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    document.getElementById(`soru-${aktif}`)?.scrollIntoView?.({ block: "center", behavior: azalt ? "auto" : "smooth" });
  }, [aktif, test, sonuc]);

  useSesKomutlari({
    "test.olustur": () => { if (calisiyor) return false; seslide.current = true; void olustur(); },
    "test.kolay": () => { setZorluk("easy"); sesDuyur("Zorluk kolay olarak ayarlandı."); },
    "test.orta": () => { setZorluk("medium"); sesDuyur("Zorluk orta olarak ayarlandı."); },
    "test.zor": () => { setZorluk("hard"); sesDuyur("Zorluk zor olarak ayarlandı."); },
    "test.bes": () => { setAdet(5); sesDuyur("Beş soru olarak ayarlandı."); },
    "test.on": () => { setAdet(10); sesDuyur("On soru olarak ayarlandı."); },
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
      "test.tekrar": () => { testiAc(test); sesDuyur(`Aynı test yeniden başladı. ${soruMetni(test, 0, true)}`); },
    } : {}),
    ...(test ? {
      "test.sil": () => { if (calisiyor) return false; onayIste("Test silinsin mi? Evet ya da hayır deyin.", () => sil(true)); },
    } : {}),
  });
  // "10 soruluk zor test oluştur", "3. soruya git"
  useSesMetin((metin) => {
    const p = testIstegi(metin);
    if (p) {
      if (calisiyor) return false;
      seslide.current = true;
      void olustur(p.adet ?? adet, p.zorluk ?? zorluk);
      return true;
    }
    if (test && !sonuc) {
      const n = soruNoBul(metin);
      if (n !== null) {
        if (n > test.questions.length) sesDuyur(`Testte ${test.questions.length} soru var.`);
        else git(n - 1);
        return true;
      }
    }
    return false;
  });

  return (
    <section aria-labelledby="quiz-baslik" className="panel">
      <h2 id="quiz-baslik" ref={baslik} tabIndex={-1} className="panel-h">Pekiştirme Testi</h2>
      <p className="panel-alt">Belgeden çoktan seçmeli sorular hazırlayın ve öğrendiklerinizi sınayın.</p>

      <div className="row">
        <div role="group" aria-label="Zorluk" className="seg">
          {ZORLUK.map((z) => (
            <button key={z.id} type="button" aria-pressed={zorluk === z.id} disabled={calisiyor} onClick={() => setZorluk(z.id)}>{z.ad}</button>
          ))}
        </div>
        <div role="group" aria-label="Soru sayısı" className="seg">
          {ADETLER.map((n) => (
            <button key={n} type="button" aria-pressed={adet === n} disabled={calisiyor} onClick={() => setAdet(n)}>{n} soru</button>
          ))}
        </div>
        <button type="button" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor} onClick={() => olustur()}>
          {calisiyor && !test?.id ? "Hazırlanıyor…" : "Yeni test oluştur"}
        </button>
      </div>

      <div role="status" aria-live="polite">{durum && <p className="hint">{durum}</p>}</div>
      <div role="alert" aria-live="assertive">{hata && <p className="msg err">{hata}</p>}</div>

      {liste.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary>Önceki testler ({liste.length})</summary>
          <ul>
            {liste.map((t) => (
              <li key={t.id}>
                <button type="button" className="btn sec" onClick={() => ac(t.id)}>
                  {ZORLUK_AD[t.difficulty]} · {t.question_count} soru · {tarih(t.created_at)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {test && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 4px" }}>{ZORLUK_AD[test.difficulty]} test · {test.question_count} soru</h3>
          {denemeler.length > 0 && !sonuc && (
            <p className="hint">Önceki denemeleriniz: {denemeler.slice(0, 5).map((d) => `${d.score}/${d.total}`).join(", ")}</p>
          )}

          {sonuc && (
            <div role="status" className="msg ok">
              <h3 ref={sonucBaslik} tabIndex={-1} style={{ margin: 0 }}>
                {sonuc.total} sorudan {sonuc.score} tanesini doğru yaptınız.
              </h3>
              {!sonuc.saved && <p className="hint">Sonuç kaydedilemedi, ancak aşağıda görebilirsiniz.</p>}
            </div>
          )}

          {test.questions.map((q, i) => {
            const s = sonuc?.results[i];
            return (
              <fieldset key={i} id={`soru-${i}`} className={i === aktif && !sonuc ? "aktif-soru" : undefined}>
                <legend>Soru {i + 1}/{test.question_count}: {q.question}</legend>
                {q.options.map((o, j) => {
                  const dogruSik = s && s.answer === j;
                  const yanlisSecim = s && s.chosen === j && !s.correct;
                  return (
                    <label key={j} className={`opt${dogruSik ? " dogru" : ""}${yanlisSecim ? " yanlis" : ""}`}>
                      <input type="radio" name={`soru-${i}`} checked={cevaplar[i] === j} disabled={Boolean(sonuc) || calisiyor}
                        onChange={() => { setCevaplar((c) => c.map((v, k) => (k === i ? j : v))); setAktif(i); }} />
                      <span>
                        <strong>{harf(j)})</strong> {o}
                        {dogruSik && <strong> (Doğru cevap)</strong>}
                        {yanlisSecim && <strong> (Sizin cevabınız — yanlış)</strong>}
                      </span>
                    </label>
                  );
                })}
                {s && (
                  <p className="hint" style={{ marginTop: 8 }}>
                    {s.chosen === null ? "Bu soruyu boş bıraktınız. " : s.correct ? "Doğru. " : "Yanlış. "}
                    {s.explanation}
                  </p>
                )}
              </fieldset>
            );
          })}

          <div className="row" style={{ marginTop: 12 }}>
            {!sonuc && (
              <button type="button" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor} onClick={() => bitir()}>
                {calisiyor ? "Hesaplanıyor…" : "Testi bitir"}
              </button>
            )}
            {sonuc && (
              <button type="button" className="btn sec" onClick={() => testiAc(test)}>Aynı testi tekrar çöz</button>
            )}
            <button type="button" className="btn sec" disabled={calisiyor} onClick={() => sil()}>Testi sil</button>
          </div>
        </div>
      )}
      <p className="hint">Sorular yapay zekâ tarafından belgeden üretilir ve hata içerebilir; şüphe duyduğunuzda asıl metni kontrol edin.</p>
    </section>
  );
}
