import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fromAcceptLanguage, makeT, normLang, translate, sayiYaz, tarihYaz } from "./core";
import { EN } from "./en";
import { BOLUMLER, YONETIM } from "../bolumler";
import { DURUM } from "../api";
import { DENETIM_AD, EYLEM_AD } from "../admin";

describe("normLang / fromAcceptLanguage", () => {
  it("dil kodunu sadeleştirir", () => {
    expect(normLang("en")).toBe("en");
    expect(normLang("EN-us")).toBe("en");
    expect(normLang("en_GB")).toBe("en");
    expect(normLang("tr-TR")).toBe("tr");
    expect(normLang("de")).toBe("tr");
    expect(normLang(undefined)).toBe("tr");
    expect(normLang("")).toBe("tr");
  });
  it("Accept-Language'i kalite sırasına göre okur", () => {
    expect(fromAcceptLanguage("en-US,en;q=0.9,tr;q=0.8")).toBe("en");
    expect(fromAcceptLanguage("tr-TR,tr;q=0.9,en;q=0.8")).toBe("tr");
    expect(fromAcceptLanguage("de-DE,de;q=0.9,en;q=0.5")).toBe("en");
    expect(fromAcceptLanguage("fr-FR")).toBe("tr");
    expect(fromAcceptLanguage(null)).toBe("tr");
  });
});

describe("translate", () => {
  it("Türkçede metni olduğu gibi, İngilizcede karşılığını verir", () => {
    expect(translate("tr", "Belge bulunamadı.")).toBe("Belge bulunamadı.");
    expect(translate("en", "Belge bulunamadı.")).toBe("Document not found.");
  });
  it("değişkenleri doldurur", () => {
    expect(translate("en", "{n} soru", { n: 5 })).toBe("5 questions");
    expect(translate("tr", "{n} soru", { n: 5 })).toBe("5 soru");
    expect(makeT("en")("Hesap menüsü: {eposta}", { eposta: "a@b.c" })).toBe("Account menu: a@b.c");
  });
  it("bilinmeyen anahtarda Türkçe metne düşer (arayüz boş kalmaz) ve bilinmeyen değişkene dokunmaz", () => {
    expect(translate("en", "Hiç çevrilmemiş bir metin")).toBe("Hiç çevrilmemiş bir metin");
    expect(translate("en", "Merhaba {ad}")).toBe("Merhaba {ad}");
  });
  it("yerel biçimleri dile göre verir", () => {
    expect(sayiYaz("tr", 1234.5)).toBe("1.234,5");
    expect(sayiYaz("en", 1234.5)).toBe("1,234.5");
    expect(tarihYaz("en", "2026-03-04T10:00:00Z", { month: "long", timeZone: "UTC" })).toBe("March");
    expect(tarihYaz("tr", "2026-03-04T10:00:00Z", { month: "long", timeZone: "UTC" })).toBe("Mart");
  });
});

// ---- kapsam: koddaki her t("…") çağrısının İngilizcesi olmalı ----
const KOK = path.resolve(__dirname, "../..");
function gez(d: string): string[] {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (["node_modules", ".next"].includes(e.name) ? [] : gez(path.join(d, e.name))) : [path.join(d, e.name)]);
}
const KAYNAKLAR = [...gez(path.join(KOK, "app")), ...gez(path.join(KOK, "lib"))]
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith(path.join("i18n", "en.ts")) && !f.endsWith(path.join("i18n", "core.ts")));
const CAGRI = /\b(?:t|tl|tNow)\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

describe("çeviri kapsamı", () => {
  it("koddaki her t(\"…\") çağrısının İngilizce karşılığı var", () => {
    const eksik: string[] = [];
    let n = 0;
    for (const f of KAYNAKLAR) {
      const s = fs.readFileSync(f, "utf8");
      for (const m of s.matchAll(CAGRI)) {
        const anahtar = m[2].replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, "\n");
        n++;
        if (!(anahtar in EN)) eksik.push(`${path.relative(KOK, f)}: ${anahtar}`);
      }
    }
    expect(n).toBeGreaterThan(300);   // tarama gerçekten çalıştı
    expect(eksik).toEqual([]);
  });

  it("tablo olarak tutulan etiketlerin (menü, durum, eylem) İngilizcesi var", () => {
    const etiketler = [
      ...BOLUMLER.map((b) => b.ad), ...YONETIM.map((y) => y.ad), ...Object.values(DURUM),
      ...Object.values(EYLEM_AD), ...Object.values(DENETIM_AD),
    ];
    expect(etiketler.filter((e) => !(e in EN))).toEqual([]);
  });

  it("İngilizce karşılıklarda Türkçe harf kalmaz (özel adlar hariç) ve {değişkenler} korunur", () => {
    const hatali: string[] = [];
    for (const [tr, en] of Object.entries(EN)) {
      if (/[çğıöşüÇĞİÖŞÜ]/.test(en) && !/TÜBİTAK|Türk/.test(en)) hatali.push(`${tr} → ${en}`);
      const v = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      if (v(tr) !== v(en)) hatali.push(`değişken uyuşmuyor: ${tr} → ${en}`);
    }
    expect(hatali).toEqual([]);
  });
});
