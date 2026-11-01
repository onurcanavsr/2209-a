import { describe, expect, it } from "vitest";
import { baslikOku, belgeAra, belgeFiil, type BelgeAday } from "./belgeAra";

const B = (title: string, i: number): BelgeAday => ({ id: `d${i}`, title });
const LISTE: BelgeAday[] = [
  "Staj_Raporu_Final.docx",
  "Fizik-1 Ders Notları.pdf",
  "Sunum_Mitokondri.pptx",
  "Kimya Laboratuvar Föyü.pdf",
  "IMG_0231.pdf",
].map(B);
const bul = (s: string, l = LISTE) => {
  const r = belgeAra(s, l);
  return r.durum === "ok" ? r.belge.title : r.durum;
};

describe("baslikOku", () => {
  it("uzantı ve ayraçları atar", () => {
    expect(baslikOku("Staj_Raporu_Final.docx")).toBe("Staj Raporu Final");
    expect(baslikOku("Fizik-1 Ders Notları.pdf")).toBe("Fizik 1 Ders Notları");
  });
});

describe("belgeAra", () => {
  it.each([
    ["staj raporu", "Staj_Raporu_Final.docx"],
    ["Staj raporunu aç", "Staj_Raporu_Final.docx"],            // çekim eki
    ["staj raporu dosyasını aç", "Staj_Raporu_Final.docx"],
    ["fizik ders notlarını aç", "Fizik-1 Ders Notları.pdf"],
    ["mitokondri sunumu", "Sunum_Mitokondri.pptx"],
    ["kimya föyünü aç", "Kimya Laboratuvar Föyü.pdf"],
    ["kimya laboratuvar", "Kimya Laboratuvar Föyü.pdf"],
    ["STAJ RAPORU", "Staj_Raporu_Final.docx"],
    ["staj rapuru", "Staj_Raporu_Final.docx"],                  // küçük tanıma hatası
  ])("%s → %s", (s, b) => expect(bul(s)).toBe(b));

  it("sıra numarasıyla (adı zor dosyalar için)", () => {
    expect(bul("birinci belgeyi aç")).toBe("Staj_Raporu_Final.docx");
    expect(bul("ikinci dosya")).toBe("Fizik-1 Ders Notları.pdf");
    expect(bul("son belgeyi aç")).toBe("IMG_0231.pdf");
    expect(bul("dokuzuncu belge")).toBe("yok");                 // listede yok
  });

  it("listede olmayanı açmaz", () => {
    expect(bul("matematik ödevi")).toBe("yok");
    expect(bul("staj defteri")).toBe("yok");
    expect(bul("aç")).toBe("yok");
    expect(bul("belgeyi aç")).toBe("yok");
  });

  it("sayılar tam eşleşmeli", () => {
    const l = ["Rapor 2024.pdf", "Rapor 2025.pdf"].map(B);
    expect(bul("rapor 2025", l)).toBe("Rapor 2025.pdf");
    expect(bul("rapor 2023", l)).toBe("yok");
  });

  it("benzer adlarda belirsiz döner, tahmin yürütmez", () => {
    const l = ["Staj Raporu Taslak.docx", "Staj Raporu Final.docx", "Fizik.pdf"].map(B);
    const r = belgeAra("staj raporu", l);
    expect(r.durum).toBe("belirsiz");
    if (r.durum === "belirsiz") expect(r.adaylar.map((a) => a.title)).toEqual(expect.arrayContaining(["Staj Raporu Taslak.docx", "Staj Raporu Final.docx"]));
    expect(bul("staj raporu final", l)).toBe("Staj Raporu Final.docx");   // ayırt edici sözcükle netleşir
  });

  it("boş liste", () => expect(bul("staj raporu", [])).toBe("yok"));
});

describe("belgeFiil", () => {
  it("silme fiilini ayırt eder", () => {
    expect(belgeFiil("staj raporunu sil")).toBe("sil");
    expect(belgeFiil("staj raporunu silin")).toBe("sil");
    expect(belgeFiil("staj raporunu aç")).toBe("ac");
    expect(belgeFiil("staj raporu")).toBe("ac");
  });
  it("silme sözü başlık eşleşmesini bozmaz", () => {
    expect(bul("staj raporunu sil")).toBe("Staj_Raporu_Final.docx");
  });
});
