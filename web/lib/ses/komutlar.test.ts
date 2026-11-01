import { describe, expect, it } from "vitest";
import { KOMUTLAR, esles, evetHayir, normalize, soruNoBul, testIstegi } from "./komutlar";
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
    // yeni arayüzdeki bölümlere geçiş (sol menü)
    ["teste git", "bolum.test"],
    ["pekiştirme testi bölümü", "bolum.test"],
    ["soru cevap bölümü", "bolum.soru"],
    ["notlarım", "bolum.notlar"],
    ["öğrenme kartları", "bolum.kartlar"],
    ["yer imleri", "bolum.imler"],
    ["çıkarılan metin", "bolum.metin"],
    ["metni dinle", "bolum.dinle"],
    ["özete git", "bolum.ozet"],
    // bölüm adıyla karışmaması gerekenler: bunlar test oluşturur / soru sorar
    ["pekiştirme testi", "test.olustur"],
    ["belgeye soru sor", "soru.sor"],
    ["soru sor", "soru.sor"],
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


describe("yeni komutlar: test, soru-cevap, çalışma alanı", () => {
  it.each([
    ["pekiştirme testi", "test.olustur"],
    ["Pekiştirme testi oluştur", "test.olustur"],
    ["bana bir test hazırla", "test.olustur"],
    ["soru sor", "soru.sor"],
    ["belgeye soru sor", "soru.sor"],
    ["cevabı oku", "cevap.oku"],
    ["belgeleri listele", "belge.listele"],
    ["dosya yükle", "belge.yukle"],
    ["çıkış yap", "cikis"],
    ["testi bitir", "test.bitir"],
    ["sonucu oku", "test.sonuc"],
    ["yanlışları oku", "test.yanlis"],
    ["sonraki soru", "test.sonraki"],
    ["soruyu oku", "test.oku"],
    ["belgeyi sil", "belge.sil"],
  ])("%s → %s", (s, beklenen) => expect(id(s)).toBe(beklenen));

  it.each([
    ["a şıkkı", "sik.1"], ["A", "sik.1"], ["birinci şık", "sik.1"], ["birinci", "sik.1"],
    ["b şıkkı", "sik.2"], ["be şıkkı", "sik.2"], ["ikinci şık", "sik.2"],
    ["c şıkkı", "sik.3"], ["üçüncü", "sik.3"],
    ["d şıkkı", "sik.4"], ["de şıkkı", "sik.4"], ["dördüncü şık", "sik.4"], ["4", "sik.4"],
  ])("şık: %s → %s", (s, beklenen) => expect(id(s)).toBe(beklenen));

  it("be/de/ce şıkları birbirine karışırsa tahmin etmez", () => {
    // tanıyıcı "ge şıkkı" gibi hiçbirine tam uymayan bir şey duyarsa belirsiz ya da yok döner; asla rastgele şık seçmez
    const r = esles("ge şıkkı", HEPSI);
    expect(r.durum === "ok" ? "ok" : r.durum).not.toBe("ok");
  });

  it("test komutları yalnızca test açıkken uygun sayılır", () => {
    const sadeceGenel = HEPSI.filter((x) => !x.startsWith("sik.") && !x.startsWith("test."));
    expect(id("a şıkkı", sadeceGenel)).toBe("yok");
  });
});

describe("evetHayir", () => {
  it.each([["evet", "evet"], ["Evet.", "evet"], ["evet sil", "evet"], ["onaylıyorum", "evet"], ["tamam", "evet"],
    ["hayır", "hayir"], ["vazgeç", "hayir"], ["iptal", "hayir"], ["istemiyorum", "hayir"]])(
    "%s → %s", (s, b) => expect(evetHayir(s)).toBe(b));
  it("belirsizde işlem yapmaz", () => {
    expect(evetHayir("evet hayır")).toBeNull();
    expect(evetHayir("belki")).toBeNull();
    expect(evetHayir("")).toBeNull();
    expect(evetHayir("silinsin mi")).toBeNull();     // sorunun kendisini duyarsa onay sayılmaz
  });
});

describe("testIstegi", () => {
  it("adet ve zorluğu ayrıştırır", () => {
    expect(testIstegi("10 soruluk zor test oluştur")).toEqual({ adet: 10, zorluk: "hard" });
    expect(testIstegi("beş soruluk kolay test")).toEqual({ adet: 5, zorluk: "easy" });
    expect(testIstegi("orta zorlukta test hazırla")).toEqual({ zorluk: "medium" });
    expect(testIstegi("on soru sor test yap")).toEqual({ adet: 10 });
  });
  it("parametre yoksa sabit komuta bırakır", () => {
    expect(testIstegi("pekiştirme testi oluştur")).toBeNull();
    expect(testIstegi("kısa özet çıkar")).toBeNull();
    expect(testIstegi("kolay")).toBeNull();           // test/fiil yok: yalnızca zorluk komutu
  });
});

describe("soruNoBul", () => {
  it("numarayı bulur", () => {
    expect(soruNoBul("3. soruya git")).toBe(3);
    expect(soruNoBul("üçüncü soru")).toBe(3);
    expect(soruNoBul("beşinci soruya geç")).toBe(5);
    expect(soruNoBul("soru 2")).toBe(2);
  });
  it("soru sözü yoksa karışmaz", () => {
    expect(soruNoBul("birinci şık")).toBeNull();
    expect(soruNoBul("3")).toBeNull();
  });
});

describe("komut ifadeleri: bölüm geçişi ile diğer komutlar çakışmaz", () => {
  it("aynı ifade iki farklı komutta bulunmaz", () => {
    const sahip = new Map<string, string>();
    const cakisan: string[] = [];
    for (const k of KOMUTLAR) {
      for (const f of k.ifadeler) {
        const n = normalize(f);
        const onceki = sahip.get(n);
        if (onceki && onceki !== k.id) cakisan.push(`"${f}": ${onceki} / ${k.id}`);
        sahip.set(n, k.id);
      }
    }
    expect(cakisan).toEqual([]);
  });
  it("her bölüm komutu yalnızca kendi bölümüne gider", () => {
    const bolumler = ["soru", "ozet", "test", "dinle", "metin", "notlar", "kartlar", "imler"];
    expect(KOMUTLAR.filter((k) => k.id.startsWith("bolum.")).map((k) => k.id.slice(6)).sort()).toEqual([...bolumler].sort());
  });
});
