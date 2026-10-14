import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <section className="card">
      <h1>Çalışma Alanı</h1>
      <p>Giriş yapıldı: {user?.email}</p>
      <p>Belge yükleme ve özetleme sonraki fazlarda eklenecek.</p>
    </section>
  );
}
