import { describe, expect, it } from "vitest";
import { KOMUTLAR, esles, normalize } from "./komutlar";
import { calistir, kaydet, uygunIdler } from "./kayit";

const HEPSI = KOMUTLAR.map((k) => k.id);
const id = (s: string, uygun: string[] = HEPSI) => {
  const r = esles(s, uygun);
  return r.durum === "ok" ? r.id : r.durum;
};

describe("normalize", () => {
  it("Türkçe büyük/küçük harf ve aksanları sadeleştirir", () => {
    expect(normalize("ÖZETLE")).toBe("ozetle");
    expect(normalize("İLERİ SAR")).toBe("ileri sar");
    expect(normalize("Çalışma  Alanı!")).toBe("calisma alani");
    expect(normalize("  ığüşöç ")).toBe("igusoc");
  });
});

describe("esles: doğru komutu bulur", () => {
  it.each([
    ["özetle", "ozet.olustur"],
    ["Özetle.", "ozet.olustur"],
    ["özetle lütfen", "ozet.olustur"],
    ["özetler misin", "ozet.olustur"],        // çekimli biçim: "özetler" ≈ "özetle"
    ["kısa özet", "ozet.kisa"],
    ["ayrıntılı özet çıkar", "ozet.ayrintili"],
    ["oku", "oku.baslat"],
    ["devam et", "oku.baslat"],
    ["durdur", "oku.durdur"],
    ["dur", "oku.durdur"],
    ["ileri sar", "oku.ileri"],
    ["10 saniye geri", "oku.geri"],
    ["sonraki bölüm", "oku.sonraki"],
    ["daha hızlı", "oku.hizli"],
    ["koyu tema", "tema.koyu"],
    ["çalışma alanına git", "git.calisma"],
    ["yardım", "yardim"],
    ["bana kısa özet çıkar şimdi", "ozet.kisa"],
  ])("%s → %s", (s, beklenen) => expect(id(s)).toBe(beklenen));

  it("tanıyıcı küçük hata yapsa da bulur", () => {
    expect(id("ozetleye")).toBe("ozet.olustur");
    expect(id("durdurr")).toBe("oku.durdur");
    expect(id("ayrintili ozet")).toBe("ozet.ayrintili");
  });

  it("uzun cümle içinde geçen çok sözcüklü ifadeyi yakalar", () => {
    expect(id("şimdi lütfen ileri sar biraz")).toBe("oku.ileri");
  });
});

describe("esles: yanlış komut çalıştırmaz", () => {
  it("boş girdi", () => {
    expect(id("")).toBe("bos");
    expect(id(" .  ")).toBe("bos");
    expect(id("lütfen")).toBe("bos");
  });
  it("alakasız cümle", () => {
    expect(id("bugün hava çok güzel")).toBe("yok");
    expect(id("abone ol")).toBe("yok");
  });
  it("benzer ama farklı kısa sözcükler", () => {
    expect(id("tur")).toBe("yok");   // "dur" değil
    expect(id("olu")).toBe("yok");   // "oku" değil
  });
  it("yalnızca o an uygun olan komutlara bakar", () => {
    expect(id("oku", ["git.calisma", "yardim"])).toBe("yok");
    expect(id("özetle", ["ozet.olustur"])).toBe("ozet.olustur");
  });
  it("ileri ve geri karışmaz", () => {
    expect(id("ileri sar")).toBe("oku.ileri");
    expect(id("geri sar")).toBe("oku.geri");
  });
});

describe("kayıt defteri", () => {
  it("kayıt silinince komut uygun olmaktan çıkar", () => {
    const sil = kaydet("test.a", () => {});
    expect(uygunIdler().has("test.a")).toBe(true);
    sil();
    expect(uygunIdler().has("test.a")).toBe(false);
  });
  it("false dönen işleyici komutu sıradakine bırakır; önce yüksek öncelik denenir", async () => {
    const sira: string[] = [];
    const s1 = kaydet("test.b", () => { sira.push("dusuk"); }, 1);
    const s2 = kaydet("test.b", () => { sira.push("yuksek-red"); return false; }, 2);
    expect(await calistir("test.b")).toBe(true);
    expect(sira).toEqual(["yuksek-red", "dusuk"]);
    s1(); s2();
    expect(await calistir("test.b")).toBe(false);
  });
});
