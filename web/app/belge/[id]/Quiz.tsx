"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, hataMesaji } from "@/lib/api";

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

  async function listeyiYukle() {
    try {
      const r = await apiFetch(`/api/documents/${docId}/quizzes`);
      if (r.ok) setListe(await r.json());
    } catch {}
  }
  useEffect(() => { listeyiYukle(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [docId]);

  function testiAc(t: Test) {
    setTest(t); setCevaplar(t.questions.map(() => null)); setSonuc(null); setHata("");
    setTimeout(() => baslik.current?.focus(), 50);
  }

  async function olustur() {
    setHata(""); setSonuc(null); setCalisiyor(true); setDurum("Test hazırlanıyor, bu yarım dakika kadar sürebilir…");
    try {
      const r = await apiFetch(`/api/documents/${docId}/quizzes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: adet, difficulty: zorluk }),
      });
      if (!r.ok) { setHata(await hataMesaji(r, "Test hazırlanamadı.")); setDurum(""); setCalisiyor(false); return; }
      const t: Test = await r.json();
      setDenemeler([]); testiAc(t); setDurum(`Test hazır: ${t.question_count} soru.`);
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

  async function bitir() {
    if (!test) return;
    const bos = cevaplar.filter((c) => c === null).length;
    if (bos > 0 && !window.confirm(`${bos} soruyu boş bıraktınız. Yine de bitirmek istiyor musunuz?`)) return;
    setHata(""); setCalisiyor(true);
    try {
      const r = await apiFetch(`/api/quizzes/${test.id}/attempts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: cevaplar }),
      });
      if (!r.ok) { setHata(await hataMesaji(r, "Sonuç hesaplanamadı.")); setCalisiyor(false); return; }
      setSonuc(await r.json());
      setTimeout(() => sonucBaslik.current?.focus(), 50);
      const d = await apiFetch(`/api/quizzes/${test.id}/attempts`);
      if (d.ok) setDenemeler(await d.json());
    } catch { setHata("Sunucuya ulaşılamadı."); }
    setCalisiyor(false);
  }

  async function sil() {
    if (!test || !window.confirm("Bu test silinsin mi?")) return;
    const r = await apiFetch(`/api/quizzes/${test.id}`, { method: "DELETE" });
    if (!r.ok) { setHata(await hataMesaji(r, "Test silinemedi.")); return; }
    setTest(null); setSonuc(null); setDurum("Test silindi."); listeyiYukle();
  }

  return (
    <section aria-labelledby="quiz-baslik" className="card" style={{ margin: "20px 0" }}>
      <h2 id="quiz-baslik" ref={baslik} tabIndex={-1} style={{ marginTop: 0 }}>Pekiştirme testi</h2>

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
        <button type="button" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor} onClick={olustur}>
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
              <fieldset key={i}>
                <legend>Soru {i + 1}/{test.question_count}: {q.question}</legend>
                {q.options.map((o, j) => {
                  const dogruSik = s && s.answer === j;
                  const yanlisSecim = s && s.chosen === j && !s.correct;
                  return (
                    <label key={j} className={`opt${dogruSik ? " dogru" : ""}${yanlisSecim ? " yanlis" : ""}`}>
                      <input type="radio" name={`soru-${i}`} checked={cevaplar[i] === j} disabled={Boolean(sonuc) || calisiyor}
                        onChange={() => setCevaplar((c) => c.map((v, k) => (k === i ? j : v)))} />
                      <span>
                        {o}
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
              <button type="button" className="btn" style={{ width: "auto", margin: 0 }} disabled={calisiyor} onClick={bitir}>
                {calisiyor ? "Hesaplanıyor…" : "Testi bitir"}
              </button>
            )}
            {sonuc && (
              <button type="button" className="btn sec" onClick={() => testiAc(test)}>Aynı testi tekrar çöz</button>
            )}
            <button type="button" className="btn sec" disabled={calisiyor} onClick={sil}>Testi sil</button>
          </div>
        </div>
      )}
      <p className="hint">Sorular yapay zekâ tarafından belgeden üretilir ve hata içerebilir; şüphe duyduğunuzda asıl metni kontrol edin.</p>
    </section>
  );
}
