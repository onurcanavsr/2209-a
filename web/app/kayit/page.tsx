import Link from "next/link";
import KayitFormu from "./KayitFormu";
import { KAYIT_ACIK } from "@/lib/site";
import { getT } from "@/lib/i18n/server";

export default async function Kayit() {
  const { t } = await getT();
  if (!KAYIT_ACIK)
    return (
      <div className="card login">
        <h1>{t("Kayıt davetle yapılmaktadır")}</h1>
        <p>{t("Şu an yeni hesaplar yalnızca davet üzerine açılıyor. Davet aldıysanız e-postanızdaki bağlantıyı kullanın.")}</p>
        <p><Link href="/giris">{t("Giriş sayfasına dön")}</Link></p>
      </div>
    );
  return <KayitFormu />;
}
