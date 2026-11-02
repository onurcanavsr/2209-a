import { Suspense } from "react";
import BelgeDetay from "./BelgeDetay";
import { getT } from "@/lib/i18n/server";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  // BelgeDetay, bölüm seçimi için URL parametrelerini (useSearchParams) okur
  return <Suspense fallback={<p>{t("Yükleniyor…")}</p>}><BelgeDetay id={id} /></Suspense>;
}
