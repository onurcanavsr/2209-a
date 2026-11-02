import Link from "next/link";
import HesapSilme from "./HesapSilme";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";

export default async function Hesap() {
  const { t } = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <div className="prose">
      <h1>{t("Hesabım")}</h1>
      <div className="card">
        <p><strong>{t("E-posta:")}</strong> {user?.email}</p>
        <p><Link href="/parola-sifirla">{t("Parolamı değiştir")}</Link> {t("(e-postanıza bağlantı gönderilir)")}</p>
      </div>
      <h2>{t("Hesabı sil")}</h2>
      <div className="card"><HesapSilme /></div>
    </div>
  );
}
