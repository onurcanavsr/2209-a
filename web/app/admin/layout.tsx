import { getT } from "@/lib/i18n/server";

// Yönetim bağlantıları sol menüde (yalnızca yönetici hesabında) bulunur; burada yalnızca sayfa başlığı yer alır.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div>
      <h1>{t("Yönetim Paneli")}</h1>
      {children}
    </div>
  );
}
