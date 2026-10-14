import Link from "next/link";
import KayitFormu from "./KayitFormu";
import { KAYIT_ACIK } from "@/lib/site";

export default function Kayit() {
  if (!KAYIT_ACIK)
    return (
      <div className="card login">
        <h1>Kayıt davetle yapılmaktadır</h1>
        <p>Şu an yeni hesaplar yalnızca davet üzerine açılıyor. Davet aldıysanız e-postanızdaki bağlantıyı kullanın.</p>
        <p><Link href="/giris">Giriş sayfasına dön</Link></p>
      </div>
    );
  return <KayitFormu />;
}
