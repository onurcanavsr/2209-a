import GirisFormu from "./GirisFormu";
import { KAYIT_ACIK } from "@/lib/site";

export default async function Giris({ searchParams }: { searchParams: Promise<{ bilgi?: string; hata?: string }> }) {
  const sp = await searchParams;
  return <GirisFormu bilgi={sp.bilgi} hata={sp.hata} kayitAcik={KAYIT_ACIK} />;
}
