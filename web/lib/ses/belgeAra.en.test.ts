import { describe, expect, it } from "vitest";
import { belgeAra, belgeFiil, type BelgeAday } from "./belgeAra";

const LISTE: BelgeAday[] = ["Internship_Report_Final.docx", "Physics-1 Lecture Notes.pdf", "Mitochondria_Slides.pptx", "IMG_0231.pdf"]
  .map((title, i) => ({ id: `d${i}`, title }));
const bul = (s: string) => {
  const r = belgeAra(s, LISTE, "en");
  return r.durum === "ok" ? r.belge.title : r.durum;
};

describe("belgeAra (İngilizce)", () => {
  it.each([
    ["internship report", "Internship_Report_Final.docx"],
    ["open the internship report", "Internship_Report_Final.docx"],
    ["open physics lecture notes", "Physics-1 Lecture Notes.pdf"],
    ["mitochondria slides", "Mitochondria_Slides.pptx"],
    ["delete the internship report", "Internship_Report_Final.docx"],
  ])("%s → %s", (s, b) => expect(bul(s)).toBe(b));

  it("sıra numarası ve 'last' ile", () => {
    expect(bul("open the first document")).toBe("Internship_Report_Final.docx");
    expect(bul("second file")).toBe("Physics-1 Lecture Notes.pdf");
    expect(bul("open the last document")).toBe("IMG_0231.pdf");
  });
  it("eşleşme yoksa 'yok'", () => expect(bul("quantum chemistry")).toBe("yok"));
  it("silme fiilini ayırt eder", () => {
    expect(belgeFiil("delete the internship report", "en")).toBe("sil");
    expect(belgeFiil("remove physics notes", "en")).toBe("sil");
    expect(belgeFiil("open the internship report", "en")).toBe("ac");
  });
});
