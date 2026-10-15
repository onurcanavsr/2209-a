import type { ReactNode } from "react";

// Güvenli, küçük Markdown çevirici: yalnızca başlık (##), madde (-) ve **kalın**.
// HTML üretmez (dangerouslySetInnerHTML yok), ekran okuyucu için gerçek h3/ul/li kullanır.
function inline(text: string, key: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={`${key}-${i}`}>{part}</strong> : part
  );
}

export function Ozet({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = (k: number) => {
    if (list.length) {
      out.push(<ul key={`u${k}`}>{list.map((li, i) => <li key={i}>{inline(li, `l${k}-${i}`)}</li>)}</ul>);
      list = [];
    }
  };
  const flushPara = (k: number) => {
    if (para.length) { out.push(<p key={`p${k}`}>{inline(para.join(" "), `p${k}`)}</p>); para = []; }
  };
  text.split("\n").forEach((raw, k) => {
    const line = raw.trim();
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const li = line.match(/^[-*•]\s+(.*)$/);
    if (h) { flushList(k); flushPara(k); out.push(<h3 key={`h${k}`}>{inline(h[1], `h${k}`)}</h3>); }
    else if (li) { flushPara(k); list.push(li[1]); }
    else if (!line) { flushList(k); flushPara(k); }
    else { flushList(k); para.push(line); }
  });
  flushList(9999); flushPara(9999);
  return <>{out}</>;
}
