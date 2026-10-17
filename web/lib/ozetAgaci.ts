// Özetin (sınırlı Markdown) ayrıştırılmış hali. Hem ekranda çizim (lib/markdown.tsx) hem de kelime listesi
// (sesli okuma vurgusu için eşleştirme) AYNI ağaçtan üretilir; böylece kelime numaraları her zaman tutarlıdır.

export type Parca = { kalin: boolean; metin: string };
export type Oge = { bosluk: string } | { no: number; parcalar: Parca[] };
export type Blok =
  | { tur: "baslik"; oge: Oge[] }
  | { tur: "liste"; maddeler: Oge[][] }
  | { tur: "paragraf"; oge: Oge[] };

function parcala(text: string): Parca[] {
  return text.split(/\*\*(.+?)\*\*/g)
    .map((p, i) => ({ kalin: i % 2 === 1, metin: p }))
    .filter((p) => p.metin !== "");
}

// Bir satırı kelimelere böler. **kalın** işaretleri kelimeyi bölmez: "**ATP**'nin" tek kelimedir (iki parçalı).
function ogeler(text: string, sayac: { n: number }): Oge[] {
  const parcalar = parcala(text);
  const tam = parcalar.map((p) => p.metin).join("");
  const sinir: { bas: number; son: number; p: Parca }[] = [];
  let o = 0;
  for (const p of parcalar) { sinir.push({ bas: o, son: o + p.metin.length, p }); o += p.metin.length; }
  const out: Oge[] = [];
  let onceki = 0;
  for (const m of tam.matchAll(/\S+/g)) {
    const bas = m.index ?? 0;
    const bit = bas + m[0].length;
    if (bas > onceki) out.push({ bosluk: tam.slice(onceki, bas) });
    const ps: Parca[] = [];
    for (const s of sinir) {
      const a = Math.max(bas, s.bas), b = Math.min(bit, s.son);
      if (a < b) ps.push({ kalin: s.p.kalin, metin: tam.slice(a, b) });
    }
    out.push({ no: sayac.n++, parcalar: ps });
    onceki = bit;
  }
  return out;
}

export function ozetAgaci(text: string): Blok[] {
  const bloklar: Blok[] = [];
  const sayac = { n: 0 };
  let liste: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (liste.length) { bloklar.push({ tur: "liste", maddeler: liste.map((li) => ogeler(li, sayac)) }); liste = []; }
  };
  const flushPara = () => {
    if (para.length) { bloklar.push({ tur: "paragraf", oge: ogeler(para.join(" "), sayac) }); para = []; }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const li = line.match(/^[-*•]\s+(.*)$/);
    if (h) { flushList(); flushPara(); bloklar.push({ tur: "baslik", oge: ogeler(h[1], sayac) }); }
    else if (li) { flushPara(); liste.push(li[1]); }
    else if (!line) { flushList(); flushPara(); }
    else { flushList(); para.push(line); }
  }
  flushList(); flushPara();
  return bloklar;
}

function sirala(oge: Oge[], out: string[]) {
  for (const o of oge) if ("no" in o) out.push(o.parcalar.map((p) => p.metin).join(""));
}

// Ekrandaki kelimeler, çizim sırasıyla (indeks = kelime numarası).
export function ozetKelimeleri(bloklar: Blok[]): string[] {
  const out: string[] = [];
  for (const b of bloklar) {
    if (b.tur === "liste") for (const m of b.maddeler) sirala(m, out);
    else sirala(b.oge, out);
  }
  return out;
}
