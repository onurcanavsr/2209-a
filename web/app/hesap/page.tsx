import Link from "next/link";
import HesapSilme from "./HesapSilme";
import { createClient } from "@/lib/supabase/server";

export default async function Hesap() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <div className="prose">
      <h1>Hesabım</h1>
      <div className="card">
        <p><strong>E-posta:</strong> {user?.email}</p>
        <p><Link href="/parola-sifirla">Parolamı değiştir</Link> (e-postanıza bağlantı gönderilir)</p>
      </div>
      <h2>Hesabı sil</h2>
      <div className="card"><HesapSilme /></div>
    </div>
  );
}
