"use client";
import { memo } from "react";

// Ham metni, her kelime <span data-w="n"> içinde olacak şekilde çizer (boşluklar ve satır sonları korunur).
// Kelime numaraları, metnin boşluğa göre bölünmüş sırasıdır: text.split(/\s+/).filter(Boolean)
function VurguluMetin({ text }: { text: string }) {
  let n = 0;
  return (
    <>
      {text.split(/(\s+)/).map((p, i) =>
        i % 2 === 1 || p === "" ? p : <span key={i} data-w={n++} className="k">{p}</span>
      )}
    </>
  );
}
export default memo(VurguluMetin);
