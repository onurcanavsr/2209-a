import Calisma from "./Calisma";
import Anasayfa from "./Anasayfa";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Girişli kullanıcı Çalışma Alanını, ziyaretçi tanıtım sayfasını görür
  return user ? <Calisma /> : <Anasayfa />;
}
