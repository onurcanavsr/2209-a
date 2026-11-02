// Sol menüdeki belge bölümleri ve yönetim bağlantıları + küçük SVG simge kümesi (dış bağımlılık yok).

export type BolumId = "soru" | "ozet" | "test" | "dinle" | "metin" | "notlar" | "kartlar" | "imler";

export const BOLUMLER: { id: BolumId; ad: string; ikon: string }[] = [
  { id: "ozet", ad: "Özet", ikon: "ozet" },
  { id: "soru", ad: "Belgeye Soru Sor", ikon: "soru" },
  { id: "test", ad: "Pekiştirme Testi", ikon: "test" },
  { id: "dinle", ad: "Sesli Okuma", ikon: "dinle" },
  { id: "metin", ad: "Çıkarılan Metin", ikon: "metin" },
  { id: "notlar", ad: "Notlarım", ikon: "notlar" },
  { id: "kartlar", ad: "Öğrenme Kartları", ikon: "kartlar" },
  { id: "imler", ad: "Yer İmleri", ikon: "imler" },
];

export const BOLUM_IDLERI: string[] = BOLUMLER.map((b) => b.id);

export const YONETIM = [
  { href: "/admin", ad: "Genel bakış", ikon: "genel" },
  { href: "/admin/kullanicilar", ad: "Kullanıcılar", ikon: "kullanicilar" },
  { href: "/admin/kullanim", ad: "Kullanım ve maliyet", ikon: "kullanim" },
];

/** /belge/<id> yolundan belge kimliğini çıkarır; başka yolda null. */
export function belgeIdYoldan(yol: string | null): string | null {
  const m = /^\/belge\/([^/?#]+)/.exec(yol ?? "");
  return m ? m[1] : null;
}

const YOLLAR: Record<string, string> = {
  ana: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  soru: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z",
  ozet: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
  test: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  dinle: "M4 16v-4a8 8 0 0 1 16 0v4M4 15h3v5H4zM17 15h3v5h-3z",
  metin: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 16h4",
  notlar: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  kartlar: "M3 6h18v12H3zM3 10h18",
  imler: "M6 3h12v18l-6-4-6 4z",
  genel: "M4 20V10M10 20V4M16 20v-8M3 20h18",
  kullanicilar: "M16 20v-1a4 4 0 0 0-8 0v1M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  kullanim: "M12 3v18M16.5 7.5H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7.5",
  hesap: "M16 20v-1a4 4 0 0 0-8 0v1M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  dosya: "M6 3h9l4 4v14H6zM14 3v5h5",
};

export function Ikon({ ad }: { ad: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="ikon">
      <path d={YOLLAR[ad] ?? YOLLAR.dosya} />
    </svg>
  );
}
