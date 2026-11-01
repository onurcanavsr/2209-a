import { Suspense } from "react";
import BelgeDetay from "./BelgeDetay";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // BelgeDetay, bölüm seçimi için URL parametrelerini (useSearchParams) okur
  return <Suspense fallback={<p>Yükleniyor…</p>}><BelgeDetay id={id} /></Suspense>;
}
