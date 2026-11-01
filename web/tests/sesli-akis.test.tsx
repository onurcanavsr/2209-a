// @vitest-environment jsdom
/** Sesli akışlar: bileşenleri gerçekten çizip komutları kayıt defteri üzerinden çalıştırır (tarayıcı/mikrofon yok,
 *  tanıma sonrası aşama). Amaç: hook bağlantıları, eski durum yakalama ve duyuruların doğru çalışması. */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calistir, dikteAl, duyuruAyarla, metinDene, uygunIdler } from "@/lib/ses/kayit";

const apiFetch = vi.fn();
const push = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  hataMesaji: async () => "hata",
  DURUM: { processing: "işleniyor", ready: "hazır", failed: "başarısız" },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import Quiz from "../app/belge/[id]/Quiz";
import SoruCevap from "../app/belge/[id]/SoruCevap";
import Calisma from "../app/Calisma";

const yanit = (govde: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => govde });
let duyurular: string[] = [];
let sil: () => void;

beforeEach(() => {
  apiFetch.mockReset(); push.mockReset(); duyurular = [];
  sil = duyuruAyarla((m) => duyurular.push(m));
});
afterEach(() => { sil(); cleanup(); dikteAl(); });

const TEST = {
  id: "t1", difficulty: "medium", question_count: 3, created_at: "2026-10-31T10:00:00Z",
  questions: [
    { question: "Mitokondrinin görevi nedir?", options: ["Enerji üretimi", "Protein sentezi", "Lipit depolama", "Işık emilimi"] },
    { question: "Hücre zarı neyden oluşur?", options: ["Selüloz", "Fosfolipit", "Nişasta", "Kitin"] },
    { question: "Ribozom nerede bulunur?", options: ["Çekirdekte", "Sitoplazmada", "Zarda", "Hepsinde"] },
  ],
};

