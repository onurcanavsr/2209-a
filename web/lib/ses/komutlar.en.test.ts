import { describe, expect, it } from "vitest";
import { KOMUTLAR, esles, evetHayir, komutlari, normalize, soruNoBul, testIstegi } from "./komutlar";
import { KOMUTLAR_EN } from "./komutlar.en";

const HEPSI = KOMUTLAR.map((k) => k.id);
const id = (s: string, uygun: string[] = HEPSI, lang: "tr" | "en" = "en") => {
  const r = esles(s, uygun, lang);
  return r.durum === "ok" ? r.id : r.durum;
};

describe("İngilizce komut tablosu", () => {
  it("Türkçe tablodaki her komutun İngilizcesi var, fazladan kimlik yok", () => {
    expect(HEPSI.filter((i) => !(i in KOMUTLAR_EN))).toEqual([]);
    expect(Object.keys(KOMUTLAR_EN).filter((i) => !HEPSI.includes(i))).toEqual([]);
  });
  it("her komutun adı ve en az bir ifadesi var; komutlari('en') İngilizce ifadeleri döndürür", () => {
    for (const k of komutlari("en")) {
      expect(k.ad.length, k.id).toBeGreaterThan(2);
      expect(k.ifadeler.length, k.id).toBeGreaterThan(0);
    }
    expect(komutlari("en").find((k) => k.id === "ozet.olustur")?.ifadeler[0]).toBe("summarize");
    expect(komutlari("tr").find((k) => k.id === "ozet.olustur")?.ifadeler[0]).toBe("özetle");
  });
  it("aynı normalleştirilmiş ifade iki farklı komuta ait olmaz (belirsizlik yaratır)", () => {
    const gorulen = new Map<string, string>();
    const cakisan: string[] = [];
    for (const k of komutlari("en")) {
      for (const f of k.ifadeler) {
        const n = normalize(f);
        const onceki = gorulen.get(n);
        if (onceki && onceki !== k.id) cakisan.push(`"${f}": ${onceki} / ${k.id}`);
        gorulen.set(n, k.id);
      }
    }
    expect(cakisan).toEqual([]);
  });
});

describe("esles (İngilizce)", () => {
  it.each([
    ["summarize", "ozet.olustur"],
    ["Summarize, please.", "ozet.olustur"],
    ["could you summarize", "ozet.olustur"],
    ["short summary", "ozet.kisa"],
    ["detailed summary", "ozet.ayrintili"],
    ["read", "oku.baslat"],
    ["resume", "oku.baslat"],
    ["stop", "oku.durdur"],
    ["pause", "oku.durdur"],
    ["fast forward", "oku.ileri"],
    ["rewind", "oku.geri"],
    ["next section", "oku.sonraki"],
    ["previous section", "oku.onceki"],
    ["faster", "oku.hizli"],
    ["slow down", "oku.yavas"],
    ["dark mode", "tema.koyu"],
    ["light theme", "tema.acik"],
    ["go to workspace", "git.calisma"],
    ["my account", "git.hesap"],
    ["help", "yardim"],
    ["what can I say", "yardim"],
    ["sign out", "cikis"],
    ["my notes", "bolum.notlar"],
    ["flashcards", "bolum.kartlar"],
    ["bookmarks", "bolum.imler"],
    ["go to quiz", "bolum.test"],
    ["practice quiz", "test.olustur"],
    ["ask a question", "soru.sor"],
    ["option b", "sik.2"],
    ["a", "sik.1"],
    ["bee", "sik.2"],
    ["see", "sik.3"],
    ["fourth option", "sik.4"],
    ["next question", "test.sonraki"],
    ["finish quiz", "test.bitir"],
    ["delete quiz", "test.sil"],
    ["delete document", "belge.sil"],
    ["list my documents", "belge.listele"],
    ["switch to turkish", "dil.tr"],
    ["switch to English", "dil.en"],
  ])("%s → %s", (s, beklenen) => expect(id(s)).toBe(beklenen));

  it("tanıyıcı küçük hata yapsa da bulur", () => {
    expect(id("summarise")).toBe("ozet.olustur");
    expect(id("sumarize")).toBe("ozet.olustur");
    expect(id("pauze")).toBe("oku.durdur");
  });

  it("yalnızca bağlamda geçerli komutlar arasından seçer", () => {
    expect(id("next", ["oku.sonraki", "test.sonraki"])).toBe("oku.sonraki");
    expect(id("summarize", ["oku.baslat"])).not.toBe("ozet.olustur");
  });

  it("Türkçe modda İngilizce, İngilizce modda Türkçe komut tanınmaz (dil karışmaz)", () => {
    expect(id("özetle", HEPSI, "en")).not.toBe("ozet.olustur");
    expect(id("summarize", HEPSI, "tr")).not.toBe("ozet.olustur");
    expect(id("özetle", HEPSI, "tr")).toBe("ozet.olustur");
  });
});

describe("evetHayir / testIstegi / soruNoBul (İngilizce)", () => {
  it("evet-hayır", () => {
    expect(evetHayir("yes", "en")).toBe("evet");
    expect(evetHayir("Yes, please", "en")).toBe("evet");
    expect(evetHayir("yeah", "en")).toBe("evet");
    expect(evetHayir("no", "en")).toBe("hayir");
    expect(evetHayir("cancel", "en")).toBe("hayir");
    expect(evetHayir("yes no", "en")).toBeNull();
    expect(evetHayir("maybe", "en")).toBeNull();
    expect(evetHayir("evet", "tr")).toBe("evet");
  });
  it("parametreli test isteği", () => {
    expect(testIstegi("create a ten question hard quiz", "en")).toEqual({ adet: 10, zorluk: "hard" });
    expect(testIstegi("make a 5 question easy quiz", "en")).toEqual({ adet: 5, zorluk: "easy" });
    expect(testIstegi("start a medium quiz", "en")).toEqual({ zorluk: "medium" });
    expect(testIstegi("hello there", "en")).toBeNull();
    expect(testIstegi("10 soruluk zor test oluştur")).toEqual({ adet: 10, zorluk: "hard" });
  });
  it("soru numarası", () => {
    expect(soruNoBul("go to question 3", "en")).toBe(3);
    expect(soruNoBul("third question", "en")).toBe(3);
    expect(soruNoBul("question seven", "en")).toBe(7);
    expect(soruNoBul("the weather today", "en")).toBeNull();
    expect(soruNoBul("3. soruya git")).toBe(3);
  });
});
