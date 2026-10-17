import { Fragment, type ReactNode } from "react";
import { ozetAgaci, type Oge, type Parca } from "./ozetAgaci";

// Güvenli, küçük Markdown çevirici: yalnızca başlık (##), madde (-) ve **kalın**.
// HTML üretmez (dangerouslySetInnerHTML yok), ekran okuyucu için gerçek h3/ul/li kullanır.
// Ayrıştırma lib/ozetAgaci.ts'tedir; kelime vurgusu (sesli okuma) için aynı ağaçtan kelime numaraları üretilir.

function parcalar(ps: Parca[]): ReactNode[] {
  return ps.map((p, i) => (p.kalin ? <strong key={i}>{p.metin}</strong> : p.metin));
}

function Ogeler({ oge, kelimeler }: { oge: Oge[]; kelimeler: boolean }) {
  return (
    <>
      {oge.map((o, i) =>
        "bosluk" in o ? o.bosluk
        : kelimeler ? <span key={i} data-w={o.no} className="k">{parcalar(o.parcalar)}</span>
        : <Fragment key={i}>{parcalar(o.parcalar)}</Fragment>
      )}
    </>
  );
}

// kelimeler=true: her kelime <span data-w="n"> içine alınır (okunan kelimeyi işaretlemek için).
export function Ozet({ text, kelimeler = false }: { text: string; kelimeler?: boolean }) {
  return (
    <>
      {ozetAgaci(text).map((b, k) =>
        b.tur === "baslik" ? <h3 key={k}><Ogeler oge={b.oge} kelimeler={kelimeler} /></h3>
        : b.tur === "liste" ? <ul key={k}>{b.maddeler.map((m, i) => <li key={i}><Ogeler oge={m} kelimeler={kelimeler} /></li>)}</ul>
        : <p key={k}><Ogeler oge={b.oge} kelimeler={kelimeler} /></p>
      )}
    </>
  );
}