describe("pekiştirme testi: baştan sona sesle", () => {
  function testApi(sonucDogru = 1) {
    apiFetch.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url.endsWith("/quizzes") && init?.method === "POST") return yanit(TEST);
      if (url.endsWith("/quizzes")) return yanit([]);
      if (url.endsWith("/attempts") && init?.method === "POST") {
        return yanit({ score: sonucDogru, total: 3, saved: true, results: [
          { index: 0, chosen: 1, correct: false, answer: 0, explanation: "Mitokondri enerji üretir." },
          { index: 1, chosen: null, correct: false, answer: 1, explanation: "Zar fosfolipitten oluşur." },
          { index: 2, chosen: 1, correct: true, answer: 1, explanation: "Sitoplazmada." },
        ] });
      }
      return yanit([]);
    });
  }

  it("test oluştur → şık seç → gezin → bitir → sonucu oku", async () => {
    testApi();
    render(<Quiz docId="d1" />);
    await waitFor(() => expect(uygunIdler().has("test.olustur")).toBe(true));
    expect(uygunIdler().has("sik.1")).toBe(false);                  // test yokken şık komutu uygun değil

    await act(async () => { await calistir("test.olustur"); });
    await waitFor(() => expect(duyurular.some((d) => d.startsWith("Test hazır: 3 soru"))).toBe(true));
    expect(duyurular.at(-1)).toContain("Soru 1 / 3. Mitokondrinin görevi nedir?");
    expect(duyurular.at(-1)).toContain("A: Enerji üretimi. B: Protein sentezi");
    await waitFor(() => expect(uygunIdler().has("sik.1")).toBe(true));

    // B şıkkı → işaretlenir ve sıradaki soru okunur
    await act(async () => { await calistir("sik.2"); });
    expect(duyurular.at(-1)).toMatch(/^B şıkkı işaretlendi\. Soru 2 \/ 3\. Hücre zarı/);
    const ilk = screen.getAllByRole("radio").slice(0, 4);
    expect((ilk[1] as HTMLInputElement).checked).toBe(true);

    // "üçüncü soruya git" serbest cümlesi
    await act(async () => { expect(await metinDene("üçüncü soruya git")).toBe(true); });
    expect(duyurular.at(-1)).toContain("Soru 3 / 3. Ribozom");
    expect(await act(async () => metinDene("yedinci soruya git"))).toBe(true);
    expect(duyurular.at(-1)).toBe("Testte 3 soru var.");

    // son soruda B: 2. soru boş kaldı
    await act(async () => { await calistir("sik.2"); });
    expect(duyurular.at(-1)).toContain("Son soruydu. 1 soru boş.");

    // bitir: boş soru olduğundan sesli onay ister
    await act(async () => { await calistir("test.bitir"); });
    const d = dikteAl()!;
    expect(d.istem).toContain("1 soruyu boş bıraktınız");
    await act(async () => { await d.uygula("belki"); });             // belirsiz yanıt: işlem yapılmaz
    expect(duyurular.at(-1)).toContain("anlaşılamadı");
    expect(apiFetch.mock.calls.some(([u, i]) => String(u).endsWith("/attempts") && i?.method === "POST")).toBe(false);

    await act(async () => { await calistir("test.bitir"); });
    await act(async () => { await dikteAl()!.uygula("evet"); });
    await waitFor(() => expect(duyurular.at(-1)).toContain("3 sorudan 1 tanesini doğru yaptınız"));
    expect(duyurular.at(-1)).toContain("soru 1, 2");

    // sonuç ekranında yeni komutlar; şık komutları artık yok
    await waitFor(() => expect(uygunIdler().has("test.yanlis")).toBe(true));
    expect(uygunIdler().has("sik.1")).toBe(false);
    await act(async () => { await calistir("test.yanlis"); });
    expect(duyurular.at(-1)).toContain("Doğru cevap A: Enerji üretimi");
    expect(duyurular.at(-1)).toContain("Boş bırakmıştınız");
  });

  it("parametreli istek: '10 soruluk zor test oluştur' doğru sayı ve zorlukla gider", async () => {
    testApi();
    render(<Quiz docId="d1" />);
    await waitFor(() => expect(uygunIdler().has("test.olustur")).toBe(true));
    await act(async () => { expect(await metinDene("10 soruluk zor test oluştur")).toBe(true); });
    await waitFor(() => expect(duyurular.some((d) => d.startsWith("Test hazır"))).toBe(true));
    const post = apiFetch.mock.calls.find(([u, i]) => String(u).endsWith("/quizzes") && i?.method === "POST")!;
    expect(JSON.parse(post[1].body)).toEqual({ count: 10, difficulty: "hard" });
  });

  it("testi silmek sesli onay ister", async () => {
    testApi();
    render(<Quiz docId="d1" />);
    await waitFor(() => expect(uygunIdler().has("test.olustur")).toBe(true));
    await act(async () => { await calistir("test.olustur"); });
    await waitFor(() => expect(uygunIdler().has("test.sil")).toBe(true));
    await act(async () => { await calistir("test.sil"); });
    await act(async () => { await dikteAl()!.uygula("hayır"); });
    expect(duyurular.at(-1)).toBe("Vazgeçildi.");
    expect(apiFetch.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false);
  });
});

describe("belgeye soru sorma: sesle", () => {
  it("'soru sor' bir takip konuşması ister, cevap sesli duyurulur", async () => {
    const enc = new TextEncoder();
    apiFetch.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url.endsWith("/ask")) {
        return { ok: true, body: new ReadableStream({ start(c) {
          c.enqueue(enc.encode('data: {"type":"delta","text":"Enerji **üretir**."}\n\n'));
          c.enqueue(enc.encode('data: {"type":"done","sources":[]}\n\n'));
          c.close();
        } }) };
      }
      return yanit([]);
    });
    render(<SoruCevap docId="d1" />);
    await waitFor(() => expect(uygunIdler().has("soru.sor")).toBe(true));
    expect(uygunIdler().has("cevap.oku")).toBe(false);               // henüz cevap yok

    await act(async () => { await calistir("soru.sor"); });
    const d = dikteAl()!;
    expect(d.istem).toBe("Sorunuzu söyleyin.");
    await act(async () => { await d.uygula("Mitokondrinin görevi nedir"); });
    await waitFor(() => expect(duyurular.some((x) => x.startsWith("Cevap hazır."))).toBe(true));
    expect(duyurular.at(-1)).toBe("Cevap hazır. Enerji üretir .");   // biçim işaretleri temizlenmiş
    const post = apiFetch.mock.calls.find(([u]) => String(u).endsWith("/ask"))!;
    expect(JSON.parse(post[1].body)).toEqual({ question: "Mitokondrinin görevi nedir" });

    await waitFor(() => expect(uygunIdler().has("cevap.oku")).toBe(true));
    await act(async () => { await calistir("cevap.oku"); });
    expect(duyurular.at(-1)).toContain("Soru: Mitokondrinin görevi nedir. Cevap: Enerji üretir");
  });
});

describe("çalışma alanı: belge adıyla açma", () => {
  const DOCS = [
    { id: "d1", title: "Staj_Raporu_Final.docx", kind: "docx", status: "ready", created_at: "2026-10-30T10:00:00Z", page_count: 4, char_count: 9000, error: null },
    { id: "d2", title: "Fizik-1 Ders Notları.pdf", kind: "pdf", status: "ready", created_at: "2026-10-29T10:00:00Z", page_count: 10, char_count: 20000, error: null },
    { id: "d3", title: "Staj Raporu Taslak.docx", kind: "docx", status: "ready", created_at: "2026-10-28T10:00:00Z", page_count: 3, char_count: 5000, error: null },
  ];
  function api() {
    apiFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (init?.method === "DELETE") return yanit({});
      if (url === "/api/documents") return yanit(DOCS);
      return yanit([]);
    });
  }

  it("adı söyleyince açar; listeler; olmayanı açmaz", async () => {
    api();
    render(<Calisma />);
    await waitFor(() => expect(screen.getByText("Fizik-1 Ders Notları.pdf")).toBeTruthy());

    await act(async () => { expect(await metinDene("fizik ders notlarını aç")).toBe(true); });
    expect(push).toHaveBeenCalledWith("/belge/d2");
    expect(duyurular.at(-1)).toBe("“Fizik 1 Ders Notları” açılıyor.");

    push.mockClear();
    await act(async () => { expect(await metinDene("matematik ödevi")).toBe(false); });
    expect(push).not.toHaveBeenCalled();

    await act(async () => { await calistir("belge.listele"); });
    expect(duyurular.at(-1)).toContain("3 belgeniz var. 1. Staj Raporu Final, hazır. 2. Fizik 1 Ders Notları");
  });

  it("benzer adlarda hangisi olduğunu sorar", async () => {
    api();
    render(<Calisma />);
    await waitFor(() => expect(screen.getByText("Fizik-1 Ders Notları.pdf")).toBeTruthy());
    await act(async () => { expect(await metinDene("staj raporu")).toBe(true); });
    expect(push).not.toHaveBeenCalled();                              // tahmin yürütmez
    const d = dikteAl()!;
    expect(d.istem).toContain("Birden çok belge eşleşti");
    await act(async () => { await d.uygula("taslak olan"); });
    expect(push).toHaveBeenCalledWith("/belge/d3");
  });

  it("silme: evet derse siler, belirsizse silmez", async () => {
    api();
    render(<Calisma />);
    await waitFor(() => expect(screen.getByText("Fizik-1 Ders Notları.pdf")).toBeTruthy());
    await act(async () => { expect(await metinDene("fizik ders notlarını sil")).toBe(true); });
    let d = dikteAl()!;
    expect(d.istem).toContain("Fizik 1 Ders Notları” silinsin mi");
    await act(async () => { await d.uygula("sanırım"); });
    expect(apiFetch.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false);

    await act(async () => { await metinDene("fizik ders notlarını sil"); });
    d = dikteAl()!;
    await act(async () => { await d.uygula("evet"); });
    expect(apiFetch.mock.calls.filter(([, i]) => i?.method === "DELETE").map(([u]) => u)).toEqual(["/api/documents/d2"]);
  });
});
